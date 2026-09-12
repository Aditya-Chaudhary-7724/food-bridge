-- ==============================================================================
-- FoodBridge Phase 3 foundation: organization_id protection + pickup self-assignment
-- Migration: 20260904000001_org_protection_and_pickup_assignment.sql
--
-- PART 1 — SECURITY FIX: profiles.organization_id was not protected.
--
-- trg_protect_profile_fields (20260825000003_rls_authorization.sql) only
-- reverts role/id/created_at for non-admins. profiles_update RLS only checks
-- id = auth.uid(), so any authenticated user could directly
-- UPDATE profiles SET organization_id = '<any existing org id>' and
-- immediately inherit that organization's RLS-scoped visibility into
-- ngo_requirements, pickups, and organization-matched donations — a
-- cross-tenant read, entirely bypassing every Server Action. This extends
-- the existing trigger with the same pattern already used for role/id/
-- created_at. Organization linking becomes admin-only, consistent with
-- organizations.is_verified already defaulting to false pending admin
-- action. A self-service org-join/invite flow is a separate product
-- decision, not implemented here.
--
-- PART 2 — NEW CAPABILITY: no logistics user could ever become assigned to
-- a pickup. claim_donation() (20260825000004) creates pickups with
-- logistics_user_id = NULL. pickups_select/pickups_update RLS for the
-- logistics role both require logistics_user_id = auth.uid(), and
-- protect_pickup_fields explicitly blocks a logistics user from setting
-- that column — so an unassigned pickup was invisible and unclaimable to
-- every logistics user; only admin could assign one. This adds
-- assign_pickup_to_logistics(), an atomic SECURITY DEFINER RPC mirroring
-- claim_donation()'s exact pattern (row lock, status check, role check).
--
-- PART 3 — RLS EXTENSION (required for Part 2 to be usable): pickups_select
-- gives the logistics role visibility only into pickups already assigned to
-- them (logistics_user_id = auth.uid()), so there was no RLS-permitted way
-- for a logistics user to ever discover an unassigned pickup's id to call
-- assign_pickup_to_logistics() on it in the first place. This adds one
-- narrow OR clause: a logistics user may also see 'scheduled' pickups with
-- no logistics_user_id yet — visibility into unclaimed work, not into any
-- other organization's assigned/in-progress pickups. This is the minimal
-- extension needed to make Part 2 reachable at all.
-- ==============================================================================

-- ── PART 1 ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_current_user_role() IS DISTINCT FROM 'admin'::user_role THEN
    NEW.role            = OLD.role;
    NEW.id              = OLD.id;
    NEW.created_at      = OLD.created_at;
    NEW.organization_id = OLD.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger definition/name/timing are unchanged; CREATE OR REPLACE above is
-- sufficient since the trigger already points at this function by OID.

-- ── PART 2 ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_pickup_to_logistics(
  p_pickup_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup RECORD;
  v_caller_role user_role;
BEGIN
  -- 1. Verify caller identity and authorization
  v_caller_role := public.get_current_user_role();

  IF v_caller_role IS DISTINCT FROM 'logistics'::user_role
     AND v_caller_role IS DISTINCT FROM 'admin'::user_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized',
      'message', 'Only logistics users can accept pickups');
  END IF;

  -- 2. Atomic lock + status/assignment check
  SELECT id, status, logistics_user_id
  INTO v_pickup
  FROM public.pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found',
      'message', 'Pickup not found');
  END IF;

  IF v_pickup.logistics_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_assigned',
      'message', 'This pickup has already been accepted by another logistics user');
  END IF;

  IF v_pickup.status != 'scheduled'::pickup_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status',
      'message', 'This pickup is no longer available to accept');
  END IF;

  -- 3. Assign
  UPDATE public.pickups
  SET logistics_user_id = auth.uid(),
      status = 'driver_assigned'::pickup_status,
      updated_at = now()
  WHERE id = p_pickup_id;

  RETURN jsonb_build_object(
    'success', true,
    'pickup_id', p_pickup_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_pickup_to_logistics(UUID) FROM anon;

-- ── PART 3 ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS pickups_select ON public.pickups;

CREATE POLICY pickups_select ON public.pickups
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    -- Logistics: assigned to them, OR unclaimed work available to accept
    (public.get_current_user_role() = 'logistics'::user_role AND (
      logistics_user_id = auth.uid()
      OR (status = 'scheduled'::pickup_status AND logistics_user_id IS NULL)
    ))
    OR
    -- NGO: own organization's pickups
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id())
    OR
    -- Donor: pickups for their donations
    EXISTS (
      SELECT 1 FROM public.donations d
      WHERE d.id = pickups.donation_id
        AND d.donor_id = auth.uid()
    )
  );

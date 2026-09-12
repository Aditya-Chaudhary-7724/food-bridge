-- ==============================================================================
-- FoodBridge: add a real, secure VOLUNTEER role
-- Migration: 20260906000001_add_volunteer_role_support.sql
--
-- CONTEXT: the user_role enum already contains 'volunteer' (confirmed live:
-- donor, ngo, volunteer, admin, logistics — a v0-bootstrap leftover that
-- 20260902000002's dynamic-cast fix in handle_new_user() already accepts
-- without error). A volunteer could register and log in, but no RLS policy
-- granted the role any access at all, and no application code modeled it —
-- an authentication-only role with no product behavior. This migration
-- gives it a real, narrowly-scoped purpose: pickup/delivery execution.
--
-- REUSED RATHER THAN ADDED: pickups.volunteer_id already exists (uuid,
-- nullable, FK -> profiles(id) ON DELETE SET NULL) and was completely
-- unused by any application code or RLS policy. No new column is needed —
-- this migration only wires it up. logistics_user_id is untouched and
-- keeps its existing meaning (the logistics coordinator responsible for
-- the pickup); volunteer_id is the person actually executing it.
--
-- SECURITY MODEL:
--   - A volunteer may SELECT/UPDATE only pickups where volunteer_id =
--     auth.uid() (mirrors the logistics_user_id-ownership pattern already
--     used for pickups_update).
--   - A volunteer may SELECT the donation belonging to a pickup they are
--     assigned to (mirrors logistics_assigned_to_donation(), which already
--     does exactly this for logistics).
--   - protect_pickup_fields() is extended so a volunteer can only ever
--     change status/notes/actual_pickup_at/actual_delivery_at/
--     estimated_duration_minutes on their own row — every other field,
--     including logistics_user_id and volunteer_id itself, is
--     unconditionally reverted. Unlike logistics_user_id's protection,
--     there is no trusted-marker exception in the volunteer branch: no RPC
--     is ever called BY a volunteer to set either assignment field, so
--     there is no legitimate case to exempt.
--   - Only the pickup's own assigned logistics_user_id (or admin) may
--     assign a volunteer, via a new SECURITY DEFINER RPC
--     (assign_volunteer_to_pickup), which also validates the target user
--     actually has the volunteer role and the pickup hasn't already
--     ended. A volunteer can never self-assign — pickups_update's WITH
--     CHECK requires volunteer_id = auth.uid() to already be true, which
--     is exactly what the volunteer is trying to create by self-assigning,
--     so a raw client UPDATE attempting this is rejected by RLS itself.
--   - A volunteer's WITH CHECK further restricts status to the subset
--     {in_transit, completed, failed} — defense in depth on top of the
--     application-layer transition-graph check (lib/services/pickup-
--     lifecycle.ts), which validates the full from/to legality exactly as
--     it already does for logistics (no DB-level CHECK constraint governs
--     the transition graph for ANY role today — that split of
--     responsibility is pre-existing and intentionally unchanged here).
--
-- list_available_volunteers(): profiles_select RLS (auth.uid() = id OR
-- admin) does not let a logistics user browse other profiles at all, and
-- widening it is out of scope (profiles RLS hardening was explicitly
-- deferred in an earlier security pass, unrelated to this change). Rather
-- than broaden that policy, this migration adds one narrow, audited
-- SECURITY DEFINER RPC that returns only id+full_name for role='volunteer'
-- profiles, restricted to logistics/admin callers — enough to build a real
-- (non-placeholder) volunteer picker without exposing email/phone/any
-- other profile field or any other role's profiles.
-- ==============================================================================

-- 1. Helper: does the current volunteer have a pickup for this donation?
-- Mirrors logistics_assigned_to_donation() exactly, one field different.
CREATE OR REPLACE FUNCTION public.volunteer_assigned_to_donation(p_donation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pickups p
    WHERE p.donation_id = p_donation_id AND p.volunteer_id = auth.uid()
  );
$$;

-- 2. donations_select: let a volunteer read the donation behind their pickup.
DROP POLICY IF EXISTS donations_select ON public.donations;
CREATE POLICY donations_select ON public.donations
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR donor_id = auth.uid()
    OR (public.get_current_user_role() = 'ngo'::user_role AND (status = 'available'::donation_status OR organization_id = public.get_current_user_org_id()))
    OR (public.get_current_user_role() = 'logistics'::user_role AND public.logistics_assigned_to_donation(id))
    OR (public.get_current_user_role() = 'volunteer'::user_role AND public.volunteer_assigned_to_donation(id))
  );

-- 3. pickups_select: let a volunteer read their own assigned pickups only.
DROP POLICY IF EXISTS pickups_select ON public.pickups;
CREATE POLICY pickups_select ON public.pickups
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR (public.get_current_user_role() = 'logistics'::user_role AND (logistics_user_id = auth.uid() OR (status = 'scheduled'::pickup_status AND logistics_user_id IS NULL)))
    OR (public.get_current_user_role() = 'ngo'::user_role AND organization_id = public.get_current_user_org_id())
    OR public.donor_owns_donation(donation_id)
    OR (public.get_current_user_role() = 'volunteer'::user_role AND volunteer_id = auth.uid())
  );

-- 4. pickups_update: let a volunteer update their own assigned pickup, and
-- restrict what status value they may write to as defense in depth (the
-- full transition-graph legality check remains the application layer's
-- job, same as it already is for logistics).
DROP POLICY IF EXISTS pickups_update ON public.pickups;
CREATE POLICY pickups_update ON public.pickups
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR (public.get_current_user_role() = 'logistics'::user_role AND logistics_user_id = auth.uid())
    OR (public.get_current_user_role() = 'volunteer'::user_role AND volunteer_id = auth.uid())
  )
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR (public.get_current_user_role() = 'logistics'::user_role AND logistics_user_id = auth.uid())
    OR (
      public.get_current_user_role() = 'volunteer'::user_role
      AND volunteer_id = auth.uid()
      AND status = ANY (ARRAY['in_transit'::pickup_status, 'completed'::pickup_status, 'failed'::pickup_status])
    )
  );

-- 5. protect_pickup_fields(): protect volunteer_id from a raw logistics
-- update (only the trusted assignment RPC may set it), and add a full
-- volunteer branch protecting every field except the lifecycle ones.
CREATE OR REPLACE FUNCTION public.protect_pickup_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_current_user_role() = 'logistics'::user_role THEN
    NEW.donation_id          = OLD.donation_id;
    NEW.organization_id      = OLD.organization_id;
    NEW.pickup_address       = OLD.pickup_address;
    NEW.pickup_location      = OLD.pickup_location;
    NEW.destination_address  = OLD.destination_address;
    NEW.destination_location = OLD.destination_location;
    NEW.scheduled_at         = OLD.scheduled_at;
    NEW.created_at           = OLD.created_at;

    -- logistics_user_id and volunteer_id are both protected except for
    -- the one narrow, trusted case: assign_pickup_to_logistics() or
    -- assign_volunteer_to_pickup() names this exact row via the same
    -- transaction-local marker immediately before its own single-field
    -- UPDATE (see 20260905000005_fix_pickup_assignment_trigger.sql for
    -- the original marker and its security analysis, unchanged here).
    IF current_setting('app.assigning_pickup_id', true) IS DISTINCT FROM NEW.id::text THEN
      NEW.logistics_user_id = OLD.logistics_user_id;
      NEW.volunteer_id      = OLD.volunteer_id;
    END IF;
  ELSIF public.get_current_user_role() = 'volunteer'::user_role THEN
    -- A volunteer may only change status/notes/actual_pickup_at/
    -- actual_delivery_at/estimated_duration_minutes on their own row
    -- (pickups_update RLS already restricts which row). Every other
    -- field is unconditionally reverted — no trusted-marker exception
    -- exists here, because no RPC is ever called BY a volunteer to set
    -- logistics_user_id or volunteer_id.
    NEW.donation_id          = OLD.donation_id;
    NEW.organization_id      = OLD.organization_id;
    NEW.pickup_address       = OLD.pickup_address;
    NEW.pickup_location      = OLD.pickup_location;
    NEW.destination_address  = OLD.destination_address;
    NEW.destination_location = OLD.destination_location;
    NEW.scheduled_at         = OLD.scheduled_at;
    NEW.created_at           = OLD.created_at;
    NEW.logistics_user_id    = OLD.logistics_user_id;
    NEW.volunteer_id         = OLD.volunteer_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. assign_volunteer_to_pickup(): the only path that sets pickups.volunteer_id.
-- Mirrors assign_pickup_to_logistics()'s structure (role check, row lock,
-- status check, trusted marker, single-field UPDATE).
CREATE OR REPLACE FUNCTION public.assign_volunteer_to_pickup(
  p_pickup_id UUID,
  p_volunteer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup RECORD;
  v_caller_role user_role;
  v_target_role user_role;
BEGIN
  -- 1. Verify caller identity and authorization.
  v_caller_role := public.get_current_user_role();

  IF v_caller_role IS DISTINCT FROM 'logistics'::user_role
     AND v_caller_role IS DISTINCT FROM 'admin'::user_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized',
      'message', 'Only logistics accounts can assign a volunteer to a pickup');
  END IF;

  -- 2. Atomic lock + ownership/status check.
  SELECT id, status, logistics_user_id
  INTO v_pickup
  FROM public.pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found',
      'message', 'Pickup not found');
  END IF;

  IF v_caller_role = 'logistics'::user_role AND v_pickup.logistics_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized',
      'message', 'You can only assign volunteers to pickups you are responsible for');
  END IF;

  IF v_pickup.status IN ('completed'::pickup_status, 'cancelled'::pickup_status, 'failed'::pickup_status) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status',
      'message', 'This pickup has already ended and can no longer be assigned');
  END IF;

  -- 3. Validate the target user exists and is actually a volunteer.
  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_volunteer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found',
      'message', 'That user could not be found');
  END IF;

  IF v_target_role IS DISTINCT FROM 'volunteer'::user_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_role',
      'message', 'The assigned user must have the volunteer role');
  END IF;

  -- 4. Assign — mark this exact row as the one legitimate trusted
  -- assignment for the rest of this transaction, then perform it.
  PERFORM set_config('app.assigning_pickup_id', p_pickup_id::text, true);

  UPDATE public.pickups
  SET volunteer_id = p_volunteer_id,
      updated_at = now()
  WHERE id = p_pickup_id;

  -- Defense in depth on top of the transaction-local auto-clear.
  PERFORM set_config('app.assigning_pickup_id', '', true);

  RETURN jsonb_build_object(
    'success', true,
    'pickup_id', p_pickup_id,
    'volunteer_id', p_volunteer_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_volunteer_to_pickup(UUID, UUID) FROM anon;

-- 7. list_available_volunteers(): the minimum read needed to build a real
-- volunteer picker, without widening profiles_select. Returns only
-- id+full_name, only for role='volunteer' profiles, only to logistics/admin.
CREATE OR REPLACE FUNCTION public.list_available_volunteers()
RETURNS TABLE (id UUID, full_name TEXT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_current_user_role() NOT IN ('logistics'::user_role, 'admin'::user_role) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.full_name
    FROM public.profiles p
    WHERE p.role = 'volunteer'::user_role
    ORDER BY p.full_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_available_volunteers() FROM anon;

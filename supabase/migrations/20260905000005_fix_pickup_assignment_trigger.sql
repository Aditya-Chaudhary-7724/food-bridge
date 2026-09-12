-- ==============================================================================
-- FoodBridge Bugfix: assign_pickup_to_logistics() cannot actually persist
-- logistics_user_id
-- Migration: 20260905000005_fix_pickup_assignment_trigger.sql
--
-- ROOT CAUSE (confirmed by live reproduction): protect_pickup_fields()
-- (20260825000003_rls_authorization.sql) unconditionally reverts
-- logistics_user_id to its old value whenever the caller's role is
-- 'logistics'. That rule made sense when only admin could assign pickups.
-- assign_pickup_to_logistics() (20260904000001) is *called by* a logistics
-- user to legitimately set that same field — the trigger cannot distinguish
-- "the trusted RPC is deliberately assigning this" from "a raw client is
-- trying to self-reassign", since both present identically as "caller role
-- = logistics". The trigger fires regardless of SECURITY DEFINER (triggers
-- are not bypassed by a function's privilege context, only RLS is), so
-- every call has silently reverted logistics_user_id back to NULL while
-- status still advanced to 'driver_assigned' (status is not in the
-- trigger's protected list) — producing an inconsistent, non-functional
-- assignment on every single invocation since that RPC was introduced.
--
-- NOTE: pickups_update RLS is not involved in this bug at all.
-- assign_pickup_to_logistics() is SECURITY DEFINER, owned by postgres (the
-- same owner as the pickups table), so its internal UPDATE bypasses RLS
-- entirely by table ownership — the trigger is the only thing standing in
-- its way. No RLS policy is touched by this migration.
--
-- FIX: a transaction-local, row-scoped trusted marker.
-- assign_pickup_to_logistics() calls
--   set_config('app.assigning_pickup_id', p_pickup_id::text, true)
-- immediately before its own UPDATE. protect_pickup_fields() only skips
-- reverting logistics_user_id when that marker's value exactly matches the
-- row currently being updated (NEW.id) — every other protected field
-- (donation_id, organization_id, pickup_address, pickup_location,
-- destination_address, destination_location, scheduled_at, created_at)
-- remains unconditionally protected, unchanged from before.
--
-- SECURITY ANALYSIS — why a PostgREST/API client cannot exploit this marker
-- (verified against the live project, not assumed):
--   - set_config()'s third argument (is_local = true) scopes the setting to
--     the CURRENT TRANSACTION ONLY; Postgres clears it automatically at
--     COMMIT or ROLLBACK regardless of whether the underlying physical
--     connection is later reused by a connection pooler for an unrelated
--     request. It cannot leak between requests.
--   - PostgREST wraps every request (whether a table operation or an RPC
--     call) in exactly one transaction and exposes no way for a client to
--     sequence "call function A, then run raw statement B" within that one
--     transaction — there is no raw-SQL or multi-statement capability on
--     the REST/RPC surface.
--   - set_config() itself is not callable via the exposed API: confirmed
--     empirically with a live request to
--     POST {project_url}/rest/v1/rpc/set_config, which returned
--     404 PGRST202 "Could not find the function public.set_config(...) in
--     the schema cache" — PostgREST only auto-exposes functions from its
--     configured schemas (public here), never pg_catalog, so there is no
--     RPC path to this builtin at all.
--   - The marker is compared against NEW.id, not used as a bare boolean —
--     even in a hypothetical future where multiple rows were touched in one
--     transaction, only the one specific row named by the marker would be
--     exempted, never a blanket "logistics may edit anything right now."
--   - The marker exempts exactly one column (logistics_user_id). It does
--     not touch RLS, does not grant INSERT/DELETE, and does not affect any
--     other protected field, table, or role.
--   - A direct client .update({logistics_user_id: ...}) call never runs
--     inside assign_pickup_to_logistics(), so it can never cause this
--     marker to be set — the marker is only ever set by this one function,
--     immediately before the one UPDATE it protects, and is explicitly
--     cleared immediately after as defense in depth (on top of the
--     transaction-local auto-clear).
-- ==============================================================================

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

    -- logistics_user_id is protected too, EXCEPT for the one narrow,
    -- trusted case: assign_pickup_to_logistics() names this exact row via
    -- a transaction-local marker immediately before this exact UPDATE.
    IF current_setting('app.assigning_pickup_id', true) IS DISTINCT FROM NEW.id::text THEN
      NEW.logistics_user_id = OLD.logistics_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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

  -- 3. Assign — mark this exact row as the one legitimate trusted
  -- assignment for the rest of this transaction, then perform it.
  PERFORM set_config('app.assigning_pickup_id', p_pickup_id::text, true);

  UPDATE public.pickups
  SET logistics_user_id = auth.uid(),
      status = 'driver_assigned'::pickup_status,
      updated_at = now()
  WHERE id = p_pickup_id;

  -- Defense in depth on top of the transaction-local auto-clear.
  PERFORM set_config('app.assigning_pickup_id', '', true);

  RETURN jsonb_build_object(
    'success', true,
    'pickup_id', p_pickup_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_pickup_to_logistics(UUID) FROM anon;

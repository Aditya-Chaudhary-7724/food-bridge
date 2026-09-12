-- ==============================================================================
-- FoodBridge: self-service NGO organization onboarding
-- Migration: 20260907000001_ngo_organization_onboarding.sql
--
-- CONTEXT: an NGO account can register and log in with profiles.role='ngo'
-- but profiles.organization_id is NULL until something links it — there
-- was previously no way to do that except a manual/admin DB edit, and the
-- earlier RLS-hardening pass explicitly deferred this ("organization
-- self-service onboarding") as its own follow-up. This migration is that
-- follow-up.
--
-- FINDING (confirmed live before writing this): organizations_insert's
-- WITH CHECK is bare `true` — ANY authenticated user, any role, can
-- currently INSERT an arbitrary organizations row directly via the client
-- SDK, bypassing whatever role check application code adds. A legacy
-- duplicate ("Authenticated users can create organizations") has the same
-- unrestricted WITH CHECK and would independently re-permit this even if
-- only the non-legacy policy were tightened (multiple permissive policies
-- OR together — same class of gap as the donations/pickups legacy-policy
-- finding fixed by 20260905000003). This is directly in scope here (unlike
-- the *other* organizations/profiles/notifications legacy-policy findings,
-- which remain a deliberately separate, deferred piece of work) because
-- it is the exact policy governing the exact operation this migration
-- implements. SELECT/UPDATE/DELETE on organizations are untouched.
--
-- MODEL: organizations has no owner/creator column (confirmed: no such
-- field exists), so "created an org" and "is linked to an org" are the
-- same fact — profiles.organization_id — with no additional ownership
-- table needed. create_organization_and_link_profile() does both halves
-- (insert the organization, link the caller's own profile) atomically:
--   - Only an 'ngo' caller may call it.
--   - The caller's own profile row is locked (FOR UPDATE) before the
--     organization_id-IS-NULL check, so two concurrent calls (double
--     click, two tabs, a retried request) serialize on that lock — the
--     second one sees organization_id already set once the first commits
--     and returns 'already_linked' instead of creating a second
--     organization. No unique constraint is needed for this: the lock is
--     on the row being conditionally updated, which is exactly the
--     resource double-submission needs protecting.
--   - protect_profile_fields() unconditionally reverts organization_id
--     for any non-admin caller (see 20260825000003_rls_authorization.sql)
--     — extended here with the same transaction-local trusted-marker
--     pattern already used for pickups.logistics_user_id/volunteer_id
--     (20260905000005, 20260906000001): only this RPC's own UPDATE,
--     immediately preceded by naming the exact profile row via the
--     marker, is exempted. role/id/created_at remain unconditionally
--     protected with no exception — this RPC has no reason to touch them.
-- ==============================================================================

-- 1. Close the organizations_insert gap (role-gate it), removing the
-- legacy duplicate that would otherwise still permit the same thing.
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS organizations_insert ON public.organizations;
CREATE POLICY organizations_insert ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR public.get_current_user_role() = 'ngo'::user_role
  );

-- 2. Extend profile field protection with the same trusted-marker pattern
-- already used for pickup assignment.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_current_user_role() IS DISTINCT FROM 'admin'::user_role THEN
    NEW.role       = OLD.role;
    NEW.id         = OLD.id;
    NEW.created_at = OLD.created_at;

    -- organization_id is protected too, except for the one narrow,
    -- trusted case: create_organization_and_link_profile() names this
    -- exact profile row via a transaction-local marker immediately
    -- before its own single-field UPDATE.
    IF current_setting('app.linking_organization_profile_id', true) IS DISTINCT FROM NEW.id::text THEN
      NEW.organization_id = OLD.organization_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. The only path that creates an organization for, and links it to, the
-- calling NGO's own profile.
CREATE OR REPLACE FUNCTION public.create_organization_and_link_profile(
  p_name TEXT,
  p_address TEXT,
  p_description TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_daily_capacity_kg NUMERIC DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role user_role;
  v_profile RECORD;
  v_org_id UUID;
BEGIN
  -- 1. Verify caller identity and authorization.
  v_caller_role := public.get_current_user_role();

  IF v_caller_role IS DISTINCT FROM 'ngo'::user_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized',
      'message', 'Only NGO accounts can set up an organization this way');
  END IF;

  -- 2. Lock the caller's own profile row and check it isn't already
  -- linked — this is both the authorization check and the concurrency
  -- guard against double submission.
  SELECT id, organization_id
  INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found',
      'message', 'Your profile could not be found');
  END IF;

  IF v_profile.organization_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_linked',
      'message', 'Your account is already linked to an organization');
  END IF;

  -- 3. Create the organization. type is always 'ngo' — never taken from
  -- the caller, this RPC only ever runs for an 'ngo' caller.
  INSERT INTO public.organizations (
    name, type, address, description, contact_email, contact_phone, daily_capacity_kg, latitude, longitude
  )
  VALUES (
    p_name,
    'ngo'::organization_type,
    p_address,
    p_description,
    p_contact_email,
    p_contact_phone,
    COALESCE(p_daily_capacity_kg, 0),
    p_latitude,
    p_longitude
  )
  RETURNING id INTO v_org_id;

  -- 4. Link — mark this exact profile row as the one legitimate trusted
  -- link for the rest of this transaction, then perform it.
  PERFORM set_config('app.linking_organization_profile_id', auth.uid()::text, true);

  UPDATE public.profiles
  SET organization_id = v_org_id,
      updated_at = now()
  WHERE id = auth.uid();

  -- Defense in depth on top of the transaction-local auto-clear.
  PERFORM set_config('app.linking_organization_profile_id', '', true);

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_organization_and_link_profile(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, DOUBLE PRECISION, DOUBLE PRECISION) FROM anon;

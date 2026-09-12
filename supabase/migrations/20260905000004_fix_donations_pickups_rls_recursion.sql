-- ==============================================================================
-- FoodBridge Security Fix: break RLS recursion between donations_select and
-- pickups_select
-- Migration: 20260905000004_fix_donations_pickups_rls_recursion.sql
--
-- ROOT CAUSE (confirmed by live reproduction under genuine RLS enforcement —
-- SET LOCAL ROLE authenticated, not the postgres/table-owner connection used
-- by every prior diagnostic in this project, which silently bypasses RLS
-- entirely and never exercised this path):
--
--   donations_select's logistics branch:
--     EXISTS (SELECT 1 FROM public.pickups p
--             WHERE p.donation_id = donations.id AND p.logistics_user_id = auth.uid())
--
--   pickups_select's donor branch:
--     EXISTS (SELECT 1 FROM public.donations d
--             WHERE d.id = pickups.donation_id AND d.donor_id = auth.uid())
--
-- To plan a query against either table, Postgres must expand the other
-- table's own RLS policy to evaluate that inline subquery. Expanding
-- pickups_select's policy re-references donations, re-expanding
-- donations_select, which re-references pickups — an unconditional cycle at
-- policy-expansion time, independent of the caller's actual role. This
-- reproduces on the simplest possible query (a donor selecting their own
-- donation by id) with: ERROR 42P17 infinite recursion detected in policy
-- for relation "donations". Both branches were already present, unmodified,
-- in the original 20260825000003_rls_authorization.sql — this predates
-- every change made in this project's later sessions.
--
-- FIX: replace each inline cross-table EXISTS with a SECURITY DEFINER
-- helper function, the identical pattern already established by
-- public.get_current_user_role() / public.get_current_user_org_id() for
-- safely reading `profiles` from other tables' policies without recursion.
-- A SECURITY DEFINER function owned by the table owner (postgres, which
-- owns every application table here) queries that table with RLS bypassed
-- by ownership — exactly as get_current_user_role() already does against
-- profiles — which breaks the recursive expansion while preserving
-- identical authorization semantics.
--
-- SECURITY PROPERTIES of both new functions (verified against the same
-- checklist used for the existing helpers):
--   - LANGUAGE sql, STABLE, SECURITY DEFINER, SET search_path = public —
--     byte-for-byte the same declaration shape as get_current_user_role()/
--     get_current_user_org_id() (confirmed via pg_get_functiondef before
--     writing this migration).
--   - RETURNS boolean only — no row data, no column values, ever returned.
--   - Take a single typed uuid parameter bound by the query planner, not
--     string-interpolated — no dynamic SQL, no EXECUTE, no user-controlled
--     identifiers.
--   - Read-only (a single SELECT EXISTS), never modify data.
--   - Use auth.uid() as the only identity input — a caller can only ever
--     learn "is this donation/pickup mine", never enumerate or read anyone
--     else's rows; the boolean gives no signal distinguishing
--     "belongs to someone else" from "does not exist".
--   - Owned by postgres (same owner as get_current_user_role()/
--     get_current_user_org_id() and as the donations/pickups tables
--     themselves), which is what makes the internal RLS-bypass safe and
--     correct rather than a privilege escalation.
--   - No REVOKE added, matching the exact precedent of
--     get_current_user_role()/get_current_user_org_id() (default grants:
--     PUBLIC/anon/authenticated/postgres/service_role) — these are
--     read-only boolean checks with no side effects and no data exposure
--     beyond the caller's own ownership relationship to an id they already
--     hold, unlike claim_donation()/assign_pickup_to_logistics() (mutating,
--     explicitly REVOKEd from anon).
--
-- ONLY the two recursive branches are replaced. No other branch of either
-- policy, and no other policy on any table, is touched. donations_select's
-- admin/donor_id/ngo branches and pickups_select's admin/logistics-own/
-- ngo-own-org/donor-own-donation branches are otherwise character-for-
-- character unchanged.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.donor_owns_donation(p_donation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.donations d
    WHERE d.id = p_donation_id AND d.donor_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.logistics_assigned_to_donation(p_donation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pickups p
    WHERE p.donation_id = p_donation_id AND p.logistics_user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS donations_select ON public.donations;

CREATE POLICY donations_select ON public.donations
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    donor_id = auth.uid()
    OR
    (public.get_current_user_role() = 'ngo'::user_role AND (
      status = 'available'::donation_status
      OR organization_id = public.get_current_user_org_id()
    ))
    OR
    (public.get_current_user_role() = 'logistics'::user_role AND public.logistics_assigned_to_donation(donations.id))
  );

DROP POLICY IF EXISTS pickups_select ON public.pickups;

CREATE POLICY pickups_select ON public.pickups
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'logistics'::user_role AND (
      logistics_user_id = auth.uid()
      OR (status = 'scheduled'::pickup_status AND logistics_user_id IS NULL)
    ))
    OR
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id())
    OR
    public.donor_owns_donation(pickups.donation_id)
  );

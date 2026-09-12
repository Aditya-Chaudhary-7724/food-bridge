-- ==============================================================================
-- FoodBridge Security Fix: remove legacy (v0) permissive RLS policies on
-- donations and pickups
-- Migration: 20260905000003_tighten_donations_pickups_rls.sql
--
-- FINDING: donations and pickups each carry legacy v0-era policies that
-- coexist with the FoodBridge role-based policies from
-- 20260825000003_rls_authorization.sql. PostgreSQL combines multiple
-- permissive policies for the same command with OR, so these legacy
-- policies silently widen access far beyond what donations_select/insert/
-- update/delete and pickups_select/insert already correctly implement.
--
-- EXACT LEGACY POLICIES REMOVED (confirmed present via live pg_policies
-- inspection immediately before writing this migration — names quoted
-- verbatim, not guessed):
--
--   donations:
--     "Authenticated users can view donations"   (SELECT, USING (true))
--       -> let any authenticated user, any role, read every donation
--          regardless of ownership/status, defeating donations_select's
--          role-based scoping entirely.
--     "Donors can update their own donations"    (UPDATE, USING (auth.uid() = donor_id), no WITH CHECK)
--       -> let a donor update their OWN donation regardless of status,
--          bypassing donations_update's status IN ('available','matched')
--          lifecycle restriction (e.g. editing an already-claimed donation).
--     "Donors can delete their own donations"    (DELETE, USING (auth.uid() = donor_id))
--       -> let a donor delete their OWN donation regardless of status,
--          bypassing donations_delete's status = 'available' restriction
--          (e.g. deleting an already-claimed/in-pickup donation).
--     "Users can create their own donations"     (INSERT, WITH CHECK (auth.uid() = donor_id))
--       -> let ANY authenticated role (not just donor/admin) insert a
--          donation naming themselves as donor_id, bypassing
--          donations_insert's role IN ('donor','admin') restriction.
--
--   pickups:
--     "Authenticated users can create pickups"   (INSERT, WITH CHECK (true))
--       -> let any authenticated user insert an arbitrary pickup row for
--          any donation/organization/logistics_user_id combination,
--          entirely bypassing pickups_insert's admin-only restriction
--          (pickups are meant to be created only via claim_donation()).
--     "Authenticated users can view pickups"     (SELECT, USING (true))
--       -> let any authenticated user read every pickup's address,
--          schedule, and status platform-wide, defeating pickups_select's
--          role-based scoping (own-assigned logistics, own-org ngo,
--          own-donation donor, discoverable-unassigned logistics).
--
-- NONE of these legacy policies are relied on by any legitimate application
-- path — verified by inspecting lib/actions/donations.ts, lib/actions/
-- pickups.ts, lib/actions/matches.ts, and every SECURITY DEFINER function
-- touching either table (claim_donation, generate_match_recommendations,
-- assign_pickup_to_logistics all bypass RLS entirely via SECURITY DEFINER
-- and are unaffected by policy changes on the tables they write to).
--
-- This migration is purely subtractive: donations_select/insert/update/
-- delete and pickups_select/insert/update/delete (added across
-- 20260825000003 and 20260904000001) already implement the intended
-- least-privilege model correctly on their own — removing the legacy
-- policies simply stops them from being silently OR'd in. No new policy
-- logic is introduced here.
--
-- Not touched: profiles, organizations, notifications (separate findings,
-- explicitly out of scope for this migration) and any other table.
-- ==============================================================================

DROP POLICY IF EXISTS "Authenticated users can view donations" ON public.donations;
DROP POLICY IF EXISTS "Donors can update their own donations" ON public.donations;
DROP POLICY IF EXISTS "Donors can delete their own donations" ON public.donations;
DROP POLICY IF EXISTS "Users can create their own donations" ON public.donations;

DROP POLICY IF EXISTS "Authenticated users can create pickups" ON public.pickups;
DROP POLICY IF EXISTS "Authenticated users can view pickups" ON public.pickups;

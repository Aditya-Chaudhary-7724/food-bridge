-- ==============================================================================
-- FoodBridge Phase 4: RLS Hardening — donation_items visibility
-- Migration: 20260902000001_donation_items_select_hardening.sql
--
-- CONTEXT: donation_items_select (20260825000003) authorizes SELECT via
--   EXISTS (SELECT 1 FROM public.donations d WHERE d.id = donation_items.donation_id)
--
-- PostgreSQL enforces RLS on every table access, including a table referenced
-- inside another table's policy predicate, for any role that is not the table
-- owner and does not have BYPASSRLS. Because the query runs as `authenticated`
-- (not the table owner), that EXISTS subquery is already transparently
-- filtered by donations_select — so this was not an exploitable hole in
-- practice. This migration does not change effective access; it replaces the
-- implicit cascade with an explicit, self-contained predicate so the policy
-- does not depend on a reader knowing that subtlety, and is not silently
-- broken if donations is ever queried with a role that bypasses RLS.
--
-- KNOWN TRADE-OFF: this duplicates the visibility predicate from
-- donations_select. If that policy's logic changes, this one must be updated
-- to match. A follow-up migration could extract a shared
-- public.can_view_donation(donation_id uuid) helper to remove the
-- duplication; deferred here to avoid touching the load-bearing
-- donations_select policy in this pass.
-- ==============================================================================

DROP POLICY IF EXISTS donation_items_select ON public.donation_items;

CREATE POLICY donation_items_select ON public.donation_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.donations d
      WHERE d.id = donation_items.donation_id
        AND (
          public.get_current_user_role() = 'admin'::user_role
          OR d.donor_id = auth.uid()
          OR (public.get_current_user_role() = 'ngo'::user_role AND (
            d.status = 'available'::donation_status
            OR d.organization_id = public.get_current_user_org_id()
          ))
          OR (public.get_current_user_role() = 'logistics'::user_role AND EXISTS (
            SELECT 1 FROM public.pickups p
            WHERE p.donation_id = d.id
              AND p.logistics_user_id = auth.uid()
          ))
        )
    )
  );

-- ==============================================================================
-- FoodBridge Phase 2: Security & Row Level Security
-- Migration: 20260825000003_rls_authorization.sql
--
-- This migration enables RLS on all 11 application tables and creates
-- production-grade authorization policies enforcing least-privilege access.
--
-- PREREQUISITES: 20260825000002_enum_remediation.sql must be applied first
-- to ensure all enum values (including 'logistics', 'claimed', etc.) exist.
--
-- DESIGN PRINCIPLES:
--   1. auth.uid() is the sole source of user identity.
--   2. public.profiles.role is the sole source of application role.
--   3. Client-supplied role values are never trusted.
--   4. SECURITY DEFINER helpers bypass profiles RLS to avoid recursion.
--   5. Column-protection triggers prevent privilege escalation via UPDATE.
--   6. Policies follow least-privilege: explicit SELECT/INSERT/UPDATE/DELETE.
--   7. No INSERT policy on profiles for authenticated — only the SECURITY
--      DEFINER trigger handle_new_user() can insert profiles.
-- ==============================================================================


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 1: SECURITY DEFINER HELPER FUNCTIONS                           ║
-- ║                                                                          ║
-- ║  These functions bypass RLS to safely read the calling user's profile    ║
-- ║  without triggering infinite recursion in policies that reference        ║
-- ║  public.profiles.                                                        ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- Returns the authenticated user's application role from public.profiles.
-- Returns NULL for unauthenticated callers or users without a profile.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Returns the authenticated user's linked organization_id from public.profiles.
-- Returns NULL if not linked to any organization.
CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 2: COLUMN-PROTECTION TRIGGERS                                  ║
-- ║                                                                          ║
-- ║  PostgreSQL RLS can restrict which ROWS a user can update, but cannot    ║
-- ║  restrict which COLUMNS within that row. These BEFORE UPDATE triggers    ║
-- ║  silently revert protected fields to their original values for           ║
-- ║  non-admin users, preventing privilege escalation.                       ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- 2a. PROFILES: Prevent non-admin users from changing their own role, id, or
--     created_at. This blocks the critical attack vector where a donor changes
--     their role to 'admin' via a direct API call.
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_fields();


-- 2b. DONATIONS: Prevent non-admin users from changing donor_id (ownership
--     transfer) or created_at.
CREATE OR REPLACE FUNCTION public.protect_donation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_current_user_role() IS DISTINCT FROM 'admin'::user_role THEN
    NEW.donor_id   = OLD.donor_id;
    NEW.created_at = OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_donation_fields ON public.donations;
CREATE TRIGGER trg_protect_donation_fields
  BEFORE UPDATE ON public.donations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_donation_fields();


-- 2c. PICKUPS: Prevent logistics users from tampering with structural fields.
--     A logistics user can only update operational fields: status,
--     actual_pickup_at, actual_delivery_at, estimated_duration_minutes, notes.
--     They CANNOT reassign themselves (logistics_user_id), change the pickup
--     assignment, or modify addresses/locations.
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
    NEW.logistics_user_id    = OLD.logistics_user_id;
    NEW.pickup_address       = OLD.pickup_address;
    NEW.pickup_location      = OLD.pickup_location;
    NEW.destination_address  = OLD.destination_address;
    NEW.destination_location = OLD.destination_location;
    NEW.scheduled_at         = OLD.scheduled_at;
    NEW.created_at           = OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_pickup_fields ON public.pickups;
CREATE TRIGGER trg_protect_pickup_fields
  BEFORE UPDATE ON public.pickups
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_pickup_fields();


-- 2d. MATCH RECOMMENDATIONS: Prevent non-admin users from tampering with
--     scores, distances, explanations, or reassigning donation/organization
--     links. NGOs may only change the status field (accept/reject).
CREATE OR REPLACE FUNCTION public.protect_match_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_current_user_role() IS DISTINCT FROM 'admin'::user_role THEN
    NEW.donation_id     = OLD.donation_id;
    NEW.organization_id = OLD.organization_id;
    NEW.semantic_score  = OLD.semantic_score;
    NEW.distance_score  = OLD.distance_score;
    NEW.capacity_score  = OLD.capacity_score;
    NEW.urgency_score   = OLD.urgency_score;
    NEW.final_score     = OLD.final_score;
    NEW.distance_km     = OLD.distance_km;
    NEW.explanation      = OLD.explanation;
    NEW.created_at      = OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_match_fields ON public.match_recommendations;
CREATE TRIGGER trg_protect_match_fields
  BEFORE UPDATE ON public.match_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_match_fields();


-- 2e. NOTIFICATIONS: Prevent non-admin users from tampering with notification
--     content. Users may only change the 'read' boolean.
CREATE OR REPLACE FUNCTION public.protect_notification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_current_user_role() IS DISTINCT FROM 'admin'::user_role THEN
    NEW.user_id        = OLD.user_id;
    NEW.title          = OLD.title;
    NEW.message        = OLD.message;
    NEW.type           = OLD.type;
    NEW.reference_id   = OLD.reference_id;
    NEW.reference_type = OLD.reference_type;
    NEW.created_at     = OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_notification_fields ON public.notifications;
CREATE TRIGGER trg_protect_notification_fields
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_notification_fields();


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 3: ENABLE ROW LEVEL SECURITY ON ALL APPLICATION TABLES         ║
-- ║                                                                          ║
-- ║  Enabling RLS with no policies = zero access for non-owner roles.       ║
-- ║  The postgres (owner) role and SECURITY DEFINER functions bypass RLS.    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ngo_requirements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks      ENABLE ROW LEVEL SECURITY;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 4: RLS POLICIES                                                ║
-- ║                                                                          ║
-- ║  Each table gets explicit SELECT / INSERT / UPDATE / DELETE policies.    ║
-- ║  All policies target the 'authenticated' role — anonymous (anon) users  ║
-- ║  receive zero access since no policies match them.                       ║
-- ╚════════════════════════════════════════════════════════════════════════════╝


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.1  PROFILES
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: Users read their own profile. Admins read all profiles.
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.get_current_user_role() = 'admin'::user_role
  );

-- INSERT: Blocked for authenticated users. Profile creation happens exclusively
-- via the SECURITY DEFINER trigger handle_new_user() on auth.users INSERT,
-- which runs as the table owner (postgres) and bypasses RLS.
-- No INSERT policy = no direct inserts by authenticated users.

-- UPDATE: Users update their own profile. Admins update any profile.
-- Column protection (role, id, created_at) enforced by trg_protect_profile_fields.
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.get_current_user_role() = 'admin'::user_role
  )
  WITH CHECK (
    id = auth.uid()
    OR public.get_current_user_role() = 'admin'::user_role
  );

-- DELETE: Admin only. Admins cannot delete their own profile (safety).
CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    AND id != auth.uid()
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.2  ORGANIZATIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: All authenticated users can view the organization directory.
-- This is required for donation matching, partner discovery, etc.
CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: Authenticated users can create organizations.
-- The is_verified flag defaults to false; admin verification required.
CREATE POLICY organizations_insert ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: Only members of the organization (linked via profiles.organization_id)
-- or admins can update organization details.
CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    id = public.get_current_user_org_id()
    OR public.get_current_user_role() = 'admin'::user_role
  )
  WITH CHECK (
    id = public.get_current_user_org_id()
    OR public.get_current_user_role() = 'admin'::user_role
  );

-- DELETE: Admin only.
CREATE POLICY organizations_delete ON public.organizations
  FOR DELETE TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.3  DONATIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: Role-based visibility.
--   Donor:     own donations (donor_id = auth.uid())
--   NGO:       available donations + donations matched/claimed to their org
--   Logistics: donations related to their assigned pickups
--   Admin:     all donations
CREATE POLICY donations_select ON public.donations
  FOR SELECT TO authenticated
  USING (
    -- Admin: full access
    public.get_current_user_role() = 'admin'::user_role
    OR
    -- Donor: own donations
    donor_id = auth.uid()
    OR
    -- NGO: available donations + donations associated with their org
    (public.get_current_user_role() = 'ngo'::user_role AND (
      status = 'available'::donation_status
      OR organization_id = public.get_current_user_org_id()
    ))
    OR
    -- Logistics: only donations for their assigned pickups
    (public.get_current_user_role() = 'logistics'::user_role AND EXISTS (
      SELECT 1 FROM public.pickups p
      WHERE p.donation_id = donations.id
        AND p.logistics_user_id = auth.uid()
    ))
  );

-- INSERT: Donors create donations with donor_id = auth.uid(). Admins can also create.
CREATE POLICY donations_insert ON public.donations
  FOR INSERT TO authenticated
  WITH CHECK (
    donor_id = auth.uid()
    AND public.get_current_user_role() IN ('donor'::user_role, 'admin'::user_role)
  );

-- UPDATE: Donors update their own active donations. Admins update any.
-- Column protection (donor_id, created_at) enforced by trg_protect_donation_fields.
CREATE POLICY donations_update ON public.donations
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (donor_id = auth.uid() AND status IN ('available'::donation_status, 'matched'::donation_status))
  )
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR
    donor_id = auth.uid()
  );

-- DELETE: Donors can delete only unclaimed (available) donations. Admins delete any.
CREATE POLICY donations_delete ON public.donations
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (donor_id = auth.uid() AND status = 'available'::donation_status)
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.4  DONATION ITEMS
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: Visible if user can see the parent donation.
-- The subquery on donations is filtered by donations RLS, providing
-- cascading visibility automatically.
CREATE POLICY donation_items_select ON public.donation_items
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    EXISTS (
      SELECT 1 FROM public.donations d
      WHERE d.id = donation_items.donation_id
    )
  );

-- INSERT: Only the donor who owns the parent donation.
CREATE POLICY donation_items_insert ON public.donation_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR
    EXISTS (
      SELECT 1 FROM public.donations d
      WHERE d.id = donation_items.donation_id
        AND d.donor_id = auth.uid()
    )
  );

-- UPDATE: Only the donor who owns the parent donation.
CREATE POLICY donation_items_update ON public.donation_items
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    EXISTS (
      SELECT 1 FROM public.donations d
      WHERE d.id = donation_items.donation_id
        AND d.donor_id = auth.uid()
    )
  )
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR
    EXISTS (
      SELECT 1 FROM public.donations d
      WHERE d.id = donation_items.donation_id
        AND d.donor_id = auth.uid()
    )
  );

-- DELETE: Only the donor who owns the parent donation.
CREATE POLICY donation_items_delete ON public.donation_items
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    EXISTS (
      SELECT 1 FROM public.donations d
      WHERE d.id = donation_items.donation_id
        AND d.donor_id = auth.uid()
    )
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.5  NGO REQUIREMENTS
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: NGOs see their own org's requirements. Admins see all.
CREATE POLICY ngo_requirements_select ON public.ngo_requirements
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id())
  );

-- INSERT: NGOs create requirements for their own org. Admins for any.
CREATE POLICY ngo_requirements_insert ON public.ngo_requirements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id())
  );

-- UPDATE: NGOs update their own org's requirements. Admins any.
CREATE POLICY ngo_requirements_update ON public.ngo_requirements
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id())
  )
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id())
  );

-- DELETE: NGOs delete their own org's requirements. Admins any.
CREATE POLICY ngo_requirements_delete ON public.ngo_requirements
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id())
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.6  MATCH RECOMMENDATIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: Donors see recommendations for their donations. NGOs see for their org.
CREATE POLICY match_recommendations_select ON public.match_recommendations
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    -- Donor: recommendations for their donations
    EXISTS (
      SELECT 1 FROM public.donations d
      WHERE d.id = match_recommendations.donation_id
        AND d.donor_id = auth.uid()
    )
    OR
    -- NGO: recommendations for their organization
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id())
  );

-- INSERT: Admin / system only. The matching engine will use the service role
-- (which bypasses RLS) or a SECURITY DEFINER function.
CREATE POLICY match_recommendations_insert ON public.match_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (public.get_current_user_role() = 'admin'::user_role);

-- UPDATE: NGOs can accept/reject pending recommendations for their org.
-- Column protection (scores, explanation, etc.) by trg_protect_match_fields.
CREATE POLICY match_recommendations_update ON public.match_recommendations
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id()
     AND status = 'pending'::match_status)
  )
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'ngo'::user_role
     AND organization_id = public.get_current_user_org_id())
  );

-- DELETE: Admin only.
CREATE POLICY match_recommendations_delete ON public.match_recommendations
  FOR DELETE TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.7  PICKUPS
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: Role-based visibility.
--   Donor:     pickups for their donations
--   NGO:       pickups for their organization
--   Logistics: pickups assigned to them
--   Admin:     all pickups
CREATE POLICY pickups_select ON public.pickups
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    -- Logistics: assigned to them
    (public.get_current_user_role() = 'logistics'::user_role
     AND logistics_user_id = auth.uid())
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

-- INSERT: Admin / system only. Pickups are created when a match is accepted.
CREATE POLICY pickups_insert ON public.pickups
  FOR INSERT TO authenticated
  WITH CHECK (public.get_current_user_role() = 'admin'::user_role);

-- UPDATE: Logistics users update operational fields on assigned pickups.
-- Admins update any pickup. Donors/NGOs have no UPDATE access.
-- Column protection by trg_protect_pickup_fields.
CREATE POLICY pickups_update ON public.pickups
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'logistics'::user_role
     AND logistics_user_id = auth.uid())
  )
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'logistics'::user_role
     AND logistics_user_id = auth.uid())
  );

-- DELETE: Admin only.
CREATE POLICY pickups_delete ON public.pickups
  FOR DELETE TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.8  LOGISTICS EVENTS
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: Users related to the pickup can view its event timeline.
CREATE POLICY logistics_events_select ON public.logistics_events
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'admin'::user_role
    OR
    EXISTS (
      SELECT 1 FROM public.pickups p
      WHERE p.id = logistics_events.pickup_id
      AND (
        -- Logistics user assigned to this pickup
        p.logistics_user_id = auth.uid()
        OR
        -- NGO whose org owns this pickup
        p.organization_id = public.get_current_user_org_id()
        OR
        -- Donor who owns the donation
        EXISTS (
          SELECT 1 FROM public.donations d
          WHERE d.id = p.donation_id
            AND d.donor_id = auth.uid()
        )
      )
    )
  );

-- INSERT: Logistics users can create events only for their assigned pickups.
CREATE POLICY logistics_events_insert ON public.logistics_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_role() = 'admin'::user_role
    OR
    (public.get_current_user_role() = 'logistics'::user_role
     AND EXISTS (
       SELECT 1 FROM public.pickups p
       WHERE p.id = logistics_events.pickup_id
         AND p.logistics_user_id = auth.uid()
     ))
  );

-- UPDATE: Audit trail — not editable. Admin only.
CREATE POLICY logistics_events_update ON public.logistics_events
  FOR UPDATE TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);

-- DELETE: Audit trail — not deletable. Admin only.
CREATE POLICY logistics_events_delete ON public.logistics_events
  FOR DELETE TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.9  NOTIFICATIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: Users read their own notifications only.
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_current_user_role() = 'admin'::user_role
  );

-- INSERT: Admin / system only. Backend logic creates notifications via
-- service role (bypasses RLS) or SECURITY DEFINER functions.
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.get_current_user_role() = 'admin'::user_role);

-- UPDATE: Users mark their own notifications as read.
-- Column protection by trg_protect_notification_fields ensures only 'read'
-- can be changed by non-admin users.
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_current_user_role() = 'admin'::user_role
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.get_current_user_role() = 'admin'::user_role
  );

-- DELETE: Users can delete their own notifications. Admin can delete any.
CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_current_user_role() = 'admin'::user_role
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.10  DOCUMENTS  (Conservative — Admin Only for now)
-- ══════════════════════════════════════════════════════════════════════════════
-- These tables will be used for the future RAG knowledge base.
-- Access will be refined when the RAG pipeline is implemented.

CREATE POLICY documents_select ON public.documents
  FOR SELECT TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);

CREATE POLICY documents_insert ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.get_current_user_role() = 'admin'::user_role);

CREATE POLICY documents_update ON public.documents
  FOR UPDATE TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);

CREATE POLICY documents_delete ON public.documents
  FOR DELETE TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4.11  DOCUMENT CHUNKS  (Conservative — Admin Only for now)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY document_chunks_select ON public.document_chunks
  FOR SELECT TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);

CREATE POLICY document_chunks_insert ON public.document_chunks
  FOR INSERT TO authenticated
  WITH CHECK (public.get_current_user_role() = 'admin'::user_role);

CREATE POLICY document_chunks_update ON public.document_chunks
  FOR UPDATE TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);

CREATE POLICY document_chunks_delete ON public.document_chunks
  FOR DELETE TO authenticated
  USING (public.get_current_user_role() = 'admin'::user_role);

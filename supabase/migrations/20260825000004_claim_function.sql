-- ==============================================================================
-- FoodBridge Phase 3: Concurrency-Safe Claim Function
-- Migration: 20260825000004_claim_function.sql
--
-- Provides an atomic claim operation that:
--   1. Locks the donation row with FOR UPDATE
--   2. Verifies status = 'available'
--   3. Updates status → 'claimed' and sets organization_id
--   4. Creates the pickup record
--   5. Returns success/conflict
--
-- This is SECURITY DEFINER because:
--   - It must bypass the pickups INSERT RLS policy (admin-only)
--   - It validates the caller's role and organization internally
--   - The FOR UPDATE lock prevents two NGOs from claiming simultaneously
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.claim_donation(
  p_donation_id UUID,
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_donation RECORD;
  v_pickup_id UUID;
  v_caller_role user_role;
  v_caller_org UUID;
BEGIN
  -- 1. Verify caller identity and authorization
  v_caller_role := public.get_current_user_role();
  v_caller_org := public.get_current_user_org_id();

  IF v_caller_role IS DISTINCT FROM 'ngo'::user_role
     AND v_caller_role IS DISTINCT FROM 'admin'::user_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized',
      'message', 'Only NGO users can claim donations');
  END IF;

  -- 2. Verify the caller belongs to the claiming organization
  IF v_caller_role = 'ngo'::user_role
     AND v_caller_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'organization_mismatch',
      'message', 'You can only claim donations for your own organization');
  END IF;

  -- 3. Atomic lock + status check
  SELECT id, status, pickup_address, pickup_location
  INTO v_donation
  FROM public.donations
  WHERE id = p_donation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found',
      'message', 'Donation not found');
  END IF;

  IF v_donation.status != 'available'::donation_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed',
      'message', 'This donation has already been claimed by another organization');
  END IF;

  -- 4. Claim the donation
  UPDATE public.donations
  SET status = 'claimed'::donation_status,
      organization_id = p_organization_id,
      updated_at = now()
  WHERE id = p_donation_id;

  -- 5. Create the pickup record
  INSERT INTO public.pickups (
    donation_id,
    organization_id,
    pickup_address,
    pickup_location,
    status
  )
  VALUES (
    p_donation_id,
    p_organization_id,
    v_donation.pickup_address,
    v_donation.pickup_location,
    'scheduled'::pickup_status
  )
  RETURNING id INTO v_pickup_id;

  -- 6. Return success
  RETURN jsonb_build_object(
    'success', true,
    'pickup_id', v_pickup_id,
    'donation_id', p_donation_id
  );
END;
$$;

-- Revoke direct execute from anon (extra safety layer)
REVOKE EXECUTE ON FUNCTION public.claim_donation(UUID, UUID) FROM anon;

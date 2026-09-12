-- ==============================================================================
-- FoodBridge Phase 6: Donor -> NGO Matching Engine
-- Migration: 20260905000001_matching_engine.sql
--
-- Computes and stores explainable match recommendations for a donation
-- against every active NGO requirement, combining:
--   1. Semantic similarity  — pgvector cosine similarity between
--      donations.food_embedding and ngo_requirements.requirement_embedding
--   2. Geographic proximity — PostGIS ST_DistanceSphere between
--      donations.pickup_location and organizations.location
--   3. NGO capacity         — tiered fit between organizations.daily_capacity_kg
--      and the donation's quantity, refined by the requirement's preferred
--      quantity range
--   4. Urgency               — direct mapping from ngo_requirements.urgency_level
--
-- Weights and formulas mirror lib/services/match-scoring.ts exactly (the
-- portions of this logic that don't need pgvector/PostGIS are unit-tested
-- there) — semantic 0.35, distance 0.30, capacity 0.20, urgency 0.15,
-- summing to 1. Update both together if either changes.
--
-- Every stored score is derived only from the four computed inputs above;
-- `explanation` is built from those same real numbers, never invented text.
--
-- AUTHORIZATION: SECURITY DEFINER, callable only by the donation's own donor
-- or an admin (mirrors claim_donation()'s pattern) — matching is triggered
-- automatically right after a donation is created (see
-- lib/actions/donations.ts createDonation()), not exposed as a general
-- NGO-facing action. match_recommendations RLS (unchanged by this
-- migration) still governs who can subsequently read or respond to the
-- rows this writes.
--
-- Missing embeddings do not block matching: semantic_score falls back to a
-- neutral 50 when either side lacks an embedding (e.g. Gemini was
-- unreachable when the donation/requirement was created), so a donation is
-- still fully matchable on distance/capacity/urgency alone.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.generate_match_recommendations(
  p_donation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_donation RECORD;
  v_req RECORD;
  v_semantic_score NUMERIC;
  v_distance_score NUMERIC;
  v_distance_km NUMERIC;
  v_capacity_score NUMERIC;
  v_urgency_score NUMERIC;
  v_final_score NUMERIC;
  v_explanation TEXT;
  v_count INTEGER := 0;
  v_caller_role user_role;
BEGIN
  SELECT * INTO v_donation FROM public.donations WHERE id = p_donation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Donation not found');
  END IF;

  v_caller_role := public.get_current_user_role();
  IF v_caller_role IS DISTINCT FROM 'admin'::user_role AND v_donation.donor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'Only the donation owner can generate matches');
  END IF;

  IF v_donation.status != 'available'::donation_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'message', 'Only available donations can be matched');
  END IF;

  FOR v_req IN
    SELECT
      r.organization_id,
      r.requirement_embedding,
      r.urgency_level,
      r.preferred_quantity_min,
      r.preferred_quantity_max,
      o.location AS org_location,
      o.daily_capacity_kg AS org_daily_capacity_kg
    FROM public.ngo_requirements r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE r.is_active = true
      AND o.type = 'ngo'::organization_type
  LOOP
    -- 1. Semantic similarity: pgvector cosine distance (<=>) is 1 - cosine
    -- similarity, so (1 - distance) recovers the similarity; scaled to 0-100.
    IF v_donation.food_embedding IS NOT NULL AND v_req.requirement_embedding IS NOT NULL THEN
      v_semantic_score := GREATEST(0, LEAST(100, (1 - (v_donation.food_embedding <=> v_req.requirement_embedding)) * 100));
    ELSE
      v_semantic_score := 50;
    END IF;

    -- 2. Geographic proximity: linear decay to 0 at 50km (mirrors
    -- computeDistanceScore in lib/services/match-scoring.ts).
    IF v_donation.pickup_location IS NOT NULL AND v_req.org_location IS NOT NULL THEN
      v_distance_km := ST_DistanceSphere(v_donation.pickup_location, v_req.org_location) / 1000.0;
      v_distance_score := GREATEST(0, LEAST(100, 100 - (v_distance_km / 50.0 * 100)));
    ELSE
      v_distance_km := NULL;
      v_distance_score := 50;
    END IF;

    -- 3. Capacity: tiered fit, halved if outside the NGO's preferred
    -- quantity range (mirrors computeCapacityScore).
    IF v_req.org_daily_capacity_kg >= v_donation.quantity THEN
      v_capacity_score := 100;
    ELSIF v_req.org_daily_capacity_kg >= v_donation.quantity * 0.5 THEN
      v_capacity_score := 60;
    ELSE
      v_capacity_score := 20;
    END IF;
    IF v_req.preferred_quantity_min IS NOT NULL AND v_donation.quantity < v_req.preferred_quantity_min THEN
      v_capacity_score := v_capacity_score * 0.5;
    END IF;
    IF v_req.preferred_quantity_max IS NOT NULL AND v_donation.quantity > v_req.preferred_quantity_max THEN
      v_capacity_score := v_capacity_score * 0.5;
    END IF;

    -- 4. Urgency: direct mapping (mirrors mapUrgencyToScore).
    v_urgency_score := CASE v_req.urgency_level
      WHEN 'critical' THEN 100
      WHEN 'high' THEN 75
      WHEN 'medium' THEN 50
      ELSE 25
    END;

    v_final_score := (v_semantic_score * 0.35) + (v_distance_score * 0.30) + (v_capacity_score * 0.20) + (v_urgency_score * 0.15);

    v_explanation := format(
      '%s%% food-category match, %s, %s capacity fit, %s urgency need.',
      ROUND(v_semantic_score),
      CASE WHEN v_distance_km IS NOT NULL THEN ROUND(v_distance_km::numeric, 1)::text || ' km away' ELSE 'distance unknown' END,
      CASE WHEN v_capacity_score >= 70 THEN 'strong' WHEN v_capacity_score >= 40 THEN 'moderate' ELSE 'limited' END,
      v_req.urgency_level
    );

    INSERT INTO public.match_recommendations (
      donation_id, organization_id, semantic_score, distance_score, capacity_score, urgency_score, final_score, distance_km, explanation, status
    ) VALUES (
      p_donation_id, v_req.organization_id, v_semantic_score, v_distance_score, v_capacity_score, v_urgency_score, v_final_score, v_distance_km, v_explanation, 'pending'::match_status
    )
    ON CONFLICT (donation_id, organization_id) DO UPDATE SET
      semantic_score = EXCLUDED.semantic_score,
      distance_score = EXCLUDED.distance_score,
      capacity_score = EXCLUDED.capacity_score,
      urgency_score = EXCLUDED.urgency_score,
      final_score = EXCLUDED.final_score,
      distance_km = EXCLUDED.distance_km,
      explanation = EXCLUDED.explanation,
      updated_at = now()
    WHERE public.match_recommendations.status = 'pending'::match_status;
    -- Never overwrite a recommendation the NGO already accepted/rejected.

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'matches_generated', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_match_recommendations(UUID) FROM anon;

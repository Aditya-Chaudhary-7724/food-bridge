import type { Database } from '@/lib/db/types'

// Documents and unit-tests the portions of the matching engine's scoring
// formula that don't require pgvector/PostGIS to evaluate. The authoritative
// computation runs inside public.generate_match_recommendations()
// (supabase/migrations/20260905000001_matching_engine.sql) — semantic
// similarity (cosine distance on embeddings) and geographic distance
// (ST_DistanceSphere) can only run there, against live data. This module
// mirrors the same weights/tiers/formula for the pieces that are pure
// arithmetic, so the design is independently testable and the SQL migration
// can be reviewed against it. If either changes, update both.

type UrgencyLevel = Database['public']['Tables']['ngo_requirements']['Row']['urgency_level']

// Weighted combination — must sum to 1. Semantic and distance are weighted
// highest since they're the two dimensions that actually distinguish one
// compatible NGO from another; capacity and urgency refine the ranking.
export const MATCH_WEIGHTS = {
  semantic: 0.35,
  distance: 0.3,
  capacity: 0.2,
  urgency: 0.15,
} as const

const URGENCY_SCORE: Record<UrgencyLevel, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
}

export function mapUrgencyToScore(level: UrgencyLevel): number {
  return URGENCY_SCORE[level]
}

// Distance decays linearly to 0 at 50km — a donation 50km+ away scores no
// geographic benefit at all, but isn't excluded outright (semantic/capacity/
// urgency can still make it a reasonable match for a wide-radius NGO).
const MAX_USEFUL_DISTANCE_KM = 50

export function computeDistanceScore(distanceKm: number): number {
  const score = 100 - (distanceKm / MAX_USEFUL_DISTANCE_KM) * 100
  return clamp(score)
}

// Capacity is tiered rather than a raw ratio: an org whose daily capacity
// exactly covers the donation is a full match (100), not a middling one —
// rewarding pure "spare capacity" would rank an org with 10x more room than
// needed above one that's an exact, sufficient fit, which isn't meaningful.
export function computeCapacityScore(
  orgDailyCapacityKg: number,
  donationQuantity: number,
  preferredQuantityMin: number | null,
  preferredQuantityMax: number | null,
): number {
  let score: number
  if (orgDailyCapacityKg >= donationQuantity) score = 100
  else if (orgDailyCapacityKg >= donationQuantity * 0.5) score = 60
  else score = 20

  if (preferredQuantityMin !== null && donationQuantity < preferredQuantityMin) score *= 0.5
  if (preferredQuantityMax !== null && donationQuantity > preferredQuantityMax) score *= 0.5

  return clamp(score)
}

export function computeFinalScore(scores: { semantic: number; distance: number; capacity: number; urgency: number }): number {
  const final =
    scores.semantic * MATCH_WEIGHTS.semantic +
    scores.distance * MATCH_WEIGHTS.distance +
    scores.capacity * MATCH_WEIGHTS.capacity +
    scores.urgency * MATCH_WEIGHTS.urgency
  return clamp(final)
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

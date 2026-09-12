import type { DonationTone } from '@/lib/services/donation-view-model'

export function getMatchScoreTone(finalScore: number): DonationTone {
  if (finalScore >= 75) return 'green'
  if (finalScore >= 50) return 'blue'
  if (finalScore >= 25) return 'amber'
  return 'slate'
}

export type MatchCardModel = {
  id: string
  donationTitle: string
  organizationName: string
  finalScore: number
  semanticScore: number
  distanceScore: number
  capacityScore: number
  urgencyScore: number
  distanceKm: number | null
  explanation: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  tone: DonationTone
}

export function toMatchCardModel(match: {
  id: string
  donationTitle: string | null
  organizationName: string | null
  final_score: number
  semantic_score: number
  distance_score: number
  capacity_score: number
  urgency_score: number
  distance_km: number | null
  explanation: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
}): MatchCardModel {
  return {
    id: match.id,
    donationTitle: match.donationTitle ?? 'Donation',
    organizationName: match.organizationName ?? 'Organization',
    finalScore: match.final_score,
    semanticScore: match.semantic_score,
    distanceScore: match.distance_score,
    capacityScore: match.capacity_score,
    urgencyScore: match.urgency_score,
    distanceKm: match.distance_km,
    explanation: match.explanation,
    status: match.status,
    tone: getMatchScoreTone(match.final_score),
  }
}

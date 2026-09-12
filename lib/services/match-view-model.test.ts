import { describe, expect, it } from 'vitest'

import { getMatchScoreTone, toMatchCardModel } from '@/lib/services/match-view-model'

describe('getMatchScoreTone', () => {
  it('tiers scores from strong (green) to weak (slate)', () => {
    expect(getMatchScoreTone(90)).toBe('green')
    expect(getMatchScoreTone(60)).toBe('blue')
    expect(getMatchScoreTone(30)).toBe('amber')
    expect(getMatchScoreTone(10)).toBe('slate')
  })
})

describe('toMatchCardModel', () => {
  it('falls back to safe defaults for missing names', () => {
    const card = toMatchCardModel({
      id: 'match-1',
      donationTitle: null,
      organizationName: null,
      final_score: 82,
      semantic_score: 90,
      distance_score: 80,
      capacity_score: 100,
      urgency_score: 50,
      distance_km: 3.2,
      explanation: '90% food-category match, 3.2 km away, strong capacity fit, medium urgency need.',
      status: 'pending',
    })
    expect(card.donationTitle).toBe('Donation')
    expect(card.organizationName).toBe('Organization')
    expect(card.tone).toBe('green')
  })
})

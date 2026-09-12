import { describe, expect, it } from 'vitest'

import { MATCH_WEIGHTS, computeCapacityScore, computeDistanceScore, computeFinalScore, mapUrgencyToScore } from '@/lib/services/match-scoring'

describe('MATCH_WEIGHTS', () => {
  it('sums to 1', () => {
    const total = MATCH_WEIGHTS.semantic + MATCH_WEIGHTS.distance + MATCH_WEIGHTS.capacity + MATCH_WEIGHTS.urgency
    expect(total).toBeCloseTo(1, 10)
  })
})

describe('mapUrgencyToScore', () => {
  it('maps every urgency level to a distinct score, ordered by severity', () => {
    expect(mapUrgencyToScore('critical')).toBe(100)
    expect(mapUrgencyToScore('high')).toBe(75)
    expect(mapUrgencyToScore('medium')).toBe(50)
    expect(mapUrgencyToScore('low')).toBe(25)
  })
})

describe('computeDistanceScore', () => {
  it('scores 100 at zero distance', () => {
    expect(computeDistanceScore(0)).toBe(100)
  })

  it('scores 0 at the 50km cutoff and beyond', () => {
    expect(computeDistanceScore(50)).toBe(0)
    expect(computeDistanceScore(100)).toBe(0)
  })

  it('decays linearly in between', () => {
    expect(computeDistanceScore(25)).toBe(50)
  })
})

describe('computeCapacityScore', () => {
  it('scores 100 when capacity exactly covers the donation', () => {
    expect(computeCapacityScore(100, 100, null, null)).toBe(100)
  })

  it('scores 100 when capacity exceeds the donation (no bonus for excess spare capacity)', () => {
    expect(computeCapacityScore(1000, 100, null, null)).toBe(100)
  })

  it('scores 60 for partial capacity (50-99% of the donation)', () => {
    expect(computeCapacityScore(60, 100, null, null)).toBe(60)
  })

  it('scores 20 when capacity is well under half the donation', () => {
    expect(computeCapacityScore(10, 100, null, null)).toBe(20)
  })

  it('halves the score when the donation is below the NGO\'s preferred minimum', () => {
    expect(computeCapacityScore(100, 100, 200, null)).toBe(50)
  })

  it('halves the score when the donation exceeds the NGO\'s preferred maximum', () => {
    expect(computeCapacityScore(100, 100, null, 50)).toBe(50)
  })
})

describe('computeFinalScore', () => {
  it('weights each dimension per MATCH_WEIGHTS', () => {
    const score = computeFinalScore({ semantic: 100, distance: 100, capacity: 100, urgency: 100 })
    expect(score).toBe(100)
  })

  it('returns 0 when every dimension is 0', () => {
    expect(computeFinalScore({ semantic: 0, distance: 0, capacity: 0, urgency: 0 })).toBe(0)
  })

  it('combines mixed dimension scores using the documented weights', () => {
    const score = computeFinalScore({ semantic: 80, distance: 40, capacity: 100, urgency: 50 })
    // 80*0.35 + 40*0.30 + 100*0.20 + 50*0.15 = 28 + 12 + 20 + 7.5 = 67.5
    expect(score).toBeCloseTo(67.5, 5)
  })
})

import { describe, expect, it } from 'vitest'

import { computeDonorImpactStats } from '@/lib/services/donor-impact'

describe('computeDonorImpactStats', () => {
  it('returns all zeros for a donor with no donations', () => {
    const stats = computeDonorImpactStats([], [])
    expect(stats).toEqual({
      totalKgDiverted: 0,
      estimatedMeals: 0,
      estimatedCo2AvoidedKg: 0,
      activeDonationCount: 0,
      completedPickupCount: 0,
    })
  })

  it('sums only kg-unit, non-cancelled/expired donations', () => {
    const stats = computeDonorImpactStats(
      [
        { quantity: 100, unit: 'kg', status: 'available' },
        { quantity: 50, unit: 'kg', status: 'cancelled' },
        { quantity: 20, unit: 'kg', status: 'expired' },
        { quantity: 30, unit: 'lbs', status: 'available' },
      ],
      [],
    )
    expect(stats.totalKgDiverted).toBe(100)
  })

  it('derives estimated meals and CO2 from the summed kg, scaling with real data', () => {
    const stats = computeDonorImpactStats([{ quantity: 200, unit: 'kg', status: 'delivered' }], [])
    expect(stats.estimatedMeals).toBe(500)
    expect(stats.estimatedCo2AvoidedKg).toBe(500)
  })

  it('counts active donations as available or matched only', () => {
    const stats = computeDonorImpactStats(
      [
        { quantity: 1, unit: 'kg', status: 'available' },
        { quantity: 1, unit: 'kg', status: 'matched' },
        { quantity: 1, unit: 'kg', status: 'claimed' },
        { quantity: 1, unit: 'kg', status: 'delivered' },
      ],
      [],
    )
    expect(stats.activeDonationCount).toBe(2)
  })

  it('counts completed pickups only', () => {
    const stats = computeDonorImpactStats(
      [],
      [{ status: 'completed' }, { status: 'in_transit' }, { status: 'completed' }, { status: 'cancelled' }],
    )
    expect(stats.completedPickupCount).toBe(2)
  })
})

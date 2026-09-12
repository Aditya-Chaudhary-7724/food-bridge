import { describe, expect, it } from 'vitest'

import { computeLogisticsStats, computeNgoStats } from '@/lib/services/role-dashboard-stats'

describe('computeNgoStats', () => {
  it('counts available, claimed-family, active requirements, and incoming pickups', () => {
    const stats = computeNgoStats(
      [{ status: 'available' }, { status: 'available' }, { status: 'claimed' }, { status: 'delivered' }, { status: 'expired' }],
      [{ is_active: true }, { is_active: false }],
      [{ status: 'driver_assigned' }, { status: 'completed' }],
    )
    expect(stats.availableDonationCount).toBe(2)
    expect(stats.claimedDonationCount).toBe(2)
    expect(stats.activeRequirementCount).toBe(1)
    expect(stats.incomingPickupCount).toBe(1)
  })

  it('returns zeros for an NGO with no data', () => {
    expect(computeNgoStats([], [], [])).toEqual({
      availableDonationCount: 0,
      claimedDonationCount: 0,
      activeRequirementCount: 0,
      incomingPickupCount: 0,
    })
  })
})

describe('computeLogisticsStats', () => {
  it('counts assigned, active, and completed deliveries', () => {
    const stats = computeLogisticsStats([
      { status: 'driver_assigned' },
      { status: 'in_transit' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'cancelled' },
    ])
    expect(stats.assignedPickupCount).toBe(5)
    expect(stats.activeDeliveryCount).toBe(2)
    expect(stats.completedDeliveryCount).toBe(2)
  })
})

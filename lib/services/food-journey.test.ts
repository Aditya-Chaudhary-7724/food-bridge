import { describe, expect, it } from 'vitest'

import { createDemoDashboardActions } from '@/lib/demo/actions'
import { createDemoSeed } from '@/lib/demo/seed'
import { getDemoPersona, selectDemoDashboard } from '@/lib/demo/selectors'
import type { DemoState } from '@/lib/demo/types'
import type { DonationCardModel } from '@/lib/services/donation-view-model'
import { getDonationJourney, getPickupJourney, JOURNEY_STAGES, pickFeaturedJourney } from '@/lib/services/food-journey'
import type { PickupCardModel } from '@/lib/services/pickup-view-model'

const states = (j: ReturnType<typeof getPickupJourney>) => j.stages.map((s) => s.state)

function pickup(over: Partial<PickupCardModel>): PickupCardModel {
  return { id: 'p', title: 'Rice', organizationName: 'Hope', status: '', statusValue: 'scheduled', tone: 'amber', scheduledAt: '', isAssignedToMe: false, hasVolunteerAssigned: false, ...over }
}
function donation(over: Partial<DonationCardModel>): DonationCardModel {
  return { id: 'd', name: 'Bread', org: '', amount: '10 kg', status: '', statusValue: 'available', date: '', tone: 'amber', ...over }
}

describe('getPickupJourney', () => {
  it('has the five journey stages in order', () => {
    expect(JOURNEY_STAGES.map((s) => s.label)).toEqual(['Donation created', 'NGO match', 'Pickup coordinated', 'Volunteer delivery', 'Completed'])
  })

  it('advances monotonically through the pickup lifecycle', () => {
    const scheduled = getPickupJourney({ statusValue: 'scheduled', hasVolunteerAssigned: false })
    const accepted = getPickupJourney({ statusValue: 'driver_assigned', hasVolunteerAssigned: false })
    const assigned = getPickupJourney({ statusValue: 'driver_assigned', hasVolunteerAssigned: true })
    const transit = getPickupJourney({ statusValue: 'in_transit', hasVolunteerAssigned: true })
    const done = getPickupJourney({ statusValue: 'completed', hasVolunteerAssigned: true })

    expect(states(scheduled)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming'])
    expect(states(accepted)).toEqual(['done', 'done', 'done', 'current', 'upcoming'])
    expect(accepted.summary).toMatch(/volunteer still needs to be assigned/)
    expect(assigned.summary).toMatch(/volunteer is assigned/)
    expect(transit.progress).toBeGreaterThan(assigned.progress)
    expect(states(done)).toEqual(['done', 'done', 'done', 'done', 'done'])
    expect(done.isComplete).toBe(true)
    expect(done.progress).toBe(1)

    const progression = [scheduled, accepted, transit, done].map((j) => j.progress)
    expect([...progression].sort((a, b) => a - b)).toEqual(progression)
  })

  it('never reports a pending pickup as complete', () => {
    for (const statusValue of ['scheduled', 'driver_assigned', 'in_transit'] as const) {
      const journey = getPickupJourney({ statusValue, hasVolunteerAssigned: true })
      expect(journey.isComplete).toBe(false)
      expect(journey.stages.at(-1)?.state).toBe('upcoming')
      expect(journey.progress).toBeLessThan(1)
    }
  })

  it('marks cancelled and failed pickups as halted, not complete', () => {
    const failed = getPickupJourney({ statusValue: 'failed', hasVolunteerAssigned: true })
    expect(failed.isHalted).toBe(true)
    expect(failed.isComplete).toBe(false)
    expect(failed.stages[3].state).toBe('halted')
    expect(getPickupJourney({ statusValue: 'cancelled', hasVolunteerAssigned: false }).stages[2].state).toBe('halted')
  })
})

describe('getDonationJourney', () => {
  it('waits at the match stage until claimed', () => {
    expect(getDonationJourney('available').stages[1].state).toBe('current')
    expect(getDonationJourney('claimed').stages[2].state).toBe('current')
    expect(getDonationJourney('delivered').isComplete).toBe(true)
    expect(getDonationJourney('expired').isHalted).toBe(true)
  })
})

describe('pickFeaturedJourney', () => {
  it('prefers the most advanced active pickup, then a waiting donation, then a completed pickup', () => {
    const done = pickup({ id: 'done', statusValue: 'completed' })
    const scheduled = pickup({ id: 'sched', statusValue: 'scheduled' })
    const transit = pickup({ id: 'transit', statusValue: 'in_transit' })
    const waiting = donation({ id: 'wait' })

    expect(pickFeaturedJourney([done, scheduled, transit], [waiting])?.id).toBe('transit')
    expect(pickFeaturedJourney([done, scheduled], [waiting])?.id).toBe('sched')
    expect(pickFeaturedJourney([done], [waiting])?.id).toBe('wait')
    expect(pickFeaturedJourney([done], [])?.id).toBe('done')
    expect(pickFeaturedJourney([], [donation({ statusValue: 'claimed' })])).toBeNull()
  })
})

describe('food journey in demo mode', () => {
  it('reflects the simulated pickup state as it advances across roles', async () => {
    let state: DemoState = createDemoSeed(new Date())
    let role: 'logistics' | 'volunteer' | 'admin' = 'logistics'
    let n = 0
    const actions = createDemoDashboardActions({
      getState: () => state,
      setState: (next) => { state = next },
      getActor: () => getDemoPersona(state, role)!,
      context: () => ({ now: new Date(), newId: () => `c0000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }),
    })
    const journeyFor = (r: typeof role, id: string) => {
      const p = selectDemoDashboard(state, r)!.pickups.find((x) => x.id === id)!
      return getPickupJourney(p)
    }

    // The seeded yogurt pickup is scheduled and unassigned.
    const scheduled = selectDemoDashboard(state, 'logistics')!.pickups.find((p) => p.statusValue === 'scheduled')!
    expect(journeyFor('logistics', scheduled.id).currentIndex).toBe(2)

    expect((await actions.acceptPickup({ pickupId: scheduled.id })).success).toBe(true)
    expect(journeyFor('logistics', scheduled.id).summary).toMatch(/volunteer still needs/)

    const volunteerId = getDemoPersona(state, 'volunteer')!.id
    expect((await actions.assignVolunteerToPickup({ pickupId: scheduled.id, volunteerId })).success).toBe(true)

    role = 'volunteer'
    expect(journeyFor('volunteer', scheduled.id).summary).toMatch(/volunteer is assigned/)
    expect((await actions.updatePickupStatus({ pickupId: scheduled.id, status: 'in_transit' })).success).toBe(true)
    expect(journeyFor('volunteer', scheduled.id).isComplete).toBe(false)
    expect((await actions.updatePickupStatus({ pickupId: scheduled.id, status: 'completed' })).success).toBe(true)

    // Every role that can see the pickup sees the same, completed journey.
    expect(journeyFor('volunteer', scheduled.id).isComplete).toBe(true)
    expect(journeyFor('admin', scheduled.id).isComplete).toBe(true)
  })
})

describe('journey invariants for every status', () => {
  // Typed against the DB enums: adding a status there without handling it here fails typecheck.
  const pickupStatuses: Record<PickupCardModel['statusValue'], true> = { scheduled: true, driver_assigned: true, in_transit: true, completed: true, cancelled: true, failed: true }
  const donationStatuses: Record<DonationCardModel['statusValue'], true> = { available: true, matched: true, claimed: true, pickup_scheduled: true, picked_up: true, delivered: true, expired: true, cancelled: true }
  const journeys = [
    ...Object.keys(pickupStatuses).flatMap((s) => [true, false].map((v) => [`pickup:${s}:${v}`, getPickupJourney({ statusValue: s as PickupCardModel['statusValue'], hasVolunteerAssigned: v })] as const)),
    ...Object.keys(donationStatuses).map((s) => [`donation:${s}`, getDonationJourney(s as DonationCardModel['statusValue'])] as const),
  ]

  it.each(journeys)('%s is internally consistent', (_name, journey) => {
    expect(journey).toBeDefined()
    expect(journey.stages).toHaveLength(JOURNEY_STAGES.length)
    expect(journey.progress).toBeGreaterThanOrEqual(0)
    expect(journey.progress).toBeLessThanOrEqual(1)
    expect(journey.summary.length).toBeGreaterThan(0)
    const active = journey.stages.filter((s) => s.state === 'current' || s.state === 'halted')
    if (journey.isComplete) {
      expect(active).toHaveLength(0)
      expect(journey.stages.every((s) => s.state === 'done')).toBe(true)
    } else {
      expect(active).toHaveLength(1)
      expect(journey.stages.findIndex((s) => s.state === 'current' || s.state === 'halted')).toBe(journey.currentIndex)
      expect(journey.stages.at(-1)?.state).not.toBe('done')
    }
    expect(journey.isComplete && journey.isHalted).toBe(false)
  })
})

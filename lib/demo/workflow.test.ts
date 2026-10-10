import { describe, expect, it } from 'vitest'

import type { UserRole } from '@/lib/db/types'
import {
  demoAcceptPickup,
  demoAssignVolunteer,
  demoCreateDonation,
  demoCreateRequirement,
  demoDeleteDonation,
  demoMarkNotificationsRead,
  demoRespondToMatch,
  demoUpdatePickupStatus,
  scoreDemoMatch,
  type DemoContext,
} from '@/lib/demo/engine'
import { DEMO_PERSONA_IDS, createDemoSeed } from '@/lib/demo/seed'
import { getDemoPersona, selectDemoDashboard } from '@/lib/demo/selectors'
import { DEMO_ROLES, type DemoState } from '@/lib/demo/types'
import { computeFinalScore } from '@/lib/services/match-scoring'

const NOW = new Date()
let idCounter = 0
const ctx = (): DemoContext => ({ now: NOW, newId: () => `a0000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}` })
const inFuture = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

function persona(state: DemoState, role: UserRole) {
  const p = getDemoPersona(state, role)
  if (!p) throw new Error(`missing ${role} persona`)
  return p
}

function expectOk<T>(outcome: { state: DemoState; result: { success: true; data: T } | { success: false; error: string } }) {
  if (!outcome.result.success) throw new Error(`expected success, got: ${outcome.result.error}`)
  return { state: outcome.state, data: outcome.result.data }
}

describe('demo seed', () => {
  const seed = createDemoSeed(NOW)

  it('has a dedicated persona for all five roles', () => {
    for (const role of DEMO_ROLES) {
      expect(getDemoPersona(seed, role)?.role).toBe(role)
      expect(selectDemoDashboard(seed, role)).not.toBeNull()
    }
  })

  it('tells one coherent workflow story', () => {
    const volunteer = selectDemoDashboard(seed, 'volunteer')!
    expect(volunteer.pickups).toHaveLength(1)
    expect(volunteer.pickups[0]).toMatchObject({ title: 'Cooked rice and dal trays', statusValue: 'driver_assigned', isAssignedToMe: true })

    const logistics = selectDemoDashboard(seed, 'logistics')!
    expect(logistics.pickups.some((p) => p.statusValue === 'scheduled' && !p.isAssignedToMe)).toBe(true)

    const ngo = selectDemoDashboard(seed, 'ngo')!
    expect(ngo.matches.some((m) => m.status === 'pending')).toBe(true)
    expect(ngo.requirements.every((r) => r.organization_id === persona(seed, 'ngo').organization_id)).toBe(true)

    const donor = selectDemoDashboard(seed, 'donor')!
    expect(donor.donorStats.completedPickupCount).toBe(1)
    expect(donor.notifications.some((n) => n.message.startsWith('Pickup completed'))).toBe(true)
  })

  it('derives match scores from the real weighting formula', () => {
    for (const match of seed.matches) {
      expect(match.final_score).toBeCloseTo(
        computeFinalScore({ semantic: match.semantic_score, distance: match.distance_score, capacity: match.capacity_score, urgency: match.urgency_score }),
      )
      expect(match.explanation).toContain(`${Math.round(match.semantic_score)}% food-category match (simulated)`)
    }
  })
})

describe('role-scoped demo views', () => {
  const seed = createDemoSeed(NOW)

  it('volunteer never sees donor data or another volunteer’s pickups', () => {
    const view = selectDemoDashboard(seed, 'volunteer')!
    const me = persona(seed, 'volunteer').id
    expect(view.matches).toEqual([])
    expect(seed.pickups.filter((p) => p.volunteer_id === me)).toHaveLength(view.pickups.length)
    expect(view.pickups.every((p) => p.isAssignedToMe)).toBe(true)
  })

  it('donor only sees their own donations', () => {
    const view = selectDemoDashboard(seed, 'donor')!
    const mine = seed.donations.filter((d) => d.donor_id === DEMO_PERSONA_IDS.donor)
    expect(view.donations.map((d) => d.id).sort()).toEqual(mine.map((d) => d.id).sort())
  })

  it('admin sees everything plus the user directory', () => {
    const view = selectDemoDashboard(seed, 'admin')!
    expect(view.donations).toHaveLength(seed.donations.length)
    expect(view.pickups).toHaveLength(seed.pickups.length)
    expect(view.directory.users).toHaveLength(seed.profiles.length)
  })

  it('only admin gets the user directory; NGO sees its own organization first', () => {
    expect(selectDemoDashboard(seed, 'ngo')!.directory.users).toBeNull()
    expect(selectDemoDashboard(seed, 'ngo')!.directory.organizations[0].isMine).toBe(true)
  })
})

describe('demo workflow — shared state across role switches', () => {
  it('runs donation → match → claim → pickup → volunteer delivery end to end', () => {
    let state = createDemoSeed(NOW)
    const donor = persona(state, 'donor')
    const ngo = persona(state, 'ngo')
    const logistics = persona(state, 'logistics')
    const volunteer = persona(state, 'volunteer')

    // 1. Donor posts surplus food — recommendations are generated.
    const created = expectOk(demoCreateDonation(state, donor, { title: 'Paneer curry trays', food_category: 'Prepared Meals', quantity: 20, unit: 'kg', expires_at: inFuture(), pickup_address: '80 Feet Road, Koramangala', latitude: 12.9352, longitude: 77.6245 }, ctx()))
    state = created.state
    expect(selectDemoDashboard(state, 'donor')!.donations[0]).toMatchObject({ id: created.data.id, statusValue: 'available' })

    // 2. NGO sees an explainable recommendation and claims it.
    const ngoMatch = selectDemoDashboard(state, 'ngo')!.matches.find((m) => m.donationTitle === 'Paneer curry trays')!
    expect(ngoMatch.status).toBe('pending')
    expect(ngoMatch.explanation).toMatch(/km away/)
    const claimed = expectOk(demoRespondToMatch(state, ngo, { matchId: ngoMatch.id, decision: 'accepted' }, ctx()))
    state = claimed.state
    const pickupId = claimed.data.pickupId!
    expect(state.donations.find((d) => d.id === created.data.id)?.status).toBe('claimed')

    // 3. Logistics partner sees the open pickup, accepts it and assigns the volunteer.
    expect(selectDemoDashboard(state, 'logistics')!.pickups.find((p) => p.id === pickupId)?.statusValue).toBe('scheduled')
    state = expectOk(demoAcceptPickup(state, logistics, { pickupId }, ctx())).state
    state = expectOk(demoAssignVolunteer(state, logistics, { pickupId, volunteerId: volunteer.id }, ctx())).state

    // 4. Switching to the volunteer shows the very same assignment.
    const volunteerView = selectDemoDashboard(state, 'volunteer')!
    expect(volunteerView.pickups.find((p) => p.id === pickupId)).toMatchObject({ statusValue: 'driver_assigned', isAssignedToMe: true })
    expect(volunteerView.notifications[0].title).toBe('New pickup assignment')

    // 5. Volunteer progresses it through the lifecycle.
    const completedBefore = selectDemoDashboard(state, 'donor')!.donorStats.completedPickupCount
    state = expectOk(demoUpdatePickupStatus(state, volunteer, { pickupId, status: 'in_transit' }, ctx())).state
    state = expectOk(demoUpdatePickupStatus(state, volunteer, { pickupId, status: 'completed' }, ctx())).state

    // 6. Stats and notifications reflect it for the other roles.
    const donorView = selectDemoDashboard(state, 'donor')!
    expect(donorView.donorStats.completedPickupCount).toBe(completedBefore + 1)
    expect(donorView.notifications[0].message).toBe('Pickup completed — thank you for your donation!')
    expect(selectDemoDashboard(state, 'ngo')!.pickups.find((p) => p.id === pickupId)?.statusValue).toBe('completed')
    expect(selectDemoDashboard(state, 'logistics')!.logisticsStats.completedDeliveryCount).toBeGreaterThanOrEqual(1)
  })

  it('does not mutate the previous state object', () => {
    const state = createDemoSeed(NOW)
    const snapshot = JSON.stringify(state)
    demoCreateDonation(state, persona(state, 'donor'), { title: 'Apples', food_category: 'Fruits & Vegetables', quantity: 5, unit: 'kg', expires_at: inFuture(), pickup_address: '1 Market Street' }, ctx())
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('lets an NGO add a requirement and a donor delete an open donation', () => {
    let state = createDemoSeed(NOW)
    const before = state.requirements.length
    state = expectOk(demoCreateRequirement(state, persona(state, 'ngo'), { food_categories: ['Beverages'], daily_capacity_kg: 30, urgency_level: 'low', dietary_requirements: [], preferred_quantity_min: 0, is_active: true }, ctx())).state
    expect(state.requirements).toHaveLength(before + 1)

    const open = state.donations.find((d) => d.donor_id === DEMO_PERSONA_IDS.donor && d.status === 'available')!
    state = expectOk(demoDeleteDonation(state, persona(state, 'donor'), { donationId: open.id })).state
    expect(state.donations.some((d) => d.id === open.id)).toBe(false)
    expect(state.matches.some((m) => m.donation_id === open.id)).toBe(false)
  })

  it('marks only the current persona’s notifications as read', () => {
    const state = createDemoSeed(NOW)
    const next = demoMarkNotificationsRead(state, persona(state, 'volunteer'))
    expect(selectDemoDashboard(next, 'volunteer')!.notifications.every((n) => n.read)).toBe(true)
    expect(selectDemoDashboard(next, 'donor')!.notifications).toEqual(selectDemoDashboard(state, 'donor')!.notifications)
  })
})

describe('demo engine enforces the same rules as the real actions', () => {
  const seed = createDemoSeed(NOW)
  const openPickup = seed.pickups.find((p) => p.status === 'scheduled' && p.logistics_user_id === null)!
  const priyaPickup = seed.pickups.find((p) => p.volunteer_id === DEMO_PERSONA_IDS.volunteer)!

  it('rejects role-inappropriate actions', () => {
    expect(demoAcceptPickup(seed, persona(seed, 'volunteer'), { pickupId: openPickup.id }, ctx()).result.success).toBe(false)
    expect(demoAcceptPickup(seed, persona(seed, 'donor'), { pickupId: openPickup.id }, ctx()).result.success).toBe(false)
    expect(demoCreateDonation(seed, persona(seed, 'volunteer'), { title: 'Bread', food_category: 'Bakery & Bread', quantity: 2, unit: 'kg', expires_at: inFuture(), pickup_address: '1 Market Street' }, ctx()).result.success).toBe(false)
    expect(demoCreateRequirement(seed, persona(seed, 'donor'), { food_categories: ['Other'], daily_capacity_kg: 1, urgency_level: 'low', dietary_requirements: [], preferred_quantity_min: 0, is_active: true }, ctx()).result.success).toBe(false)
  })

  it('rejects invalid lifecycle transitions', () => {
    const volunteer = persona(seed, 'volunteer')
    const skip = demoUpdatePickupStatus(seed, volunteer, { pickupId: priyaPickup.id, status: 'completed' }, ctx())
    expect(skip.result).toEqual({ success: false, error: 'Cannot move a pickup from "driver_assigned" to "completed".' })
    const cancel = demoUpdatePickupStatus(seed, volunteer, { pickupId: priyaPickup.id, status: 'cancelled' }, ctx())
    expect(cancel.result.success).toBe(false)
  })

  it('does not let a volunteer update a pickup they are not assigned to', () => {
    const otherVolunteerPickup = seed.pickups.find((p) => p.volunteer_id !== null && p.volunteer_id !== DEMO_PERSONA_IDS.volunteer)!
    expect(demoUpdatePickupStatus(seed, persona(seed, 'volunteer'), { pickupId: otherVolunteerPickup.id, status: 'failed' }, ctx()).result.success).toBe(false)
  })

  it('validates input with the real Zod schemas', () => {
    const result = demoCreateDonation(seed, persona(seed, 'donor'), { title: 'x', food_category: 'Other', quantity: -1, unit: 'kg', expires_at: inFuture(), pickup_address: 'here' }, ctx()).result
    expect(result.success).toBe(false)
  })

  it('cannot claim a donation twice', () => {
    const claimedDonation = seed.donations.find((d) => d.status === 'claimed')!
    const pendingOnClaimed = seed.matches.find((m) => m.donation_id === claimedDonation.id && m.status === 'pending' && m.organization_id === persona(seed, 'ngo').organization_id)
    if (pendingOnClaimed) {
      expect(demoRespondToMatch(seed, persona(seed, 'ngo'), { matchId: pendingOnClaimed.id, decision: 'accepted' }, ctx()).result.success).toBe(false)
    }
    const accepted = seed.matches.find((m) => m.status === 'accepted' && m.organization_id === persona(seed, 'ngo').organization_id)!
    expect(demoRespondToMatch(seed, persona(seed, 'ngo'), { matchId: accepted.id, decision: 'accepted' }, ctx()).result).toEqual({
      success: false,
      error: 'This recommendation has already been responded to.',
    })
  })

  it('a failed action leaves state untouched', () => {
    const outcome = demoAcceptPickup(seed, persona(seed, 'donor'), { pickupId: openPickup.id }, ctx())
    expect(outcome.state).toBe(seed)
  })

  it('scores a category match above a non-match', () => {
    const donation = seed.donations[0]
    const org = seed.organizations[0]
    const req = seed.requirements.find((r) => r.organization_id === org.id && r.is_active)!
    const match = scoreDemoMatch({ ...donation, food_category: req.food_categories[0] }, req, org)
    const miss = scoreDemoMatch({ ...donation, food_category: 'Beverages' }, req, org)
    expect(match.final_score).toBeGreaterThan(miss.final_score)
  })
})

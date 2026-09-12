import { describe, expect, it } from 'vitest'

import {
  canAcceptPickup,
  canAssignVolunteer,
  canUpdatePickupStatus,
  getLogisticsEventType,
  isValidPickupTransition,
  isValidTransitionForRole,
} from '@/lib/services/pickup-lifecycle'
import type { Database } from '@/lib/db/types'

type PickupRow = Database['public']['Tables']['pickups']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    full_name: 'Test User',
    email: 'test@example.com',
    role: 'logistics',
    phone: null,
    avatar_url: null,
    organization_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makePickup(overrides: Partial<PickupRow> = {}): PickupRow {
  return {
    id: 'pickup-1',
    donation_id: 'donation-1',
    organization_id: 'org-1',
    logistics_user_id: 'user-1',
    volunteer_id: null,
    pickup_address: '123 Main St',
    pickup_location: null,
    destination_address: '',
    destination_location: null,
    scheduled_at: '2026-01-01T00:00:00.000Z',
    estimated_duration_minutes: null,
    actual_pickup_at: null,
    actual_delivery_at: null,
    status: 'scheduled',
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isValidPickupTransition', () => {
  it('allows the documented forward transitions', () => {
    expect(isValidPickupTransition('scheduled', 'driver_assigned')).toBe(true)
    expect(isValidPickupTransition('driver_assigned', 'in_transit')).toBe(true)
    expect(isValidPickupTransition('in_transit', 'completed')).toBe(true)
  })

  it('rejects skipping a stage', () => {
    expect(isValidPickupTransition('scheduled', 'in_transit')).toBe(false)
    expect(isValidPickupTransition('scheduled', 'completed')).toBe(false)
  })

  it('rejects any transition out of a terminal status', () => {
    expect(isValidPickupTransition('completed', 'in_transit')).toBe(false)
    expect(isValidPickupTransition('cancelled', 'scheduled')).toBe(false)
    expect(isValidPickupTransition('failed', 'driver_assigned')).toBe(false)
  })

  it('allows cancellation from the two active-but-not-yet-moving states', () => {
    expect(isValidPickupTransition('scheduled', 'cancelled')).toBe(true)
    expect(isValidPickupTransition('driver_assigned', 'cancelled')).toBe(true)
    expect(isValidPickupTransition('in_transit', 'cancelled')).toBe(false)
  })
})

describe('canUpdatePickupStatus', () => {
  it('allows the assigned logistics user', () => {
    expect(canUpdatePickupStatus(makePickup({ logistics_user_id: 'user-1' }), makeProfile({ id: 'user-1', role: 'logistics' }))).toBe(true)
  })

  it('rejects a logistics user who is not assigned to this pickup', () => {
    expect(canUpdatePickupStatus(makePickup({ logistics_user_id: 'other-user' }), makeProfile({ id: 'user-1', role: 'logistics' }))).toBe(false)
  })

  it('rejects a donor or ngo regardless of assignment', () => {
    expect(canUpdatePickupStatus(makePickup({ logistics_user_id: 'user-1' }), makeProfile({ id: 'user-1', role: 'donor' }))).toBe(false)
    expect(canUpdatePickupStatus(makePickup({ logistics_user_id: 'user-1' }), makeProfile({ id: 'user-1', role: 'ngo' }))).toBe(false)
  })

  it('always allows admin', () => {
    expect(canUpdatePickupStatus(makePickup({ logistics_user_id: 'someone-else' }), makeProfile({ id: 'user-1', role: 'admin' }))).toBe(true)
  })
})

describe('canAcceptPickup', () => {
  it('allows logistics and admin, rejects donor/ngo', () => {
    expect(canAcceptPickup(makeProfile({ role: 'logistics' }))).toBe(true)
    expect(canAcceptPickup(makeProfile({ role: 'admin' }))).toBe(true)
    expect(canAcceptPickup(makeProfile({ role: 'donor' }))).toBe(false)
    expect(canAcceptPickup(makeProfile({ role: 'ngo' }))).toBe(false)
  })

  it('rejects volunteer — a volunteer never self-assigns to an unassigned pickup', () => {
    expect(canAcceptPickup(makeProfile({ role: 'volunteer' }))).toBe(false)
  })
})

describe('canUpdatePickupStatus for volunteer', () => {
  it('allows the assigned volunteer', () => {
    expect(canUpdatePickupStatus(makePickup({ volunteer_id: 'user-1' }), makeProfile({ id: 'user-1', role: 'volunteer' }))).toBe(true)
  })

  it('rejects a volunteer who is not assigned to this pickup', () => {
    expect(canUpdatePickupStatus(makePickup({ volunteer_id: 'other-user' }), makeProfile({ id: 'user-1', role: 'volunteer' }))).toBe(false)
  })

  it('rejects a volunteer assigned as volunteer_id on a DIFFERENT pickup than the one being checked', () => {
    expect(canUpdatePickupStatus(makePickup({ volunteer_id: null, logistics_user_id: 'user-1' }), makeProfile({ id: 'user-1', role: 'volunteer' }))).toBe(
      false,
    )
  })
})

describe('isValidTransitionForRole', () => {
  it('allows a logistics user the full existing transition graph, unchanged', () => {
    expect(isValidTransitionForRole('scheduled', 'driver_assigned', 'logistics')).toBe(true)
    expect(isValidTransitionForRole('driver_assigned', 'cancelled', 'logistics')).toBe(true)
    expect(isValidTransitionForRole('scheduled', 'in_transit', 'logistics')).toBe(false)
  })

  it('restricts a volunteer to in_transit/completed/failed as a target, even when the base graph allows more', () => {
    expect(isValidTransitionForRole('driver_assigned', 'in_transit', 'volunteer')).toBe(true)
    expect(isValidTransitionForRole('in_transit', 'completed', 'volunteer')).toBe(true)
    expect(isValidTransitionForRole('driver_assigned', 'in_transit', 'volunteer')).toBe(true)
  })

  it('rejects a volunteer moving to driver_assigned or cancelled, even though those are valid for logistics', () => {
    expect(isValidTransitionForRole('scheduled', 'driver_assigned', 'volunteer')).toBe(false)
    expect(isValidTransitionForRole('driver_assigned', 'cancelled', 'volunteer')).toBe(false)
  })

  it('still rejects a volunteer skipping a stage, matching the base graph', () => {
    expect(isValidTransitionForRole('scheduled', 'completed', 'volunteer')).toBe(false)
  })
})

describe('canAssignVolunteer', () => {
  it('allows the logistics user who owns the pickup', () => {
    expect(canAssignVolunteer(makePickup({ logistics_user_id: 'user-1' }), makeProfile({ id: 'user-1', role: 'logistics' }))).toBe(true)
  })

  it('rejects a logistics user who does not own the pickup', () => {
    expect(canAssignVolunteer(makePickup({ logistics_user_id: 'other-user' }), makeProfile({ id: 'user-1', role: 'logistics' }))).toBe(false)
  })

  it('rejects donor, ngo, and volunteer regardless of ownership fields', () => {
    expect(canAssignVolunteer(makePickup({ logistics_user_id: 'user-1' }), makeProfile({ id: 'user-1', role: 'donor' }))).toBe(false)
    expect(canAssignVolunteer(makePickup({ logistics_user_id: 'user-1' }), makeProfile({ id: 'user-1', role: 'ngo' }))).toBe(false)
    expect(canAssignVolunteer(makePickup({ volunteer_id: 'user-1' }), makeProfile({ id: 'user-1', role: 'volunteer' }))).toBe(false)
  })

  it('always allows admin', () => {
    expect(canAssignVolunteer(makePickup({ logistics_user_id: 'someone-else' }), makeProfile({ id: 'user-1', role: 'admin' }))).toBe(true)
  })
})

describe('getLogisticsEventType', () => {
  it('maps known statuses to a logistics_event_type', () => {
    expect(getLogisticsEventType('driver_assigned')).toBe('driver_assigned')
    expect(getLogisticsEventType('in_transit')).toBe('in_transit')
    expect(getLogisticsEventType('completed')).toBe('delivered')
  })

  it('maps both failed and cancelled to exception', () => {
    expect(getLogisticsEventType('failed')).toBe('exception')
    expect(getLogisticsEventType('cancelled')).toBe('exception')
  })

  it('returns null for scheduled (not a transition event)', () => {
    expect(getLogisticsEventType('scheduled')).toBeNull()
  })
})

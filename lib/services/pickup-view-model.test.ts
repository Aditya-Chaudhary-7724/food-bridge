import { describe, expect, it } from 'vitest'

import { getPickupStatusLabel, getPickupStatusTone, toPickupCardModel } from '@/lib/services/pickup-view-model'

describe('getPickupStatusLabel / getPickupStatusTone', () => {
  it('maps every pickup_status to a distinct label', () => {
    expect(getPickupStatusLabel('scheduled')).toBe('Scheduled')
    expect(getPickupStatusLabel('in_transit')).toBe('In transit')
    expect(getPickupStatusLabel('completed')).toBe('Completed')
  })

  it('assigns a positive tone to completed and a negative tone to failed/cancelled', () => {
    expect(getPickupStatusTone('completed')).toBe('green')
    expect(getPickupStatusTone('failed')).toBe('rose')
    expect(getPickupStatusTone('cancelled')).toBe('rose')
  })
})

describe('toPickupCardModel', () => {
  it('flags a pickup as assigned to the current user when logistics_user_id matches', () => {
    const card = toPickupCardModel(
      {
        id: 'pickup-1',
        donationTitle: 'Bakery surplus',
        organizationName: 'Hope Foundation',
        status: 'driver_assigned',
        scheduled_at: '2026-01-01T00:00:00.000Z',
        logistics_user_id: 'user-1',
        volunteer_id: null,
      },
      'user-1',
    )
    expect(card.isAssignedToMe).toBe(true)
    expect(card.title).toBe('Bakery surplus')
  })

  it('flags a pickup as assigned to the current user when volunteer_id matches, even though logistics_user_id belongs to someone else', () => {
    const card = toPickupCardModel(
      {
        id: 'pickup-3',
        donationTitle: 'Bakery surplus',
        organizationName: 'Hope Foundation',
        status: 'in_transit',
        scheduled_at: '2026-01-01T00:00:00.000Z',
        logistics_user_id: 'logistics-user',
        volunteer_id: 'volunteer-user',
      },
      'volunteer-user',
    )
    expect(card.isAssignedToMe).toBe(true)
    expect(card.hasVolunteerAssigned).toBe(true)
  })

  it('does not flag a pickup as assigned when neither logistics_user_id nor volunteer_id matches', () => {
    const card = toPickupCardModel(
      {
        id: 'pickup-4',
        donationTitle: 'Bakery surplus',
        organizationName: 'Hope Foundation',
        status: 'in_transit',
        scheduled_at: '2026-01-01T00:00:00.000Z',
        logistics_user_id: 'logistics-user',
        volunteer_id: 'other-volunteer',
      },
      'volunteer-user',
    )
    expect(card.isAssignedToMe).toBe(false)
  })

  it('falls back to safe defaults for missing donation/org names', () => {
    const card = toPickupCardModel(
      {
        id: 'pickup-2',
        donationTitle: null,
        organizationName: null,
        status: 'scheduled',
        scheduled_at: '2026-01-01T00:00:00.000Z',
        logistics_user_id: null,
        volunteer_id: null,
      },
      'user-1',
    )
    expect(card.title).toBe('Donation')
    expect(card.organizationName).toBe('Unassigned organization')
    expect(card.isAssignedToMe).toBe(false)
  })
})

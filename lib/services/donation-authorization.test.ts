import { describe, expect, it } from 'vitest'

import { canClaimDonation, canCreateDonation, canDeleteDonation, canEditDonation } from '@/lib/services/donation-authorization'
import type { Database } from '@/lib/db/types'

type DonationRow = Database['public']['Tables']['donations']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

const DONOR_ID = 'donor-1'
const OTHER_DONOR_ID = 'donor-2'

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: DONOR_ID,
    full_name: 'Test User',
    email: 'test@example.com',
    role: 'donor',
    phone: null,
    avatar_url: null,
    organization_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeDonation(overrides: Partial<DonationRow> = {}): DonationRow {
  return {
    id: 'donation-1',
    donor_id: DONOR_ID,
    organization_id: null,
    title: 'Fresh produce',
    description: null,
    food_category: 'Fruits & Vegetables',
    quantity: 10,
    unit: 'kg',
    prepared_at: null,
    expires_at: '2026-01-02T00:00:00.000Z',
    pickup_address: '123 Main St',
    pickup_location: null,
    latitude: null,
    longitude: null,
    status: 'available',
    food_embedding: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('canCreateDonation', () => {
  it('allows donor accounts', () => {
    expect(canCreateDonation(makeProfile({ role: 'donor' }))).toBe(true)
  })

  it('allows admin accounts', () => {
    expect(canCreateDonation(makeProfile({ role: 'admin' }))).toBe(true)
  })

  it('disallows ngo accounts', () => {
    expect(canCreateDonation(makeProfile({ role: 'ngo' }))).toBe(false)
  })

  it('disallows logistics accounts', () => {
    expect(canCreateDonation(makeProfile({ role: 'logistics' }))).toBe(false)
  })
})

describe('canEditDonation', () => {
  it('allows the owning donor while status is available', () => {
    const donation = makeDonation({ status: 'available' })
    expect(canEditDonation(donation, makeProfile())).toBe(true)
  })

  it('allows the owning donor while status is matched', () => {
    const donation = makeDonation({ status: 'matched' })
    expect(canEditDonation(donation, makeProfile())).toBe(true)
  })

  it('disallows the owning donor once claimed', () => {
    const donation = makeDonation({ status: 'claimed' })
    expect(canEditDonation(donation, makeProfile())).toBe(false)
  })

  it('disallows a different donor', () => {
    const donation = makeDonation({ donor_id: OTHER_DONOR_ID, status: 'available' })
    expect(canEditDonation(donation, makeProfile())).toBe(false)
  })

  it('always allows admin, regardless of status or ownership', () => {
    const donation = makeDonation({ donor_id: OTHER_DONOR_ID, status: 'delivered' })
    expect(canEditDonation(donation, makeProfile({ role: 'admin' }))).toBe(true)
  })
})

describe('canDeleteDonation', () => {
  it('allows the owning donor only while status is available', () => {
    expect(canDeleteDonation(makeDonation({ status: 'available' }), makeProfile())).toBe(true)
    expect(canDeleteDonation(makeDonation({ status: 'matched' }), makeProfile())).toBe(false)
  })

  it('always allows admin', () => {
    expect(canDeleteDonation(makeDonation({ donor_id: OTHER_DONOR_ID, status: 'delivered' }), makeProfile({ role: 'admin' }))).toBe(true)
  })
})

describe('canClaimDonation', () => {
  it('allows ngo accounts', () => {
    expect(canClaimDonation(makeProfile({ role: 'ngo' }))).toBe(true)
  })

  it('allows admin accounts', () => {
    expect(canClaimDonation(makeProfile({ role: 'admin' }))).toBe(true)
  })

  it('disallows donor accounts', () => {
    expect(canClaimDonation(makeProfile({ role: 'donor' }))).toBe(false)
  })

  it('disallows logistics accounts', () => {
    expect(canClaimDonation(makeProfile({ role: 'logistics' }))).toBe(false)
  })
})

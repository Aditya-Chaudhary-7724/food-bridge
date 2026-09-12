import { describe, expect, it } from 'vitest'

import { claimDonationSchema, createDonationSchema, deleteDonationSchema, donationItemSchema, updateDonationSchema } from '@/lib/validations/donation'

describe('createDonationSchema', () => {
  // Computed relative to "now" rather than hardcoded, since the schema now
  // requires expires_at to be in the future — a fixed date would eventually
  // become the past and make this suite fail non-deterministically.
  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const validInput = {
    title: 'Fresh produce assortment',
    food_category: 'Fruits & Vegetables',
    quantity: 12,
    expires_at: oneDayFromNow,
    pickup_address: '123 Main Street',
  }

  it('accepts a valid minimal donation', () => {
    const result = createDonationSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.unit).toBe('kg')
    }
  })

  it('rejects a title shorter than 3 characters', () => {
    const result = createDonationSchema.safeParse({ ...validInput, title: 'Hi' })
    expect(result.success).toBe(false)
  })

  it('rejects a non-positive quantity', () => {
    const result = createDonationSchema.safeParse({ ...validInput, quantity: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects a missing pickup address', () => {
    const { pickup_address: _pickupAddress, ...rest } = validInput
    const result = createDonationSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects an invalid expires_at value', () => {
    const result = createDonationSchema.safeParse({ ...validInput, expires_at: 'not-a-date' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty expires_at value', () => {
    const result = createDonationSchema.safeParse({ ...validInput, expires_at: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a past expires_at value', () => {
    const result = createDonationSchema.safeParse({ ...validInput, expires_at: oneDayAgo })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['expires_at'])
    }
  })

  it('accepts a valid future expires_at value', () => {
    const result = createDonationSchema.safeParse({ ...validInput, expires_at: oneDayFromNow })
    expect(result.success).toBe(true)
  })

  it('accepts nested donation items', () => {
    const result = createDonationSchema.safeParse({
      ...validInput,
      items: [{ name: 'Apples', quantity: 5 }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items?.[0]?.storage_requirement).toBe('ambient')
    }
  })
})

describe('donationItemSchema', () => {
  it('rejects a negative item quantity', () => {
    const result = donationItemSchema.safeParse({ name: 'Bread', quantity: -1 })
    expect(result.success).toBe(false)
  })

  it('defaults dietary_flags to an empty array', () => {
    const result = donationItemSchema.safeParse({ name: 'Bread', quantity: 2 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dietary_flags).toEqual([])
    }
  })
})

describe('updateDonationSchema', () => {
  it('accepts a partial update with a single field', () => {
    const result = updateDonationSchema.safeParse({ quantity: 20 })
    expect(result.success).toBe(true)
  })

  it('accepts an empty object', () => {
    const result = updateDonationSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('still rejects an invalid value for a provided field', () => {
    const result = updateDonationSchema.safeParse({ quantity: -5 })
    expect(result.success).toBe(false)
  })
})

describe('claimDonationSchema', () => {
  it('accepts two valid UUIDs', () => {
    const result = claimDonationSchema.safeParse({
      donationId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID donationId', () => {
    const result = claimDonationSchema.safeParse({
      donationId: 'not-a-uuid',
      organizationId: '22222222-2222-4222-8222-222222222222',
    })
    expect(result.success).toBe(false)
  })
})

describe('deleteDonationSchema', () => {
  it('accepts a valid UUID', () => {
    const result = deleteDonationSchema.safeParse({ donationId: '11111111-1111-4111-8111-111111111111' })
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID donationId', () => {
    const result = deleteDonationSchema.safeParse({ donationId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects a missing donationId', () => {
    const result = deleteDonationSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

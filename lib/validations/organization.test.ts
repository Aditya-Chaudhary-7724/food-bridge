import { describe, expect, it } from 'vitest'

import { createOrganizationSchema } from '@/lib/validations/organization'

describe('createOrganizationSchema', () => {
  const validInput = {
    name: 'Hope Foundation',
    address: '123 Main Street, Springfield',
  }

  it('accepts a valid minimal organization', () => {
    const result = createOrganizationSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('accepts a fully populated organization', () => {
    const result = createOrganizationSchema.safeParse({
      ...validInput,
      description: 'We distribute meals to families in need.',
      contact_email: 'contact@hope.org',
      contact_phone: '+1 555 0100',
      daily_capacity_kg: 200,
      latitude: 40.7128,
      longitude: -74.006,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a name shorter than 2 characters', () => {
    const result = createOrganizationSchema.safeParse({ ...validInput, name: 'H' })
    expect(result.success).toBe(false)
  })

  it('rejects a missing name', () => {
    const { name: _name, ...rest } = validInput
    const result = createOrganizationSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects an address shorter than 5 characters', () => {
    const result = createOrganizationSchema.safeParse({ ...validInput, address: '123' })
    expect(result.success).toBe(false)
  })

  it('rejects a missing address', () => {
    const { address: _address, ...rest } = validInput
    const result = createOrganizationSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects an invalid contact email', () => {
    const result = createOrganizationSchema.safeParse({ ...validInput, contact_email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('rejects a negative daily capacity', () => {
    const result = createOrganizationSchema.safeParse({ ...validInput, daily_capacity_kg: -10 })
    expect(result.success).toBe(false)
  })

  it('rejects an out-of-range latitude/longitude', () => {
    expect(createOrganizationSchema.safeParse({ ...validInput, latitude: 200 }).success).toBe(false)
    expect(createOrganizationSchema.safeParse({ ...validInput, longitude: -200 }).success).toBe(false)
  })

  it('never accepts a type field — the server always sets it to ngo', () => {
    const result = createOrganizationSchema.safeParse({ ...validInput, type: 'logistics' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('type' in result.data).toBe(false)
    }
  })
})

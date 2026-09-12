import { describe, expect, it } from 'vitest'

import { updateProfileSchema } from '@/lib/validations/profile'

describe('updateProfileSchema', () => {
  it('accepts a valid full_name', () => {
    const result = updateProfileSchema.safeParse({ full_name: 'Jordan Rivera' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty full_name', () => {
    const result = updateProfileSchema.safeParse({ full_name: '' })
    expect(result.success).toBe(false)
  })

  it('accepts an empty object (no changes)', () => {
    const result = updateProfileSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('never accepts a role field, even if supplied', () => {
    const result = updateProfileSchema.safeParse({ full_name: 'Jordan', role: 'admin' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('role' in result.data).toBe(false)
    }
  })
})

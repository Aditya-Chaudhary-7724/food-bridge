import { describe, expect, it } from 'vitest'

import { assignVolunteerSchema } from '@/lib/validations/pickup'

describe('assignVolunteerSchema', () => {
  it('accepts two valid UUIDs', () => {
    const result = assignVolunteerSchema.safeParse({
      pickupId: '11111111-1111-4111-8111-111111111111',
      volunteerId: '22222222-2222-4222-8222-222222222222',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID pickupId', () => {
    const result = assignVolunteerSchema.safeParse({
      pickupId: 'not-a-uuid',
      volunteerId: '22222222-2222-4222-8222-222222222222',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-UUID volunteerId', () => {
    const result = assignVolunteerSchema.safeParse({
      pickupId: '11111111-1111-4111-8111-111111111111',
      volunteerId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })
})

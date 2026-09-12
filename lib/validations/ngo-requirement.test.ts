import { describe, expect, it } from 'vitest'

import { ngoRequirementSchema } from '@/lib/validations/ngo-requirement'

describe('ngoRequirementSchema', () => {
  const valid = {
    food_categories: ['Fruits & Vegetables'],
    daily_capacity_kg: 100,
    urgency_level: 'high' as const,
    dietary_requirements: [],
    preferred_quantity_min: 10,
    preferred_quantity_max: 50,
    is_active: true,
  }

  it('accepts a valid requirement', () => {
    expect(ngoRequirementSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a negative daily capacity', () => {
    expect(ngoRequirementSchema.safeParse({ ...valid, daily_capacity_kg: -1 }).success).toBe(false)
  })

  it('rejects a max quantity below the min quantity', () => {
    const result = ngoRequirementSchema.safeParse({ ...valid, preferred_quantity_min: 50, preferred_quantity_max: 10 })
    expect(result.success).toBe(false)
  })

  it('defaults urgency to medium and is_active to true when omitted', () => {
    const result = ngoRequirementSchema.safeParse({ daily_capacity_kg: 20 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.urgency_level).toBe('medium')
      expect(result.data.is_active).toBe(true)
      expect(result.data.food_categories).toEqual([])
    }
  })

  it('rejects an invalid urgency level', () => {
    expect(ngoRequirementSchema.safeParse({ ...valid, urgency_level: 'extreme' }).success).toBe(false)
  })
})

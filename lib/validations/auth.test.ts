import { describe, expect, it } from 'vitest'

import { SIGNUP_ROLE_OPTIONS } from '@/lib/validations/auth'

describe('SIGNUP_ROLE_OPTIONS', () => {
  it('maps each UI label to the exact backend role value, for every supported role', () => {
    expect(SIGNUP_ROLE_OPTIONS).toEqual([
      { value: 'donor', label: 'Food Donor' },
      { value: 'ngo', label: 'NGO / Organization' },
      { value: 'volunteer', label: 'Volunteer' },
      { value: 'logistics', label: 'Logistics Partner' },
    ])
  })

  it('has a unique value per option', () => {
    const values = SIGNUP_ROLE_OPTIONS.map((option) => option.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

import { describe, expect, it } from 'vitest'

import { createDonationSchema } from '@/lib/validations/donation'
import { updateProfileSchema } from '@/lib/validations/profile'
import { ngoRequirementSchema } from '@/lib/validations/ngo-requirement'
import { createOrganizationSchema } from '@/lib/validations/organization'

// These tests lock in a specific, security-relevant property: none of the
// mutation input schemas accept ownership/authorization fields from the
// client. Server Actions always set donor_id/organization_id/role from the
// authenticated session (see lib/actions/*), never from parsed input — these
// tests make sure a future edit can't accidentally add such a field to a
// schema without a corresponding, deliberate decision.

describe('createDonationSchema never accepts an ownership field', () => {
  it('strips an injected donor_id rather than passing it through', () => {
    const result = createDonationSchema.safeParse({
      title: 'Fresh produce',
      food_category: 'Fruits & Vegetables',
      quantity: 10,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      pickup_address: '123 Main Street',
      donor_id: 'someone-elses-user-id',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('donor_id' in result.data).toBe(false)
    }
  })
})

describe('updateProfileSchema never accepts role or organization_id', () => {
  it('strips injected role/organization_id/id fields', () => {
    const result = updateProfileSchema.safeParse({
      full_name: 'New Name',
      role: 'admin',
      organization_id: 'some-other-org',
      id: 'someone-elses-id',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('role' in result.data).toBe(false)
      expect('organization_id' in result.data).toBe(false)
      expect('id' in result.data).toBe(false)
    }
  })
})

describe('ngoRequirementSchema never accepts organization_id', () => {
  it('strips an injected organization_id rather than passing it through', () => {
    const result = ngoRequirementSchema.safeParse({
      daily_capacity_kg: 50,
      organization_id: 'someone-elses-org-id',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('organization_id' in result.data).toBe(false)
    }
  })
})

describe('createOrganizationSchema never accepts a profile-linking or type field', () => {
  it('strips injected type/organization_id/profile_id/user_id fields — linking always happens server-side to the caller\'s own profile', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'Hope Foundation',
      address: '123 Main Street',
      type: 'logistics',
      organization_id: 'someone-elses-org-id',
      profile_id: 'someone-elses-profile-id',
      user_id: 'someone-elses-user-id',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('type' in result.data).toBe(false)
      expect('organization_id' in result.data).toBe(false)
      expect('profile_id' in result.data).toBe(false)
      expect('user_id' in result.data).toBe(false)
    }
  })
})

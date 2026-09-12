import { describe, expect, it } from 'vitest'

import { canOnboardOrganization } from '@/lib/services/organization-authorization'
import type { Database } from '@/lib/db/types'

type Profile = Database['public']['Tables']['profiles']['Row']

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    full_name: 'Test User',
    email: 'test@example.com',
    role: 'ngo',
    phone: null,
    avatar_url: null,
    organization_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('canOnboardOrganization', () => {
  it('allows an ngo account with no organization linked', () => {
    expect(canOnboardOrganization(makeProfile({ role: 'ngo', organization_id: null }))).toBe(true)
  })

  it('rejects an ngo account that is already linked to an organization', () => {
    expect(canOnboardOrganization(makeProfile({ role: 'ngo', organization_id: 'org-1' }))).toBe(false)
  })

  it('rejects donor, volunteer, logistics, and admin regardless of organization_id', () => {
    expect(canOnboardOrganization(makeProfile({ role: 'donor', organization_id: null }))).toBe(false)
    expect(canOnboardOrganization(makeProfile({ role: 'volunteer', organization_id: null }))).toBe(false)
    expect(canOnboardOrganization(makeProfile({ role: 'logistics', organization_id: null }))).toBe(false)
    expect(canOnboardOrganization(makeProfile({ role: 'admin', organization_id: null }))).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { getRoleLabel, getUserCreatedDate, getUserDisplayName, getUserInitials } from '@/lib/user'

describe('getUserDisplayName', () => {
  it('prefers full_name from metadata', () => {
    expect(getUserDisplayName({ email: 'a@b.com', user_metadata: { full_name: 'Jordan Rivera' } })).toBe('Jordan Rivera')
  })

  it('falls back to first_name + last_name', () => {
    expect(getUserDisplayName({ email: 'a@b.com', user_metadata: { first_name: 'Jordan', last_name: 'Rivera' } })).toBe(
      'Jordan Rivera',
    )
  })

  it('falls back to the email local part when no name metadata exists', () => {
    expect(getUserDisplayName({ email: 'jordan.rivera@example.com', user_metadata: {} })).toBe('jordan rivera')
  })

  it('falls back to a generic label with no user at all', () => {
    expect(getUserDisplayName(null)).toBe('FoodBridge user')
  })

  it('ignores blank/whitespace-only metadata values', () => {
    expect(getUserDisplayName({ email: 'a@b.com', user_metadata: { full_name: '   ' } })).toBe('a')
  })
})

describe('getUserInitials', () => {
  it('builds initials from a two-word name', () => {
    expect(getUserInitials('Jordan Rivera')).toBe('JR')
  })

  it('falls back to email when no name is given', () => {
    expect(getUserInitials(null, 'jordan@example.com')).toBe('J')
  })

  it('falls back to the first letter of the generic "FB" source when nothing is available', () => {
    // getUserInitials has no space to split "FB" into two chunks, so this is
    // a pre-existing quirk of the current implementation, not a new bug —
    // documenting actual behavior rather than changing untouched logic.
    expect(getUserInitials(null, null)).toBe('F')
  })
})

describe('getUserCreatedDate', () => {
  it('formats a valid created_at date', () => {
    expect(getUserCreatedDate({ created_at: '2026-03-05T00:00:00.000Z' })).toBe('Mar 5, 2026')
  })

  it('returns null for a missing created_at', () => {
    expect(getUserCreatedDate({ created_at: undefined as unknown as string })).toBeNull()
  })

  it('returns null for an invalid created_at', () => {
    expect(getUserCreatedDate({ created_at: 'not-a-date' })).toBeNull()
  })
})

describe('getRoleLabel', () => {
  it('maps every UserRole to a distinct friendly label', () => {
    expect(getRoleLabel('donor')).toBe('Food donor')
    expect(getRoleLabel('ngo')).toBe('NGO / Organization')
    expect(getRoleLabel('volunteer')).toBe('Volunteer')
    expect(getRoleLabel('logistics')).toBe('Logistics partner')
    expect(getRoleLabel('admin')).toBe('Administrator')
  })
})

import { describe, expect, it } from 'vitest'

import type { UserRole } from '@/lib/db/types'
import { getDashboardNavViews, getWorkspaceLabel } from '@/lib/services/dashboard-navigation'

describe('getDashboardNavViews', () => {
  it('gives every role its own navigation', () => {
    expect(getDashboardNavViews('donor')).toEqual(['Overview', 'Donations', 'Matches', 'Pickups', 'Organizations'])
    expect(getDashboardNavViews('ngo')).toEqual(['Overview', 'Donations', 'Requirements', 'Matches', 'Pickups', 'Organizations'])
    expect(getDashboardNavViews('logistics')).toEqual(['Overview', 'Pickups'])
    expect(getDashboardNavViews('volunteer')).toEqual(['Overview', 'My Pickups'])
    expect(getDashboardNavViews('admin')).toEqual(['Overview', 'Donations', 'Pickups', 'Organizations'])
  })

  it('never gives a volunteer the donor navigation', () => {
    const volunteer = getDashboardNavViews('volunteer')
    expect(volunteer).not.toEqual(getDashboardNavViews('donor'))
    expect(volunteer).not.toContain('Donations')
    expect(volunteer).not.toContain('Matches')
    expect(volunteer).toContain('My Pickups')
  })

  it('falls back to Overview only — not donor — for an unknown role', () => {
    expect(getDashboardNavViews('hacker' as UserRole)).toEqual(['Overview'])
    expect(getDashboardNavViews('toString' as UserRole)).toEqual(['Overview'])
  })
})

describe('getWorkspaceLabel', () => {
  it('labels each role', () => {
    expect(getWorkspaceLabel('volunteer')).toBe('Volunteer workspace')
    expect(getWorkspaceLabel('logistics')).toBe('Logistics workspace')
    expect(getWorkspaceLabel('hacker' as UserRole)).toBe('Workspace')
  })
})

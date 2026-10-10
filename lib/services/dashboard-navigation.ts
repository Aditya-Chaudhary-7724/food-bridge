import type { UserRole } from '@/lib/db/types'

// Pure, per-role dashboard navigation. Every role is listed explicitly — there
// is no default branch, so a role can never silently fall through to another
// role's navigation (e.g. volunteer → donor). An unrecognized role value gets
// the minimal Overview-only nav rather than any real workspace.

export type DashboardView =
  | 'Overview'
  | 'Donations'
  | 'Requirements'
  | 'Matches'
  | 'Pickups'
  | 'My Pickups'
  | 'Organizations'
  | 'AI Assistant'
  | 'Analytics'
  | 'Knowledge Base'
  | 'Settings'

const NAV_VIEWS: Record<UserRole, readonly DashboardView[]> = {
  donor: ['Overview', 'Donations', 'Matches', 'Pickups', 'Organizations'],
  ngo: ['Overview', 'Donations', 'Requirements', 'Matches', 'Pickups', 'Organizations'],
  logistics: ['Overview', 'Pickups'],
  volunteer: ['Overview', 'My Pickups'],
  admin: ['Overview', 'Donations', 'Pickups', 'Organizations'],
}

const FALLBACK_VIEWS: readonly DashboardView[] = ['Overview']

export function getDashboardNavViews(role: UserRole): readonly DashboardView[] {
  return Object.hasOwn(NAV_VIEWS, role) ? NAV_VIEWS[role] : FALLBACK_VIEWS
}

export function getWorkspaceLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    donor: 'Donor workspace',
    ngo: 'NGO workspace',
    logistics: 'Logistics workspace',
    volunteer: 'Volunteer workspace',
    admin: 'Admin workspace',
  }
  return Object.hasOwn(labels, role) ? labels[role] : 'Workspace'
}

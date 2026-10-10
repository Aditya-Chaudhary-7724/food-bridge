import type { Database, UserRole } from '@/lib/db/types'

// Demo state reuses the real table Row types, so the demo exercises the same
// view models, stats and lifecycle rules as the real dashboard. It lives only
// in the visitor's browser — it is never sent to Supabase.

type Tables = Database['public']['Tables']

export type DemoProfile = Tables['profiles']['Row']
export type DemoOrganization = Tables['organizations']['Row']
export type DemoDonation = Tables['donations']['Row']
export type DemoRequirement = Tables['ngo_requirements']['Row']
export type DemoMatch = Tables['match_recommendations']['Row']
export type DemoPickup = Tables['pickups']['Row']
export type DemoNotification = Tables['notifications']['Row']

export const DEMO_STATE_VERSION = 1

export type DemoState = {
  version: typeof DEMO_STATE_VERSION
  profiles: DemoProfile[]
  organizations: DemoOrganization[]
  donations: DemoDonation[]
  requirements: DemoRequirement[]
  matches: DemoMatch[]
  pickups: DemoPickup[]
  notifications: DemoNotification[]
}

export const DEMO_ROLES: readonly UserRole[] = ['donor', 'ngo', 'logistics', 'volunteer', 'admin']

export const DEMO_ROLE_LABELS: Record<UserRole, string> = {
  donor: 'Donor',
  ngo: 'NGO / Organization',
  logistics: 'Logistics Partner',
  volunteer: 'Volunteer',
  admin: 'Admin',
}

export function isDemoRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (DEMO_ROLES as readonly string[]).includes(value)
}

// Directory data for the Organizations view. Only demo mode supplies it — the
// real dashboard has no organizations query yet and keeps its placeholder.
export type DirectoryOrganization = {
  id: string
  name: string
  type: DemoOrganization['type']
  address: string
  description: string | null
  contactEmail: string | null
  dailyCapacityKg: number
  isVerified: boolean
  activeRequirementCount: number
  isMine: boolean
}

export type DirectoryUser = {
  id: string
  fullName: string
  role: UserRole
  organizationName: string | null
}

export type OrganizationDirectory = {
  organizations: DirectoryOrganization[]
  users: DirectoryUser[] | null
}

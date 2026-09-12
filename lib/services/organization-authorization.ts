import type { Database } from '@/lib/db/types'

// Pure mirror of create_organization_and_link_profile()'s role +
// already-linked gate (see 20260907000001_ngo_organization_onboarding.sql)
// — the RPC remains the actual authorization and concurrency boundary.
// A single check covers both "only an NGO account may onboard" and "an
// already-linked NGO shouldn't be offered onboarding again."

type Profile = Database['public']['Tables']['profiles']['Row']

export function canOnboardOrganization(profile: Profile): boolean {
  return profile.role === 'ngo' && profile.organization_id === null
}

import type { Database } from '@/lib/db/types'

// Pure mirrors of the RLS predicates in
// supabase/migrations/20260825000003_rls_authorization.sql. RLS remains the
// actual enforcement boundary (these functions never replace it) — this
// module exists so Server Actions can fail fast with a clean, typed error
// before hitting the database, and so the UI can decide what to show without
// duplicating this logic inline. Keep these in sync with the donations RLS
// policies if those policies change.

type DonationRow = Database['public']['Tables']['donations']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

const EDITABLE_DONATION_STATUSES = new Set<DonationRow['status']>(['available', 'matched'])

export function canCreateDonation(profile: Profile): boolean {
  return profile.role === 'donor' || profile.role === 'admin'
}

export function canEditDonation(donation: DonationRow, profile: Profile): boolean {
  if (profile.role === 'admin') return true
  return donation.donor_id === profile.id && EDITABLE_DONATION_STATUSES.has(donation.status)
}

export function canDeleteDonation(donation: DonationRow, profile: Profile): boolean {
  if (profile.role === 'admin') return true
  return donation.donor_id === profile.id && donation.status === 'available'
}

export function canClaimDonation(profile: Profile): boolean {
  return profile.role === 'ngo' || profile.role === 'admin'
}

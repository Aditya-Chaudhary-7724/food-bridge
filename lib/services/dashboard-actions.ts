import type { createDonation, deleteDonation } from '@/lib/actions/donations'
import type { acceptPickup, assignVolunteerToPickup, listAvailableVolunteers, updatePickupStatus } from '@/lib/actions/pickups'
import type { createRequirement, deleteRequirement, updateRequirement } from '@/lib/actions/ngo-requirements'
import type { createOrganization } from '@/lib/actions/organizations'
import type { respondToMatch } from '@/lib/actions/matches'

// The set of operations FoodBridgeDashboard can invoke. Type-only imports:
// this module never pulls the real Server Actions into a bundle. The real
// dashboard supplies the Server Actions themselves; demo mode supplies an
// in-browser implementation (lib/demo/actions.ts) with identical signatures
// that never reaches Supabase.
export type DashboardActions = {
  createDonation: typeof createDonation
  deleteDonation: typeof deleteDonation
  createRequirement: typeof createRequirement
  updateRequirement: typeof updateRequirement
  deleteRequirement: typeof deleteRequirement
  createOrganization: typeof createOrganization
  respondToMatch: typeof respondToMatch
  acceptPickup: typeof acceptPickup
  assignVolunteerToPickup: typeof assignVolunteerToPickup
  updatePickupStatus: typeof updatePickupStatus
  listAvailableVolunteers: typeof listAvailableVolunteers
}

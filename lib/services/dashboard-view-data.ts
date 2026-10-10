import type { Database, UserRole } from '@/lib/db/types'
import { toDonationCardModel, type DonationCardModel } from '@/lib/services/donation-view-model'
import { toPickupCardModel, type PickupCardModel } from '@/lib/services/pickup-view-model'
import { toMatchCardModel, type MatchCardModel } from '@/lib/services/match-view-model'
import { computeDonorImpactStats, type DonorImpactStats } from '@/lib/services/donor-impact'
import { computeLogisticsStats, computeNgoStats, type LogisticsStats, type NgoStats } from '@/lib/services/role-dashboard-stats'

// Single mapping from role-scoped rows to the props FoodBridgeDashboard
// renders. Used by both the real /dashboard page (rows from RLS-scoped
// Server Actions) and the demo dashboard (rows from the in-browser demo
// store), so both modes derive cards and stats identically.

type Tables = Database['public']['Tables']

export type DashboardDonationSource = Tables['donations']['Row'] & { organizationName: string | null }
export type DashboardPickupSource = Tables['pickups']['Row'] & { donationTitle: string | null; organizationName: string | null }
export type DashboardMatchSource = Tables['match_recommendations']['Row'] & { donationTitle: string | null; organizationName: string | null }
export type DashboardRequirement = Tables['ngo_requirements']['Row']

export type DashboardViewData = {
  donations: DonationCardModel[]
  pickups: PickupCardModel[]
  matches: MatchCardModel[]
  requirements: DashboardRequirement[]
  donorStats: DonorImpactStats
  ngoStats: NgoStats
  logisticsStats: LogisticsStats
}

export function shouldLoadRequirements(role: UserRole): boolean {
  return role === 'ngo' || role === 'admin'
}

export function buildDashboardViewData(input: {
  userId: string
  donations: DashboardDonationSource[]
  pickups: DashboardPickupSource[]
  matches: DashboardMatchSource[]
  requirements: DashboardRequirement[]
}): DashboardViewData {
  const { userId, donations, pickups, matches, requirements } = input
  return {
    donations: donations.map((donation) =>
      toDonationCardModel({
        id: donation.id,
        title: donation.title,
        organizationName: donation.organizationName,
        quantity: donation.quantity,
        unit: donation.unit,
        status: donation.status,
        created_at: donation.created_at,
      }),
    ),
    pickups: pickups.map((pickup) => toPickupCardModel(pickup, userId)),
    matches: matches.map((match) => toMatchCardModel(match)),
    requirements,
    donorStats: computeDonorImpactStats(donations, pickups),
    ngoStats: computeNgoStats(donations, requirements, pickups),
    logisticsStats: computeLogisticsStats(pickups),
  }
}

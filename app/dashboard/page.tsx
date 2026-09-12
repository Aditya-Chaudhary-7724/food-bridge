import { redirect } from 'next/navigation'

import FoodBridgeDashboard from '@/components/foodbridge-dashboard'
import { getAuthContext } from '@/lib/auth/session'
import { listMyDonations } from '@/lib/actions/donations'
import { listMyPickups } from '@/lib/actions/pickups'
import { listMyRequirements } from '@/lib/actions/ngo-requirements'
import { listMyMatches } from '@/lib/actions/matches'
import { toDonationCardModel } from '@/lib/services/donation-view-model'
import { toPickupCardModel } from '@/lib/services/pickup-view-model'
import { toMatchCardModel } from '@/lib/services/match-view-model'
import { computeDonorImpactStats } from '@/lib/services/donor-impact'
import { computeLogisticsStats, computeNgoStats } from '@/lib/services/role-dashboard-stats'
import { canOnboardOrganization } from '@/lib/services/organization-authorization'

export default async function DashboardPage() {
  const context = await getAuthContext()

  if (!context) {
    redirect('/login')
  }

  const [donationsResult, pickupsResult, matchesResult] = await Promise.all([listMyDonations(), listMyPickups(), listMyMatches()])

  const donations = donationsResult.success ? donationsResult.data : []
  const donationsError = donationsResult.success ? null : donationsResult.error
  const pickups = pickupsResult.success ? pickupsResult.data : []
  const pickupsError = pickupsResult.success ? null : pickupsResult.error
  const matches = matchesResult.success ? matchesResult.data : []
  const matchesError = matchesResult.success ? null : matchesResult.error

  const requirementsResult = context.profile.role === 'ngo' || context.profile.role === 'admin' ? await listMyRequirements() : null
  const requirements = requirementsResult?.success ? requirementsResult.data : []
  const requirementsError = requirementsResult && !requirementsResult.success ? requirementsResult.error : null

  const donationCards = donations.map((donation) =>
    toDonationCardModel({
      id: donation.id,
      title: donation.title,
      organizationName: donation.organizationName,
      quantity: donation.quantity,
      unit: donation.unit,
      status: donation.status,
      created_at: donation.created_at,
    }),
  )

  const pickupCards = pickups.map((pickup) => toPickupCardModel(pickup, context.user.id))
  const matchCards = matches.map((match) => toMatchCardModel(match))

  return (
    <FoodBridgeDashboard
      role={context.profile.role}
      displayName={context.profile.full_name}
      hasOrganization={Boolean(context.profile.organization_id)}
      showOrganizationOnboarding={canOnboardOrganization(context.profile)}
      donations={donationCards}
      donationsError={donationsError}
      pickups={pickupCards}
      pickupsError={pickupsError}
      requirements={requirements}
      requirementsError={requirementsError}
      matches={matchCards}
      matchesError={matchesError}
      donorStats={computeDonorImpactStats(donations, pickups)}
      ngoStats={computeNgoStats(donations, requirements, pickups)}
      logisticsStats={computeLogisticsStats(pickups)}
    />
  )
}

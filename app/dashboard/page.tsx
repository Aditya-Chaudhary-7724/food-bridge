import { redirect } from 'next/navigation'

import FoodBridgeDashboard from '@/components/foodbridge-dashboard'
import { getAuthContext } from '@/lib/auth/session'
import { listMyDonations } from '@/lib/actions/donations'
import { listMyPickups } from '@/lib/actions/pickups'
import { listMyRequirements } from '@/lib/actions/ngo-requirements'
import { listMyMatches } from '@/lib/actions/matches'
import { buildDashboardViewData, shouldLoadRequirements } from '@/lib/services/dashboard-view-data'
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

  const requirementsResult = shouldLoadRequirements(context.profile.role) ? await listMyRequirements() : null
  const requirements = requirementsResult?.success ? requirementsResult.data : []
  const requirementsError = requirementsResult && !requirementsResult.success ? requirementsResult.error : null

  const viewData = buildDashboardViewData({ userId: context.user.id, donations, pickups, matches, requirements })

  return (
    <FoodBridgeDashboard
      role={context.profile.role}
      displayName={context.profile.full_name}
      hasOrganization={Boolean(context.profile.organization_id)}
      showOrganizationOnboarding={canOnboardOrganization(context.profile)}
      donations={viewData.donations}
      donationsError={donationsError}
      pickups={viewData.pickups}
      pickupsError={pickupsError}
      requirements={viewData.requirements}
      requirementsError={requirementsError}
      matches={viewData.matches}
      matchesError={matchesError}
      donorStats={viewData.donorStats}
      ngoStats={viewData.ngoStats}
      logisticsStats={viewData.logisticsStats}
    />
  )
}

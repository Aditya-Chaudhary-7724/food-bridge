import type { UserRole } from '@/lib/db/types'
import { buildDashboardViewData, shouldLoadRequirements, type DashboardViewData } from '@/lib/services/dashboard-view-data'
import { DEMO_PERSONA_IDS } from '@/lib/demo/seed'
import type { DemoNotification, DemoProfile, DemoState, OrganizationDirectory } from '@/lib/demo/types'

// Projects the shared demo state onto one persona's dashboard. The row
// filters mirror the real RLS SELECT policies (donations_select,
// pickups_select, match_recommendations_select, ngo_requirements) so each
// role sees in demo what it would see for real — then the same
// buildDashboardViewData() the real /dashboard page uses derives the cards
// and stats.

export type DemoDashboardView = DashboardViewData & {
  role: UserRole
  persona: DemoProfile
  hasOrganization: boolean
  notifications: DemoNotification[]
  directory: OrganizationDirectory
}

export function getDemoPersona(state: DemoState, role: UserRole): DemoProfile | null {
  return state.profiles.find((p) => p.id === DEMO_PERSONA_IDS[role] && p.role === role) ?? null
}

export function selectDemoDashboard(state: DemoState, role: UserRole): DemoDashboardView | null {
  const persona = getDemoPersona(state, role)
  if (!persona) return null
  const me = persona.id
  const orgId = persona.organization_id

  const orgName = (id: string | null) => (id ? state.organizations.find((o) => o.id === id)?.name ?? null : null)
  const donationTitle = (id: string) => state.donations.find((d) => d.id === id)?.title ?? null
  const donorOwns = (donationId: string) => state.donations.some((d) => d.id === donationId && d.donor_id === me)

  const pickups = state.pickups.filter((p) => {
    if (role === 'admin') return true
    if (role === 'logistics') return p.logistics_user_id === me || (p.status === 'scheduled' && p.logistics_user_id === null)
    if (role === 'ngo') return p.organization_id === orgId
    if (role === 'volunteer') return p.volunteer_id === me
    return donorOwns(p.donation_id)
  })

  const donations = state.donations.filter((d) => {
    if (role === 'admin' || d.donor_id === me) return true
    if (role === 'ngo') return d.status === 'available' || (orgId !== null && d.organization_id === orgId)
    if (role === 'logistics') return state.pickups.some((p) => p.donation_id === d.id && p.logistics_user_id === me)
    if (role === 'volunteer') return state.pickups.some((p) => p.donation_id === d.id && p.volunteer_id === me)
    return false
  })

  const matches = state.matches.filter((m) => {
    if (role === 'admin') return true
    if (role === 'ngo') return m.organization_id === orgId
    if (role === 'donor') return donorOwns(m.donation_id)
    return false
  })

  const requirements = shouldLoadRequirements(role) ? state.requirements.filter((r) => role === 'admin' || r.organization_id === orgId) : []

  const viewData = buildDashboardViewData({
    userId: me,
    donations: donations
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((d) => ({ ...d, organizationName: orgName(d.organization_id) })),
    pickups: pickups
      .slice()
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
      .map((p) => ({ ...p, donationTitle: donationTitle(p.donation_id), organizationName: orgName(p.organization_id) })),
    matches: matches
      .slice()
      .sort((a, b) => b.final_score - a.final_score)
      .map((m) => ({ ...m, donationTitle: donationTitle(m.donation_id), organizationName: orgName(m.organization_id) })),
    requirements,
  })

  const directory: OrganizationDirectory = {
    organizations: state.organizations
      .filter((o) => role === 'admin' || o.type === 'ngo')
      .map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        address: o.address,
        description: o.description,
        contactEmail: o.contact_email,
        dailyCapacityKg: o.daily_capacity_kg,
        isVerified: o.is_verified,
        activeRequirementCount: state.requirements.filter((r) => r.organization_id === o.id && r.is_active).length,
        isMine: o.id === orgId,
      }))
      .sort((a, b) => Number(b.isMine) - Number(a.isMine)),
    users: role === 'admin' ? state.profiles.map((p) => ({ id: p.id, fullName: p.full_name, role: p.role, organizationName: orgName(p.organization_id) })) : null,
  }

  return {
    ...viewData,
    role,
    persona,
    hasOrganization: orgId !== null,
    notifications: state.notifications.filter((n) => n.user_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    directory,
  }
}

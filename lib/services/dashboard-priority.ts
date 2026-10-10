import type { UserRole } from '@/lib/db/types'
import type { DashboardView } from '@/lib/services/dashboard-navigation'
import type { DonationCardModel } from '@/lib/services/donation-view-model'
import type { MatchCardModel } from '@/lib/services/match-view-model'
import type { PickupCardModel } from '@/lib/services/pickup-view-model'

// The one operational task an overview should put first for a role, derived
// only from the data that role can already see. Pure — no I/O.

export type PriorityTask = {
  title: string
  detail: string
  actionLabel: string
  view: DashboardView
  /** 'action' when something is waiting on this user; 'calm' when nothing is. */
  urgency: 'action' | 'calm'
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function getPriorityTask(
  role: UserRole,
  data: { donations: DonationCardModel[]; pickups: PickupCardModel[]; matches: MatchCardModel[] },
): PriorityTask {
  const { donations, pickups, matches } = data

  if (role === 'donor') {
    const waiting = donations.filter((d) => d.statusValue === 'available')
    if (waiting.length) {
      return { title: `${plural(waiting.length, 'donation')} waiting for a partner`, detail: 'Recommended organizations have been scored for each one. Review who they were matched with.', actionLabel: 'View matches', view: 'Matches', urgency: 'action' }
    }
    return { title: 'Have surplus food today?', detail: 'List it with an accurate expiry time so nearby organizations can plan a pickup.', actionLabel: 'New donation', view: 'Donations', urgency: 'calm' }
  }

  if (role === 'ngo') {
    const pending = matches.filter((m) => m.status === 'pending')
    if (pending.length) {
      return { title: `${plural(pending.length, 'match', 'matches')} to review`, detail: 'Accepting a match claims the donation and schedules a pickup for your organization.', actionLabel: 'Review matches', view: 'Matches', urgency: 'action' }
    }
    const incoming = pickups.filter((p) => p.statusValue === 'driver_assigned' || p.statusValue === 'in_transit')
    if (incoming.length) {
      return { title: `${plural(incoming.length, 'delivery', 'deliveries')} on the way`, detail: 'Make sure someone is ready to receive the food when it arrives.', actionLabel: 'Track pickups', view: 'Pickups', urgency: 'calm' }
    }
    return { title: 'No matches waiting', detail: 'Keep your requirements current so new donations are scored against what you actually need.', actionLabel: 'Review requirements', view: 'Requirements', urgency: 'calm' }
  }

  if (role === 'logistics') {
    const open = pickups.filter((p) => p.statusValue === 'scheduled' && !p.isAssignedToMe)
    if (open.length) {
      return { title: `${plural(open.length, 'pickup')} ${open.length === 1 ? 'needs' : 'need'} a logistics partner`, detail: 'Accept one to take responsibility for getting it collected.', actionLabel: 'Open pickups', view: 'Pickups', urgency: 'action' }
    }
    const unstaffed = pickups.filter((p) => p.isAssignedToMe && !p.hasVolunteerAssigned && (p.statusValue === 'driver_assigned' || p.statusValue === 'in_transit'))
    if (unstaffed.length) {
      return { title: `${plural(unstaffed.length, 'pickup')} without a volunteer`, detail: 'Assign a volunteer so the collection can go ahead.', actionLabel: 'Assign volunteers', view: 'Pickups', urgency: 'action' }
    }
    return { title: 'All pickups are covered', detail: 'New pickups appear here as soon as an organization claims a donation.', actionLabel: 'View pickups', view: 'Pickups', urgency: 'calm' }
  }

  if (role === 'volunteer') {
    const inTransit = pickups.find((p) => p.statusValue === 'in_transit')
    if (inTransit) {
      return { title: `Deliver ${inTransit.title}`, detail: `On the way to ${inTransit.organizationName}. Mark it delivered once it has been handed over.`, actionLabel: 'Open my pickups', view: 'My Pickups', urgency: 'action' }
    }
    const ready = pickups.find((p) => p.statusValue === 'driver_assigned')
    if (ready) {
      return { title: `Collect ${ready.title}`, detail: `For ${ready.organizationName}, scheduled ${ready.scheduledAt}. Mark it in transit once collected.`, actionLabel: 'Open my pickups', view: 'My Pickups', urgency: 'action' }
    }
    return { title: 'Nothing assigned right now', detail: 'A logistics partner will assign pickups to you — they will appear in My Pickups.', actionLabel: 'View my pickups', view: 'My Pickups', urgency: 'calm' }
  }

  const active = pickups.filter((p) => p.statusValue === 'scheduled' || p.statusValue === 'driver_assigned' || p.statusValue === 'in_transit')
  return { title: `${plural(active.length, 'active pickup')} across the platform`, detail: `${plural(donations.length, 'donation')} recorded in total.`, actionLabel: 'View pickups', view: 'Pickups', urgency: 'calm' }
}

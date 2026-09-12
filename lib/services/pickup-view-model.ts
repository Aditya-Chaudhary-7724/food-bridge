import type { Database } from '@/lib/db/types'
import type { DonationTone } from '@/lib/services/donation-view-model'

type PickupStatus = Database['public']['Tables']['pickups']['Row']['status']

const STATUS_LABEL: Record<PickupStatus, string> = {
  scheduled: 'Scheduled',
  driver_assigned: 'Driver assigned',
  in_transit: 'In transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

const STATUS_TONE: Record<PickupStatus, DonationTone> = {
  scheduled: 'amber',
  driver_assigned: 'blue',
  in_transit: 'blue',
  completed: 'green',
  cancelled: 'rose',
  failed: 'rose',
}

export function getPickupStatusLabel(status: PickupStatus): string {
  return STATUS_LABEL[status]
}

export function getPickupStatusTone(status: PickupStatus): DonationTone {
  return STATUS_TONE[status]
}

export function formatPickupDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

export type PickupCardModel = {
  id: string
  title: string
  organizationName: string
  status: string
  statusValue: PickupStatus
  tone: DonationTone
  scheduledAt: string
  isAssignedToMe: boolean
  hasVolunteerAssigned: boolean
}

export function toPickupCardModel(
  pickup: {
    id: string
    donationTitle: string | null
    organizationName: string | null
    status: PickupStatus
    scheduled_at: string
    logistics_user_id: string | null
    volunteer_id: string | null
  },
  currentUserId: string,
): PickupCardModel {
  return {
    id: pickup.id,
    title: pickup.donationTitle ?? 'Donation',
    organizationName: pickup.organizationName ?? 'Unassigned organization',
    status: getPickupStatusLabel(pickup.status),
    statusValue: pickup.status,
    tone: getPickupStatusTone(pickup.status),
    scheduledAt: formatPickupDate(pickup.scheduled_at),
    // True for either the logistics coordinator or the volunteer executing
    // the pickup — a given user only ever occupies one of those two roles,
    // so this can never conflate two different people's assignments.
    isAssignedToMe: pickup.logistics_user_id === currentUserId || pickup.volunteer_id === currentUserId,
    hasVolunteerAssigned: pickup.volunteer_id !== null,
  }
}

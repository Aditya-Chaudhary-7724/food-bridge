import type { Database } from '@/lib/db/types'

// Pure, framework-free mapping from a donation DB row to the shape the
// dashboard UI renders. Kept separate from the Server Actions so it can be
// unit-tested without a database connection.

type DonationStatus = Database['public']['Tables']['donations']['Row']['status']

export type DonationTone = 'green' | 'blue' | 'amber' | 'slate' | 'rose'

const STATUS_LABEL: Record<DonationStatus, string> = {
  available: 'Awaiting match',
  matched: 'Matched',
  claimed: 'Claimed',
  pickup_scheduled: 'Pickup scheduled',
  picked_up: 'Picked up',
  delivered: 'Completed',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const STATUS_TONE: Record<DonationStatus, DonationTone> = {
  available: 'amber',
  matched: 'green',
  claimed: 'green',
  pickup_scheduled: 'blue',
  picked_up: 'blue',
  delivered: 'slate',
  expired: 'rose',
  cancelled: 'rose',
}

export function getDonationStatusLabel(status: DonationStatus): string {
  return STATUS_LABEL[status]
}

export function getDonationStatusTone(status: DonationStatus): DonationTone {
  return STATUS_TONE[status]
}

export function formatDonationDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export type DonationCardModel = {
  id: string
  name: string
  org: string
  amount: string
  status: string
  statusValue: DonationStatus
  date: string
  tone: DonationTone
}

export type DonationCardSource = {
  id: string
  title: string
  organizationName: string | null
  quantity: number
  unit: string
  status: DonationStatus
  created_at: string
}

export function toDonationCardModel(donation: DonationCardSource): DonationCardModel {
  return {
    id: donation.id,
    name: donation.title,
    org: donation.organizationName ?? 'Awaiting match',
    amount: `${donation.quantity} ${donation.unit}`,
    status: getDonationStatusLabel(donation.status),
    statusValue: donation.status,
    date: formatDonationDate(donation.created_at),
    tone: getDonationStatusTone(donation.status),
  }
}

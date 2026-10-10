import type { DonationCardModel } from '@/lib/services/donation-view-model'
import type { PickupCardModel } from '@/lib/services/pickup-view-model'

// Pure mapping from real donation / pickup state onto the five-stage "food
// journey" shown in the dashboard. It only ever reflects the status values
// it's given — it never infers progress that the data doesn't record, and
// it has no notion of location or live tracking.

export const JOURNEY_STAGES = [
  { key: 'created', label: 'Donation created' },
  { key: 'matched', label: 'NGO match' },
  { key: 'coordinated', label: 'Pickup coordinated' },
  { key: 'delivery', label: 'Volunteer delivery' },
  { key: 'completed', label: 'Completed' },
] as const

export type JourneyStageKey = (typeof JOURNEY_STAGES)[number]['key']
export type JourneyStageState = 'done' | 'current' | 'upcoming' | 'halted'

export type FoodJourney = {
  stages: { key: JourneyStageKey; label: string; state: JourneyStageState }[]
  /** Index of the stage currently in progress (or the last one, when complete). */
  currentIndex: number
  /** 0–1 position of the progress indicator along the journey. */
  progress: number
  isComplete: boolean
  isHalted: boolean
  /** One plain-language sentence describing what happens next. */
  summary: string
}

const LAST = JOURNEY_STAGES.length - 1

function buildJourney(currentIndex: number, summary: string, options: { complete?: boolean; halted?: boolean; partial?: number } = {}): FoodJourney {
  const { complete = false, halted = false, partial = 0 } = options
  const stages = JOURNEY_STAGES.map((stage, index) => ({
    key: stage.key,
    label: stage.label,
    state: (complete || index < currentIndex ? 'done' : index === currentIndex ? (halted ? 'halted' : 'current') : 'upcoming') as JourneyStageState,
  }))
  const progress = complete ? 1 : Math.min((currentIndex + partial) / LAST, 1)
  return { stages, currentIndex: complete ? LAST : currentIndex, progress, isComplete: complete, isHalted: halted, summary }
}

export function getDonationJourney(status: DonationCardModel['statusValue']): FoodJourney {
  switch (status) {
    case 'available':
    case 'matched':
      return buildJourney(1, 'Waiting for a partner organization to accept this donation.')
    case 'claimed':
    case 'pickup_scheduled':
      return buildJourney(2, 'Claimed — waiting for a logistics partner to accept the pickup.')
    case 'picked_up':
      return buildJourney(3, 'Collected and on its way to the organization.')
    case 'delivered':
      return buildJourney(LAST, 'Delivered to the partner organization.', { complete: true })
    case 'expired':
      return buildJourney(1, 'This donation expired before it was matched.', { halted: true })
    case 'cancelled':
      return buildJourney(1, 'This donation was cancelled.', { halted: true })
  }
}

export function getPickupJourney(pickup: Pick<PickupCardModel, 'statusValue' | 'hasVolunteerAssigned'>): FoodJourney {
  switch (pickup.statusValue) {
    case 'scheduled':
      return buildJourney(2, 'Waiting for a logistics partner to accept the pickup.')
    case 'driver_assigned':
      return pickup.hasVolunteerAssigned
        ? buildJourney(3, 'A volunteer is assigned and ready to collect the food.')
        : buildJourney(3, 'Logistics partner confirmed — a volunteer still needs to be assigned.')
    case 'in_transit':
      return buildJourney(3, 'Food collected and on its way to the organization.', { partial: 0.5 })
    case 'completed':
      return buildJourney(LAST, 'Delivered to the partner organization.', { complete: true })
    case 'cancelled':
      return buildJourney(pickup.hasVolunteerAssigned ? 3 : 2, 'This pickup was cancelled.', { halted: true })
    case 'failed':
      return buildJourney(pickup.hasVolunteerAssigned ? 3 : 2, 'This pickup could not be completed.', { halted: true })
  }
}

export type FeaturedJourney = { id: string; kind: 'pickup' | 'donation'; title: string; subtitle: string; journey: FoodJourney }

const ACTIVE_PICKUP_PRIORITY: PickupCardModel['statusValue'][] = ['in_transit', 'driver_assigned', 'scheduled']

/**
 * The single journey most worth showing on an overview: the most advanced
 * active pickup, else the newest donation still waiting for a match, else
 * the latest completed pickup. Returns null when there's nothing to show.
 */
export function pickFeaturedJourney(pickups: PickupCardModel[], donations: DonationCardModel[]): FeaturedJourney | null {
  for (const status of ACTIVE_PICKUP_PRIORITY) {
    const pickup = pickups.find((p) => p.statusValue === status)
    if (pickup) return { id: pickup.id, kind: 'pickup', title: pickup.title, subtitle: pickup.organizationName, journey: getPickupJourney(pickup) }
  }
  const waiting = donations.find((d) => d.statusValue === 'available' || d.statusValue === 'matched')
  if (waiting) return { id: waiting.id, kind: 'donation', title: waiting.name, subtitle: waiting.amount, journey: getDonationJourney(waiting.statusValue) }
  const completed = pickups.find((p) => p.statusValue === 'completed')
  if (completed) return { id: completed.id, kind: 'pickup', title: completed.title, subtitle: completed.organizationName, journey: getPickupJourney(completed) }
  return null
}

// Pure aggregation helpers for the NGO/logistics dashboard summaries.
// donations/pickups/requirements passed in are already RLS-scoped to the
// caller by the actions that fetch them — these functions just count.

export type NgoDonationLike = { status: string }
export type NgoRequirementLike = { is_active: boolean }
export type PickupStatusLike = { status: string }

export type NgoStats = {
  availableDonationCount: number
  claimedDonationCount: number
  activeRequirementCount: number
  incomingPickupCount: number
}

export function computeNgoStats(donations: NgoDonationLike[], requirements: NgoRequirementLike[], pickups: PickupStatusLike[]): NgoStats {
  return {
    availableDonationCount: donations.filter((d) => d.status === 'available').length,
    claimedDonationCount: donations.filter((d) => d.status === 'claimed' || d.status === 'pickup_scheduled' || d.status === 'picked_up' || d.status === 'delivered')
      .length,
    activeRequirementCount: requirements.filter((r) => r.is_active).length,
    incomingPickupCount: pickups.filter((p) => p.status !== 'completed' && p.status !== 'cancelled' && p.status !== 'failed').length,
  }
}

export type LogisticsStats = {
  assignedPickupCount: number
  activeDeliveryCount: number
  completedDeliveryCount: number
}

export function computeLogisticsStats(pickups: PickupStatusLike[]): LogisticsStats {
  return {
    assignedPickupCount: pickups.length,
    activeDeliveryCount: pickups.filter((p) => p.status === 'driver_assigned' || p.status === 'in_transit').length,
    completedDeliveryCount: pickups.filter((p) => p.status === 'completed').length,
  }
}

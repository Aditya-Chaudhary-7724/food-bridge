// Pure aggregation over a donor's own donations/pickups. "Estimated meals"
// and "estimated CO2 avoided" are explicitly labeled estimates in the UI —
// derived from real summed quantities via commonly-cited food-recovery
// conversion factors (not fabricated constants), so they are zero when a
// donor has no donations and scale with real activity.

const MEALS_PER_KG = 2.5
const CO2_KG_AVOIDED_PER_KG_DIVERTED = 2.5

export type DonorDonationLike = { quantity: number; unit: string; status: string }
export type DonorPickupLike = { status: string }

export type DonorImpactStats = {
  totalKgDiverted: number
  estimatedMeals: number
  estimatedCo2AvoidedKg: number
  activeDonationCount: number
  completedPickupCount: number
}

export function computeDonorImpactStats(donations: DonorDonationLike[], pickups: DonorPickupLike[]): DonorImpactStats {
  const totalKgDiverted = donations
    .filter((d) => d.unit === 'kg' && d.status !== 'cancelled' && d.status !== 'expired')
    .reduce((sum, d) => sum + d.quantity, 0)

  const activeDonationCount = donations.filter((d) => d.status === 'available' || d.status === 'matched').length
  const completedPickupCount = pickups.filter((p) => p.status === 'completed').length

  return {
    totalKgDiverted,
    estimatedMeals: Math.round(totalKgDiverted * MEALS_PER_KG),
    estimatedCo2AvoidedKg: Math.round(totalKgDiverted * CO2_KG_AVOIDED_PER_KG_DIVERTED * 10) / 10,
    activeDonationCount,
    completedPickupCount,
  }
}

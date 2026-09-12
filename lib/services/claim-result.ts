import type { Json } from '@/lib/db/types'

// public.claim_donation() returns jsonb. Rather than asserting its shape with
// `as`, narrow it defensively at runtime — a stored procedure's return
// payload is an external boundary just like an HTTP response.

export type ClaimDonationResult =
  | { success: true; pickupId: string; donationId: string }
  | { success: false; error: string; message: string }

export function parseClaimDonationResult(value: Json): ClaimDonationResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, Json | undefined>

  if (typeof record.success !== 'boolean') return null

  if (record.success) {
    if (typeof record.pickup_id !== 'string' || typeof record.donation_id !== 'string') return null
    return { success: true, pickupId: record.pickup_id, donationId: record.donation_id }
  }

  return {
    success: false,
    error: typeof record.error === 'string' ? record.error : 'unknown_error',
    message: typeof record.message === 'string' ? record.message : 'Unable to claim this donation.',
  }
}

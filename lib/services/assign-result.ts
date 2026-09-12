import type { Json } from '@/lib/db/types'

// public.assign_pickup_to_logistics() returns jsonb — narrow it defensively
// at runtime rather than asserting its shape, same rationale as
// lib/services/claim-result.ts.

export type AssignPickupResult = { success: true; pickupId: string } | { success: false; error: string; message: string }

export function parseAssignPickupResult(value: Json): AssignPickupResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, Json | undefined>

  if (typeof record.success !== 'boolean') return null

  if (record.success) {
    if (typeof record.pickup_id !== 'string') return null
    return { success: true, pickupId: record.pickup_id }
  }

  return {
    success: false,
    error: typeof record.error === 'string' ? record.error : 'unknown_error',
    message: typeof record.message === 'string' ? record.message : 'Unable to accept this pickup.',
  }
}

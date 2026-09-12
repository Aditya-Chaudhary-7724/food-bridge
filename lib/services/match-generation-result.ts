import type { Json } from '@/lib/db/types'

// public.generate_match_recommendations() returns jsonb — narrow it
// defensively at runtime, same rationale as claim-result.ts / assign-result.ts.

export type MatchGenerationResult = { success: true; matchesGenerated: number } | { success: false; error: string; message: string }

export function parseMatchGenerationResult(value: Json): MatchGenerationResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, Json | undefined>

  if (typeof record.success !== 'boolean') return null

  if (record.success) {
    if (typeof record.matches_generated !== 'number') return null
    return { success: true, matchesGenerated: record.matches_generated }
  }

  return {
    success: false,
    error: typeof record.error === 'string' ? record.error : 'unknown_error',
    message: typeof record.message === 'string' ? record.message : 'Unable to generate matches for this donation.',
  }
}

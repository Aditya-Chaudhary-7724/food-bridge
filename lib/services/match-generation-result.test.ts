import { describe, expect, it } from 'vitest'

import { parseMatchGenerationResult } from '@/lib/services/match-generation-result'

describe('parseMatchGenerationResult', () => {
  it('parses a successful generation response', () => {
    expect(parseMatchGenerationResult({ success: true, matches_generated: 3 })).toEqual({ success: true, matchesGenerated: 3 })
  })

  it('parses a rejected response', () => {
    expect(parseMatchGenerationResult({ success: false, error: 'invalid_status', message: 'Only available donations can be matched' })).toEqual({
      success: false,
      error: 'invalid_status',
      message: 'Only available donations can be matched',
    })
  })

  it('returns null for a malformed success payload', () => {
    expect(parseMatchGenerationResult({ success: true })).toBeNull()
  })

  it('returns null for null/non-object input', () => {
    expect(parseMatchGenerationResult(null)).toBeNull()
    expect(parseMatchGenerationResult('nope')).toBeNull()
  })
})

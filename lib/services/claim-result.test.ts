import { describe, expect, it } from 'vitest'

import { parseClaimDonationResult } from '@/lib/services/claim-result'

describe('parseClaimDonationResult', () => {
  it('parses a successful claim response', () => {
    const result = parseClaimDonationResult({
      success: true,
      pickup_id: 'pickup-1',
      donation_id: 'donation-1',
    })
    expect(result).toEqual({ success: true, pickupId: 'pickup-1', donationId: 'donation-1' })
  })

  it('parses a rejected claim response (already_claimed)', () => {
    const result = parseClaimDonationResult({
      success: false,
      error: 'already_claimed',
      message: 'This donation has already been claimed by another organization',
    })
    expect(result).toEqual({
      success: false,
      error: 'already_claimed',
      message: 'This donation has already been claimed by another organization',
    })
  })

  it('returns null for a malformed success payload missing pickup_id', () => {
    expect(parseClaimDonationResult({ success: true })).toBeNull()
  })

  it('returns null for null input', () => {
    expect(parseClaimDonationResult(null)).toBeNull()
  })

  it('returns null for a non-object payload', () => {
    expect(parseClaimDonationResult('unexpected string')).toBeNull()
  })

  it('returns null when success is missing entirely', () => {
    expect(parseClaimDonationResult({ foo: 'bar' })).toBeNull()
  })

  it('falls back to safe defaults for a failure payload missing error/message', () => {
    const result = parseClaimDonationResult({ success: false })
    expect(result).toEqual({
      success: false,
      error: 'unknown_error',
      message: 'Unable to claim this donation.',
    })
  })
})

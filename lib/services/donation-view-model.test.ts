import { describe, expect, it } from 'vitest'

import { formatDonationDate, getDonationStatusLabel, getDonationStatusTone, toDonationCardModel } from '@/lib/services/donation-view-model'

describe('getDonationStatusLabel', () => {
  it('maps every donation_status to a distinct human label', () => {
    expect(getDonationStatusLabel('available')).toBe('Awaiting match')
    expect(getDonationStatusLabel('claimed')).toBe('Claimed')
    expect(getDonationStatusLabel('delivered')).toBe('Completed')
    expect(getDonationStatusLabel('expired')).toBe('Expired')
  })
})

describe('getDonationStatusTone', () => {
  it('assigns a warning tone to available donations', () => {
    expect(getDonationStatusTone('available')).toBe('amber')
  })

  it('assigns a positive tone to claimed/matched donations', () => {
    expect(getDonationStatusTone('matched')).toBe('green')
    expect(getDonationStatusTone('claimed')).toBe('green')
  })

  it('assigns a negative tone to expired/cancelled donations', () => {
    expect(getDonationStatusTone('expired')).toBe('rose')
    expect(getDonationStatusTone('cancelled')).toBe('rose')
  })
})

describe('formatDonationDate', () => {
  it('formats a valid ISO date', () => {
    const formatted = formatDonationDate('2026-03-05T14:30:00.000Z')
    expect(formatted).not.toBe('Unknown date')
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('falls back safely for an invalid date string', () => {
    expect(formatDonationDate('not-a-date')).toBe('Unknown date')
  })
})

describe('toDonationCardModel', () => {
  it('falls back to "Awaiting match" when there is no organization yet', () => {
    const card = toDonationCardModel({
      id: 'donation-1',
      title: 'Bakery surplus',
      organizationName: null,
      quantity: 84,
      unit: 'kg',
      status: 'available',
      created_at: '2026-01-01T00:00:00.000Z',
    })
    expect(card.org).toBe('Awaiting match')
    expect(card.amount).toBe('84 kg')
    expect(card.status).toBe('Awaiting match')
    expect(card.statusValue).toBe('available')
    expect(card.tone).toBe('amber')
  })

  it('uses the organization name once matched', () => {
    const card = toDonationCardModel({
      id: 'donation-2',
      title: 'Canned goods',
      organizationName: 'Hope Foundation',
      quantity: 192,
      unit: 'kg',
      status: 'matched',
      created_at: '2026-01-01T00:00:00.000Z',
    })
    expect(card.org).toBe('Hope Foundation')
    expect(card.tone).toBe('green')
  })
})

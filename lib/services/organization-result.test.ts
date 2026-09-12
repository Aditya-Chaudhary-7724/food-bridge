import { describe, expect, it } from 'vitest'

import { parseCreateOrganizationResult } from '@/lib/services/organization-result'

describe('parseCreateOrganizationResult', () => {
  it('parses a successful creation response', () => {
    const result = parseCreateOrganizationResult({
      success: true,
      organization_id: 'org-1',
    })
    expect(result).toEqual({ success: true, organizationId: 'org-1' })
  })

  it('parses a rejected response (already_linked)', () => {
    const result = parseCreateOrganizationResult({
      success: false,
      error: 'already_linked',
      message: 'Your account is already linked to an organization',
    })
    expect(result).toEqual({
      success: false,
      error: 'already_linked',
      message: 'Your account is already linked to an organization',
    })
  })

  it('returns null for a malformed success payload missing organization_id', () => {
    expect(parseCreateOrganizationResult({ success: true })).toBeNull()
  })

  it('returns null for null input', () => {
    expect(parseCreateOrganizationResult(null)).toBeNull()
  })

  it('returns null for a non-object payload', () => {
    expect(parseCreateOrganizationResult('unexpected string')).toBeNull()
  })

  it('returns null when success is missing entirely', () => {
    expect(parseCreateOrganizationResult({ foo: 'bar' })).toBeNull()
  })

  it('falls back to safe defaults for a failure payload missing error/message', () => {
    const result = parseCreateOrganizationResult({ success: false })
    expect(result).toEqual({
      success: false,
      error: 'unknown_error',
      message: 'Unable to set up your organization.',
    })
  })
})

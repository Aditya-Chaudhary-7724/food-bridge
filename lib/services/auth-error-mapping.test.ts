import { describe, expect, it } from 'vitest'
import type { AuthError } from '@supabase/supabase-js'

import { getFriendlyAuthError, getLoginAuthError } from '@/lib/services/auth-error-mapping'

function makeAuthError(overrides: Partial<AuthError>): AuthError {
  return {
    name: 'AuthApiError',
    message: 'Something went wrong',
    status: 400,
    code: undefined,
    ...overrides,
  } as AuthError
}

describe('getFriendlyAuthError', () => {
  it('falls back safely when there is no error', () => {
    expect(getFriendlyAuthError(null)).toBe('We could not create your account right now. Please try again.')
  })

  it('distinguishes the email-send rate limit from the general request rate limit', () => {
    const emailRateLimit = makeAuthError({ code: 'over_email_send_rate_limit', status: 429, message: 'Email rate limit exceeded' })
    expect(getFriendlyAuthError(emailRateLimit)).toBe(
      'Too many signup emails have been requested. Please wait before trying again.',
    )

    const requestRateLimit = makeAuthError({ code: 'over_request_rate_limit', status: 429, message: 'Request rate limit reached' })
    expect(getFriendlyAuthError(requestRateLimit)).toBe('Too many signup attempts. Please wait a moment and try again.')
  })

  it('maps a bare 429 status without a recognized code to the general rate-limit message', () => {
    const unknownRateLimit = makeAuthError({ code: undefined, status: 429, message: 'For security purposes, please retry later' })
    expect(getFriendlyAuthError(unknownRateLimit)).toBe('Too many signup attempts. Please wait a moment and try again.')
  })

  it('maps weak_password separately from other errors', () => {
    const weak = makeAuthError({ code: 'weak_password', message: 'Password is too weak' })
    expect(getFriendlyAuthError(weak)).toBe('Please choose a stronger password with at least 6 characters.')
  })

  it('maps duplicate-account errors (by code or message) separately', () => {
    const byCode = makeAuthError({ code: 'user_already_exists', message: 'User already registered' })
    expect(getFriendlyAuthError(byCode)).toBe('An account with that email already exists. Please sign in instead.')

    const byEmailExistsCode = makeAuthError({ code: 'email_exists', message: 'Email already exists' })
    expect(getFriendlyAuthError(byEmailExistsCode)).toBe('An account with that email already exists. Please sign in instead.')
  })

  it('maps invalid-email errors separately from not-allowed-email errors', () => {
    const invalid = makeAuthError({ code: 'email_address_invalid', message: 'Email address is invalid' })
    expect(getFriendlyAuthError(invalid)).toBe('Please enter a valid email address.')

    const notAllowed = makeAuthError({ code: 'email_address_not_authorized', message: 'Email not allowed' })
    expect(getFriendlyAuthError(notAllowed)).toBe('This email address cannot be used for registration.')
  })

  it('falls back to a generic message for an unrecognized error', () => {
    const unknown = makeAuthError({ code: undefined, message: 'Unexpected failure' })
    expect(getFriendlyAuthError(unknown)).toBe('We could not create your account right now. Please try again.')
  })
})

describe('getLoginAuthError', () => {
  it('falls back safely when there is no error', () => {
    expect(getLoginAuthError(null)).toBe('Unable to sign in right now. Please try again.')
  })

  it('maps invalid_credentials to the generic incorrect-email-or-password message', () => {
    const invalid = makeAuthError({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' })
    expect(getLoginAuthError(invalid)).toBe('Incorrect email or password. Please try again.')
  })

  it('maps email_not_confirmed separately from invalid credentials', () => {
    const unconfirmed = makeAuthError({ code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' })
    expect(getLoginAuthError(unconfirmed)).toBe('Please confirm your email address before signing in.')
  })

  it('does not mistake an unconfirmed-email error for invalid credentials merely because its message contains "email"', () => {
    // Regression test: the previous inline login mapper matched a bare
    // `message.includes('email')` inside its invalid-credentials bucket,
    // which meant this exact case (and any other "email"-mentioning error)
    // was misreported as a wrong password.
    const unconfirmed = makeAuthError({ code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' })
    expect(getLoginAuthError(unconfirmed)).not.toBe('Incorrect email or password. Please try again.')
  })

  it('maps email_address_invalid separately from invalid credentials', () => {
    const invalidEmail = makeAuthError({ code: 'email_address_invalid', status: 400, message: 'Unable to validate email address: invalid format' })
    expect(getLoginAuthError(invalidEmail)).toBe('Please enter a valid email address.')
  })

  it('maps over_request_rate_limit to a temporary-limit message, not invalid credentials', () => {
    const rateLimited = makeAuthError({ code: 'over_request_rate_limit', status: 429, message: 'Request rate limit reached' })
    expect(getLoginAuthError(rateLimited)).toBe('Too many sign-in attempts. Please wait a moment and try again.')
  })

  it('maps a bare 429 status without a recognized code to the rate-limit message', () => {
    const rateLimited = makeAuthError({ code: undefined, status: 429, message: 'For security purposes, please retry later' })
    expect(getLoginAuthError(rateLimited)).toBe('Too many sign-in attempts. Please wait a moment and try again.')
  })

  it('falls back to a generic message for an unrecognized error', () => {
    const unknown = makeAuthError({ code: undefined, status: 500, message: 'Unexpected failure' })
    expect(getLoginAuthError(unknown)).toBe('Unable to sign in right now. Please try again.')
  })
})

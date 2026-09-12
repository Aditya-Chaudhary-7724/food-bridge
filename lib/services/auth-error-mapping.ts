import type { AuthError } from '@supabase/supabase-js'

// Pure, framework-free mapping from a Supabase AuthError to the message
// shown to the user. Kept separate from app/register/page.tsx so it can be
// unit-tested without a browser environment.
//
// Supabase's AuthError carries a stable, machine-readable `code` (and HTTP
// `status`) alongside `message` — see @supabase/auth-js's ErrorCode union
// (over_email_send_rate_limit, over_request_rate_limit, email_exists,
// weak_password, email_address_invalid, email_address_not_authorized, ...).
// Branching on `code`/`status` first is deliberate: `message` wording can
// differ across Supabase versions/locales, and a single "rate limit"
// substring check would collapse two distinct cases (the per-IP/request
// limit and the email-send limit) into one generic message, even though
// signUp()'s rate limit hit during normal use is almost always the
// email-send limit (every signup sends a confirmation email). Message
// substrings remain as a fallback only, for any error Supabase returns
// without a recognized code.
export function getFriendlyAuthError(error: AuthError | null): string {
  if (!error) {
    return 'We could not create your account right now. Please try again.'
  }

  const code = error.code
  const status = error.status
  const normalized = error.message?.toLowerCase() ?? ''

  if (code === 'over_email_send_rate_limit') {
    return 'Too many signup emails have been requested. Please wait before trying again.'
  }

  if (
    code === 'over_request_rate_limit' ||
    status === 429 ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'Too many signup attempts. Please wait a moment and try again.'
  }

  if (code === 'weak_password' || normalized.includes('password') || normalized.includes('weak')) {
    return 'Please choose a stronger password with at least 6 characters.'
  }

  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    normalized.includes('user already registered') ||
    normalized.includes('already exists')
  ) {
    return 'An account with that email already exists. Please sign in instead.'
  }

  if (code === 'email_address_invalid' || (normalized.includes('email') && normalized.includes('invalid'))) {
    return 'Please enter a valid email address.'
  }

  if (code === 'email_address_not_authorized' || (normalized.includes('email') && normalized.includes('not allowed'))) {
    return 'This email address cannot be used for registration.'
  }

  return 'We could not create your account right now. Please try again.'
}

// Same approach as getFriendlyAuthError() above, for signInWithPassword().
// The previous login mapper (formerly inline in app/login/page.tsx) matched
// a bare `message.includes('email')` as part of its "invalid credentials"
// bucket — which meant ANY Supabase error mentioning "email" at all
// (email_not_confirmed, an invalid email format, an email-related rate
// limit) was misreported as "Incorrect email or password", even though
// none of those are actually a wrong-password case. Branching on `code`
// first, and checking the more specific cases (unconfirmed email, rate
// limit, invalid format) before the generic invalid-credentials fallback,
// fixes that. The invalid-credentials message is deliberately generic and
// must never be more specific than this — confirming vs. denying whether a
// given email has an account would leak account existence to an attacker.
export function getLoginAuthError(error: AuthError | null): string {
  if (!error) {
    return 'Unable to sign in right now. Please try again.'
  }

  const code = error.code
  const status = error.status
  const normalized = error.message?.toLowerCase() ?? ''

  if (
    code === 'email_not_confirmed' ||
    normalized.includes('not confirmed') ||
    normalized.includes('confirm your email')
  ) {
    return 'Please confirm your email address before signing in.'
  }

  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    status === 429 ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'Too many sign-in attempts. Please wait a moment and try again.'
  }

  if (code === 'email_address_invalid' || (normalized.includes('email') && normalized.includes('invalid'))) {
    return 'Please enter a valid email address.'
  }

  if (
    code === 'invalid_credentials' ||
    normalized.includes('invalid login') ||
    normalized.includes('invalid credentials')
  ) {
    return 'Incorrect email or password. Please try again.'
  }

  return 'Unable to sign in right now. Please try again.'
}

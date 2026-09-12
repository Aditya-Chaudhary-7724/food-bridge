// Signup role options for app/register/page.tsx's role <select>. Extracted
// to a constant (same pattern as FOOD_CATEGORIES/URGENCY_LEVELS) so the
// exact UI-label -> backend-role-value mapping can be unit-tested without
// rendering the page, and so the register page and any test importing this
// can never drift apart.
//
// The `value`s are passed verbatim into supabase.auth.signUp()'s
// options.data.role, which the handle_new_user() trigger casts to the
// user_role Postgres enum (falling back to 'donor' for anything that isn't
// a valid label — see 20260902000002_handle_new_user_role_cast_safety.sql).
export const SIGNUP_ROLE_OPTIONS = [
  { value: 'donor', label: 'Food Donor' },
  { value: 'ngo', label: 'NGO / Organization' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'logistics', label: 'Logistics Partner' },
] as const

export type SignupRole = (typeof SIGNUP_ROLE_OPTIONS)[number]['value']

import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/db/types'

export type Profile = Database['public']['Tables']['profiles']['Row']

export type AuthContext = {
  user: User
  profile: Profile
}

/**
 * Resolves the current request's authenticated user AND their `profiles`
 * row in one call. This is the single reliable source for role and
 * organization_id server-side — never trust user_metadata (client-supplied
 * at signup) for authorization decisions.
 *
 * Returns null when there is no session or the profile row is missing
 * (the latter should not happen given the handle_new_user trigger, but a
 * missing profile is treated as "not authenticated" rather than crashing).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) return null

  return { user, profile }
}

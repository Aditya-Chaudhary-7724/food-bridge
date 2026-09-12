import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/db/types'

// Server-only privileged client. Never import this module from a Client
// Component or anything that ships to the browser — SUPABASE_SERVICE_ROLE_KEY
// bypasses Row Level Security entirely.
//
// Use it only for operations that have no other legitimate path under RLS
// (see lib/services for examples), never as a shortcut around a user's own
// permissions. Normal reads/writes must go through lib/supabase/server.ts
// (or client.ts on the client) so RLS stays the source of truth.

let cachedAdminClient: SupabaseClient<Database> | null = null

export function createAdminClient(): SupabaseClient<Database> {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() must never be called from client-side code.')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY (server-only, never NEXT_PUBLIC_*) in the environment.',
    )
  }

  if (!cachedAdminClient) {
    cachedAdminClient = createSupabaseClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  return cachedAdminClient
}

'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext, type Profile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { updateProfileSchema, type UpdateProfileInput } from '@/lib/validations/profile'
import { actionError, actionOk, type ActionResult } from '@/lib/actions/shared'

export type { Profile }

export async function getCurrentProfile(): Promise<ActionResult<Profile>> {
  const context = await getAuthContext()
  if (!context) return actionError('getCurrentProfile', new Error('Not authenticated'))
  return actionOk(context.profile)
}

/**
 * Updates the caller's own profile. Only full_name/phone are accepted by
 * updateProfileSchema — role, id, organization_id are never writable here.
 * trg_protect_profile_fields additionally reverts role/id/created_at
 * server-side for non-admins even if this action's allowlist were bypassed.
 */
export async function updateProfile(input: UpdateProfileInput): Promise<ActionResult<Profile>> {
  const context = await getAuthContext()
  if (!context) return actionError('updateProfile', new Error('Not authenticated'))

  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid profile details.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').update(parsed.data).eq('id', context.user.id).select('*').single()

  if (error || !data) return actionError('updateProfile', error)

  revalidatePath('/profile')
  revalidatePath('/settings')
  return actionOk(data)
}

'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { createOrganizationSchema, type CreateOrganizationInput } from '@/lib/validations/organization'
import { canOnboardOrganization } from '@/lib/services/organization-authorization'
import { parseCreateOrganizationResult } from '@/lib/services/organization-result'
import { actionError, actionOk, type ActionResult } from '@/lib/actions/shared'

/**
 * Creates an organization for the calling NGO and links it to their own
 * profile, via the atomic create_organization_and_link_profile() RPC
 * (caller-role-checked, row-locked on the caller's own profile, status-
 * checked — see 20260907000001_ngo_organization_onboarding.sql). This
 * action only validates input and pre-checks role/link-state for a clean
 * error message; the RPC is the actual authorization and concurrency
 * boundary and is not modified here.
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<ActionResult<{ organizationId: string }>> {
  const context = await getAuthContext()
  if (!context) return actionError('createOrganization', new Error('Not authenticated'))

  const parsed = createOrganizationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid organization details.' }
  }

  if (!canOnboardOrganization(context.profile)) {
    return {
      success: false,
      error:
        context.profile.role !== 'ngo'
          ? 'Only NGO accounts can set up an organization this way.'
          : 'Your account is already linked to an organization.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_organization_and_link_profile', {
    p_name: parsed.data.name,
    p_address: parsed.data.address,
    p_description: parsed.data.description ?? null,
    p_contact_email: parsed.data.contact_email ?? null,
    p_contact_phone: parsed.data.contact_phone ?? null,
    p_daily_capacity_kg: parsed.data.daily_capacity_kg ?? null,
    p_latitude: parsed.data.latitude ?? null,
    p_longitude: parsed.data.longitude ?? null,
  })

  if (error) return actionError('createOrganization', error)

  const result = parseCreateOrganizationResult(data)
  if (!result) return actionError('createOrganization:parse', new Error('Unrecognized create_organization_and_link_profile response'))
  if (!result.success) return { success: false, error: result.message }

  revalidatePath('/dashboard')
  return actionOk({ organizationId: result.organizationId })
}

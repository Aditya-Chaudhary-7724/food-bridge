'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/db/types'
import { ngoRequirementSchema, type NgoRequirementInput } from '@/lib/validations/ngo-requirement'
import { generateEmbedding } from '@/lib/services/embeddings'
import { actionError, actionOk, type ActionResult } from '@/lib/actions/shared'

function buildRequirementEmbeddingText(input: { food_categories: string[]; dietary_requirements: string[] }): string {
  return `Food categories needed: ${input.food_categories.join(', ') || 'any'}. Dietary requirements: ${input.dietary_requirements.join(', ') || 'none'}.`
}

export type NgoRequirementRow = Database['public']['Tables']['ngo_requirements']['Row']

function requireNgoOrg(profile: { role: string; organization_id: string | null }): { success: false; error: string } | null {
  if (profile.role !== 'ngo' && profile.role !== 'admin') {
    return { success: false, error: 'Only NGO accounts can manage requirements.' }
  }
  if (!profile.organization_id) {
    return { success: false, error: 'Link your account to an organization before configuring requirements.' }
  }
  return null
}

export async function listMyRequirements(): Promise<ActionResult<NgoRequirementRow[]>> {
  const context = await getAuthContext()
  if (!context) return actionError('listMyRequirements', new Error('Not authenticated'))

  if (context.profile.role !== 'ngo' && context.profile.role !== 'admin') {
    return actionOk([])
  }
  if (!context.profile.organization_id) {
    return actionOk([])
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ngo_requirements')
    .select('*')
    .eq('organization_id', context.profile.organization_id)
    .order('created_at', { ascending: false })

  if (error) return actionError('listMyRequirements', error)
  return actionOk(data ?? [])
}

export async function createRequirement(input: NgoRequirementInput): Promise<ActionResult<NgoRequirementRow>> {
  const context = await getAuthContext()
  if (!context) return actionError('createRequirement', new Error('Not authenticated'))

  const guard = requireNgoOrg(context.profile)
  if (guard) return guard

  const parsed = ngoRequirementSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid requirement details.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ngo_requirements')
    .insert({ ...parsed.data, organization_id: context.profile.organization_id! })
    .select('*')
    .single()

  if (error || !data) return actionError('createRequirement', error)

  // Best-effort: a requirement is fully usable without an embedding —
  // matching falls back to a neutral semantic score when it's absent.
  try {
    const embedding = await generateEmbedding(buildRequirementEmbeddingText(parsed.data))
    if (embedding) {
      const { error: embeddingError } = await supabase.from('ngo_requirements').update({ requirement_embedding: embedding }).eq('id', data.id)
      if (embeddingError) console.error('[createRequirement] failed to store requirement_embedding:', embeddingError)
    }
  } catch (error) {
    console.error('[createRequirement] embedding generation failed:', error)
  }

  revalidatePath('/dashboard')
  return actionOk(data)
}

export async function updateRequirement(requirementId: string, input: NgoRequirementInput): Promise<ActionResult<NgoRequirementRow>> {
  const context = await getAuthContext()
  if (!context) return actionError('updateRequirement', new Error('Not authenticated'))

  const guard = requireNgoOrg(context.profile)
  if (guard) return guard

  const parsed = ngoRequirementSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid requirement details.' }
  }

  const supabase = await createClient()
  // organization_id is intentionally not in the update payload — RLS's
  // ngo_requirements_update policy already scopes this to the caller's own
  // organization, and re-sending it here would let a caller attempt (and
  // have RLS correctly reject) reassignment to a different org.
  const { data, error } = await supabase.from('ngo_requirements').update(parsed.data).eq('id', requirementId).select('*').single()

  if (error || !data) return actionError('updateRequirement', error, 'Requirement not found or not editable.')

  try {
    const embedding = await generateEmbedding(buildRequirementEmbeddingText(parsed.data))
    if (embedding) {
      const { error: embeddingError } = await supabase.from('ngo_requirements').update({ requirement_embedding: embedding }).eq('id', data.id)
      if (embeddingError) console.error('[updateRequirement] failed to store requirement_embedding:', embeddingError)
    }
  } catch (error) {
    console.error('[updateRequirement] embedding generation failed:', error)
  }

  revalidatePath('/dashboard')
  return actionOk(data)
}

export async function deleteRequirement(requirementId: string): Promise<ActionResult<null>> {
  const context = await getAuthContext()
  if (!context) return actionError('deleteRequirement', new Error('Not authenticated'))

  const guard = requireNgoOrg(context.profile)
  if (guard) return guard

  const supabase = await createClient()
  const { error } = await supabase.from('ngo_requirements').delete().eq('id', requirementId)

  if (error) return actionError('deleteRequirement', error)

  revalidatePath('/dashboard')
  return actionOk(null)
}

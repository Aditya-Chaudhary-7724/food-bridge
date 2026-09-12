'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/db/types'
import {
  createDonationSchema,
  updateDonationSchema,
  claimDonationSchema,
  deleteDonationSchema,
  type CreateDonationInput,
  type UpdateDonationInput,
  type ClaimDonationInput,
  type DeleteDonationInput,
} from '@/lib/validations/donation'
import { canClaimDonation, canCreateDonation, canDeleteDonation, canEditDonation } from '@/lib/services/donation-authorization'
import { parseClaimDonationResult } from '@/lib/services/claim-result'
import { parseMatchGenerationResult } from '@/lib/services/match-generation-result'
import { createNotification } from '@/lib/services/notifications'
import { generateEmbedding } from '@/lib/services/embeddings'
import { actionError, actionOk, type ActionResult } from '@/lib/actions/shared'

export type DonationRow = Database['public']['Tables']['donations']['Row']
export type DonationItemRow = Database['public']['Tables']['donation_items']['Row']
export type DonationWithOrganization = DonationRow & { organizationName: string | null }

/**
 * Lists donations visible to the current user. No role branching happens
 * here — donations_select RLS already scopes the result set per role
 * (donor: own donations, ngo: available + their org's, logistics: their
 * assigned pickups, admin: all), so the same query is correct for every role.
 */
export async function listMyDonations(): Promise<ActionResult<DonationWithOrganization[]>> {
  const context = await getAuthContext()
  if (!context) return actionError('listMyDonations', new Error('Not authenticated'))

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return actionError('listMyDonations', error)

  const donations = data ?? []
  const organizationIds = Array.from(
    new Set(donations.map((donation) => donation.organization_id).filter((id): id is string => Boolean(id))),
  )

  const organizationNameById = new Map<string, string>()
  if (organizationIds.length > 0) {
    const { data: organizations, error: organizationsError } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', organizationIds)

    if (organizationsError) return actionError('listMyDonations:organizations', organizationsError)

    for (const organization of organizations ?? []) {
      organizationNameById.set(organization.id, organization.name)
    }
  }

  return actionOk(
    donations.map((donation) => ({
      ...donation,
      organizationName: donation.organization_id ? (organizationNameById.get(donation.organization_id) ?? null) : null,
    })),
  )
}

export async function getDonationDetail(
  donationId: string,
): Promise<ActionResult<{ donation: DonationRow; items: DonationItemRow[] }>> {
  const context = await getAuthContext()
  if (!context) return actionError('getDonationDetail', new Error('Not authenticated'))

  const supabase = await createClient()
  const { data: donation, error } = await supabase.from('donations').select('*').eq('id', donationId).single()

  if (error || !donation) return actionError('getDonationDetail', error ?? new Error('Not found'), 'Donation not found.')

  const { data: items, error: itemsError } = await supabase
    .from('donation_items')
    .select('*')
    .eq('donation_id', donationId)
    .order('created_at', { ascending: true })

  if (itemsError) return actionError('getDonationDetail:items', itemsError)

  return actionOk({ donation, items: items ?? [] })
}

export async function createDonation(input: CreateDonationInput): Promise<ActionResult<DonationRow>> {
  const context = await getAuthContext()
  if (!context) return actionError('createDonation', new Error('Not authenticated'))

  if (!canCreateDonation(context.profile)) {
    return { success: false, error: 'Only donor accounts can create donations.' }
  }

  const parsed = createDonationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid donation details.' }
  }

  const { items, ...donationInput } = parsed.data

  const supabase = await createClient()
  const { data: donation, error } = await supabase
    .from('donations')
    .insert({ ...donationInput, donor_id: context.user.id })
    .select('*')
    .single()

  if (error || !donation) return actionError('createDonation', error)

  if (items && items.length > 0) {
    const { error: itemsError } = await supabase
      .from('donation_items')
      .insert(items.map((item) => ({ ...item, donation_id: donation.id })))

    if (itemsError) {
      // Best-effort compensation: the donation shell has no value without
      // its items when the caller explicitly asked for items. There is no
      // multi-statement client transaction available without introducing a
      // new stored procedure, which is out of scope for this pass.
      await supabase.from('donations').delete().eq('id', donation.id)
      return actionError('createDonation:items', itemsError)
    }
  }

  // Best-effort: embedding generation and match recommendation must never
  // block donation creation. A donation is fully usable without either —
  // generate_match_recommendations() falls back to a neutral semantic score
  // when food_embedding is absent, and this can be re-run later.
  try {
    const embedding = await generateEmbedding(`${donation.title}. ${donation.description ?? ''} Category: ${donation.food_category}.`)
    if (embedding) {
      const { error: embeddingError } = await supabase.from('donations').update({ food_embedding: embedding }).eq('id', donation.id)
      if (embeddingError) console.error('[createDonation] failed to store food_embedding:', embeddingError)
    }

    const { data: matchData, error: matchError } = await supabase.rpc('generate_match_recommendations', { p_donation_id: donation.id })
    if (matchError) {
      console.error('[createDonation] generate_match_recommendations failed:', matchError)
    } else {
      const matchResult = parseMatchGenerationResult(matchData)
      if (!matchResult?.success) console.error('[createDonation] match generation returned an error:', matchResult)
    }
  } catch (error) {
    console.error('[createDonation] embedding/match generation failed:', error)
  }

  revalidatePath('/dashboard')
  return actionOk(donation)
}

export async function updateDonation(donationId: string, input: UpdateDonationInput): Promise<ActionResult<DonationRow>> {
  const context = await getAuthContext()
  if (!context) return actionError('updateDonation', new Error('Not authenticated'))

  const parsed = updateDonationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid update.' }
  }

  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase.from('donations').select('*').eq('id', donationId).single()

  if (fetchError || !existing) {
    return actionError('updateDonation:fetch', fetchError ?? new Error('Not found'), 'Donation not found.')
  }

  if (!canEditDonation(existing, context.profile)) {
    return { success: false, error: 'You are not allowed to edit this donation.' }
  }

  const { data: updated, error } = await supabase.from('donations').update(parsed.data).eq('id', donationId).select('*').single()

  if (error || !updated) return actionError('updateDonation', error)

  revalidatePath('/dashboard')
  return actionOk(updated)
}

/**
 * Deletes a donation. canDeleteDonation() mirrors the donations_delete RLS
 * policy (20260825000003_rls_authorization.sql: donor may delete only their
 * own donation while status = 'available'; admin may delete any) for a
 * fast, clean error — the DELETE below is still scoped by RLS regardless,
 * so this can never remove a donation the caller isn't actually authorized
 * to remove even if this check were skipped or wrong.
 */
export async function deleteDonation(input: DeleteDonationInput): Promise<ActionResult<{ id: string }>> {
  const context = await getAuthContext()
  if (!context) return actionError('deleteDonation', new Error('Not authenticated'))

  const parsed = deleteDonationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid delete request.' }
  }

  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase
    .from('donations')
    .select('*')
    .eq('id', parsed.data.donationId)
    .single()

  if (fetchError || !existing) {
    return actionError('deleteDonation:fetch', fetchError ?? new Error('Not found'), 'Donation not found.')
  }

  if (!canDeleteDonation(existing, context.profile)) {
    return { success: false, error: 'This donation can no longer be deleted — it has already progressed past the available stage.' }
  }

  const { error } = await supabase.from('donations').delete().eq('id', existing.id)
  if (error) return actionError('deleteDonation', error)

  revalidatePath('/dashboard')
  return actionOk({ id: existing.id })
}

/**
 * Claims a donation on behalf of the caller's organization via the atomic
 * claim_donation() RPC (row-locked, status-checked, pickup-created — see
 * 20260825000004_claim_function.sql). This action only validates input and
 * pre-checks role for a clean error message; the RPC is the actual
 * authorization and concurrency boundary and is not modified here.
 */
export async function claimDonation(input: ClaimDonationInput): Promise<ActionResult<{ pickupId: string }>> {
  const context = await getAuthContext()
  if (!context) return actionError('claimDonation', new Error('Not authenticated'))

  const parsed = claimDonationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid claim request.' }
  }

  if (!canClaimDonation(context.profile)) {
    return { success: false, error: 'Only NGO accounts can claim donations.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('claim_donation', {
    p_donation_id: parsed.data.donationId,
    p_organization_id: parsed.data.organizationId,
  })

  if (error) return actionError('claimDonation', error)

  const result = parseClaimDonationResult(data)
  if (!result) return actionError('claimDonation:parse', new Error('Unrecognized claim_donation response'))

  if (!result.success) {
    return { success: false, error: result.message }
  }

  // Best-effort: a notification failure must not undo an already-committed claim.
  await createNotification({
    userId: context.user.id,
    title: 'Donation claimed',
    message: 'You claimed a donation and a pickup has been scheduled.',
    type: 'donation_claimed',
    referenceId: result.pickupId,
    referenceType: 'pickup',
  })

  revalidatePath('/dashboard')
  revalidatePath('/notifications')
  return actionOk({ pickupId: result.pickupId })
}

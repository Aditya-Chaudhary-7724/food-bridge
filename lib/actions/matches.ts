'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/db/types'
import { respondToMatchSchema, type RespondToMatchInput } from '@/lib/validations/match'
import { claimDonation } from '@/lib/actions/donations'
import { actionError, actionOk, type ActionResult } from '@/lib/actions/shared'

export type MatchRow = Database['public']['Tables']['match_recommendations']['Row']
export type MatchWithContext = MatchRow & { donationTitle: string | null; organizationName: string | null }

/**
 * Lists match recommendations visible to the current user.
 * match_recommendations_select RLS already scopes the result (donor:
 * recommendations for their own donations, ngo: recommendations for their
 * org, admin: all) — same "no role branching" pattern as donations/pickups.
 */
export async function listMyMatches(): Promise<ActionResult<MatchWithContext[]>> {
  const context = await getAuthContext()
  if (!context) return actionError('listMyMatches', new Error('Not authenticated'))

  const supabase = await createClient()
  const { data, error } = await supabase.from('match_recommendations').select('*').order('final_score', { ascending: false }).limit(50)

  if (error) return actionError('listMyMatches', error)

  const matches = data ?? []
  const donationIds = Array.from(new Set(matches.map((m) => m.donation_id)))
  const organizationIds = Array.from(new Set(matches.map((m) => m.organization_id)))

  const donationTitleById = new Map<string, string>()
  if (donationIds.length > 0) {
    const { data: donations, error: donationsError } = await supabase.from('donations').select('id, title').in('id', donationIds)
    if (donationsError) return actionError('listMyMatches:donations', donationsError)
    for (const donation of donations ?? []) donationTitleById.set(donation.id, donation.title)
  }

  const organizationNameById = new Map<string, string>()
  if (organizationIds.length > 0) {
    const { data: organizations, error: organizationsError } = await supabase.from('organizations').select('id, name').in('id', organizationIds)
    if (organizationsError) return actionError('listMyMatches:organizations', organizationsError)
    for (const organization of organizations ?? []) organizationNameById.set(organization.id, organization.name)
  }

  return actionOk(
    matches.map((match) => ({
      ...match,
      donationTitle: donationTitleById.get(match.donation_id) ?? null,
      organizationName: organizationNameById.get(match.organization_id) ?? null,
    })),
  )
}

/**
 * An NGO responds to a pending recommendation. Rejecting just updates status
 * (RLS: ngo may update their own org's pending recommendation — scores stay
 * server-controlled via trg_protect_match_fields regardless). Accepting
 * reuses the existing claimDonation() action — the same atomic,
 * concurrency-safe claim_donation() RPC — so there is exactly one path that
 * actually claims a donation, whether reached from the Matches view or
 * anywhere else.
 */
export async function respondToMatch(input: RespondToMatchInput): Promise<ActionResult<{ pickupId: string | null }>> {
  const context = await getAuthContext()
  if (!context) return actionError('respondToMatch', new Error('Not authenticated'))

  const parsed = respondToMatchSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid response.' }
  }

  if (context.profile.role !== 'ngo' && context.profile.role !== 'admin') {
    return { success: false, error: 'Only NGO accounts can respond to match recommendations.' }
  }

  const supabase = await createClient()
  const { data: match, error: fetchError } = await supabase
    .from('match_recommendations')
    .select('*')
    .eq('id', parsed.data.matchId)
    .single()

  if (fetchError || !match) {
    return actionError('respondToMatch:fetch', fetchError ?? new Error('Not found'), 'Recommendation not found.')
  }

  if (match.status !== 'pending') {
    return { success: false, error: 'This recommendation has already been responded to.' }
  }

  if (parsed.data.decision === 'rejected') {
    const { error } = await supabase.from('match_recommendations').update({ status: 'rejected' }).eq('id', match.id)
    if (error) return actionError('respondToMatch:reject', error)
    revalidatePath('/dashboard')
    return actionOk({ pickupId: null })
  }

  const claimResult = await claimDonation({ donationId: match.donation_id, organizationId: match.organization_id })
  if (!claimResult.success) {
    return { success: false, error: claimResult.error }
  }

  const { error: acceptError } = await supabase.from('match_recommendations').update({ status: 'accepted' }).eq('id', match.id)
  if (acceptError) {
    // The claim already succeeded — don't report failure for a
    // best-effort status label update on top of an already-committed claim.
    console.error('[respondToMatch] claim succeeded but match status update failed:', acceptError)
  }

  revalidatePath('/dashboard')
  return actionOk({ pickupId: claimResult.data.pickupId })
}

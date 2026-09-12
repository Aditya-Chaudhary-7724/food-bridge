'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/db/types'
import {
  acceptPickupSchema,
  assignVolunteerSchema,
  updatePickupStatusSchema,
  type AcceptPickupInput,
  type AssignVolunteerInput,
  type UpdatePickupStatusInput,
} from '@/lib/validations/pickup'
import { canAcceptPickup, canUpdatePickupStatus, getLogisticsEventType, isValidTransitionForRole } from '@/lib/services/pickup-lifecycle'
import { parseAssignPickupResult } from '@/lib/services/assign-result'
import { createNotification } from '@/lib/services/notifications'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionError, actionOk, type ActionResult } from '@/lib/actions/shared'

export type PickupRow = Database['public']['Tables']['pickups']['Row']
export type PickupWithContext = PickupRow & { donationTitle: string | null; organizationName: string | null }

/**
 * Lists pickups visible to the current user. As with donations, no role
 * branching happens here — pickups_select RLS already scopes the result
 * (donor: pickups for their donations, ngo: their org's, logistics: their
 * assigned pickups, admin: all).
 */
export async function listMyPickups(): Promise<ActionResult<PickupWithContext[]>> {
  const context = await getAuthContext()
  if (!context) return actionError('listMyPickups', new Error('Not authenticated'))

  const supabase = await createClient()
  const { data, error } = await supabase.from('pickups').select('*').order('scheduled_at', { ascending: false }).limit(50)

  if (error) return actionError('listMyPickups', error)

  const pickups = data ?? []
  const donationIds = Array.from(new Set(pickups.map((p) => p.donation_id)))
  const organizationIds = Array.from(new Set(pickups.map((p) => p.organization_id)))

  const donationTitleById = new Map<string, string>()
  if (donationIds.length > 0) {
    const { data: donations, error: donationsError } = await supabase.from('donations').select('id, title').in('id', donationIds)
    if (donationsError) return actionError('listMyPickups:donations', donationsError)
    for (const donation of donations ?? []) donationTitleById.set(donation.id, donation.title)
  }

  const organizationNameById = new Map<string, string>()
  if (organizationIds.length > 0) {
    const { data: organizations, error: organizationsError } = await supabase.from('organizations').select('id, name').in('id', organizationIds)
    if (organizationsError) return actionError('listMyPickups:organizations', organizationsError)
    for (const organization of organizations ?? []) organizationNameById.set(organization.id, organization.name)
  }

  return actionOk(
    pickups.map((pickup) => ({
      ...pickup,
      donationTitle: donationTitleById.get(pickup.donation_id) ?? null,
      organizationName: organizationNameById.get(pickup.organization_id) ?? null,
    })),
  )
}

/**
 * Accepts an unassigned, 'scheduled' pickup on behalf of the calling
 * logistics user via the atomic assign_pickup_to_logistics() RPC (row-locked,
 * status-checked — see 20260904000001_org_protection_and_pickup_assignment.sql).
 */
export async function acceptPickup(input: AcceptPickupInput): Promise<ActionResult<{ pickupId: string }>> {
  const context = await getAuthContext()
  if (!context) return actionError('acceptPickup', new Error('Not authenticated'))

  const parsed = acceptPickupSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid pickup.' }
  }

  if (!canAcceptPickup(context.profile)) {
    return { success: false, error: 'Only logistics accounts can accept pickups.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('assign_pickup_to_logistics', { p_pickup_id: parsed.data.pickupId })

  if (error) return actionError('acceptPickup', error)

  const result = parseAssignPickupResult(data)
  if (!result) return actionError('acceptPickup:parse', new Error('Unrecognized assign_pickup_to_logistics response'))
  if (!result.success) return { success: false, error: result.message }

  revalidatePath('/dashboard')
  return actionOk({ pickupId: result.pickupId })
}

/**
 * Returns the id/full_name of every volunteer-role profile, via the
 * list_available_volunteers() RPC (SECURITY DEFINER, logistics/admin only —
 * see 20260906000001_add_volunteer_role_support.sql). profiles_select RLS
 * (auth.uid() = id OR admin) does not otherwise let a logistics user browse
 * other profiles, and widening that policy is out of scope here — this RPC
 * is a narrow, audited exception for exactly this one picker's worth of
 * data (id + full_name only, volunteers only).
 */
export async function listAvailableVolunteers(): Promise<ActionResult<{ id: string; fullName: string }[]>> {
  const context = await getAuthContext()
  if (!context) return actionError('listAvailableVolunteers', new Error('Not authenticated'))

  if (!canAcceptPickup(context.profile)) {
    return { success: false, error: 'Only logistics accounts can view available volunteers.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_available_volunteers')

  if (error) return actionError('listAvailableVolunteers', error)

  return actionOk((data ?? []).map((row) => ({ id: row.id, fullName: row.full_name })))
}

/**
 * Assigns a volunteer to execute a pickup the calling logistics user is
 * already responsible for, via the atomic assign_volunteer_to_pickup() RPC
 * (row-locked, ownership + role + status checked). Best-effort notifies the
 * assigned volunteer — matches notifyPickupStakeholders' own best-effort
 * posture: a notification failure must never undo the already-committed
 * assignment.
 */
export async function assignVolunteerToPickup(input: AssignVolunteerInput): Promise<ActionResult<{ pickupId: string }>> {
  const context = await getAuthContext()
  if (!context) return actionError('assignVolunteerToPickup', new Error('Not authenticated'))

  const parsed = assignVolunteerSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid assignment request.' }
  }

  if (!canAcceptPickup(context.profile)) {
    return { success: false, error: 'Only logistics accounts can assign a volunteer to a pickup.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('assign_volunteer_to_pickup', {
    p_pickup_id: parsed.data.pickupId,
    p_volunteer_id: parsed.data.volunteerId,
  })

  if (error) return actionError('assignVolunteerToPickup', error)

  const result = parseAssignPickupResult(data)
  if (!result) return actionError('assignVolunteerToPickup:parse', new Error('Unrecognized assign_volunteer_to_pickup response'))
  if (!result.success) return { success: false, error: result.message }

  await createNotification({
    userId: parsed.data.volunteerId,
    title: 'New pickup assignment',
    message: 'You have been assigned to a pickup. Check My Pickups for details.',
    type: 'pickup_scheduled',
    referenceId: result.pickupId,
    referenceType: 'pickup',
  })

  revalidatePath('/dashboard')
  return actionOk({ pickupId: result.pickupId })
}

/**
 * Updates a pickup's status. Authorization mirrors pickups_update RLS
 * (admin, the assigned logistics user, or the assigned volunteer) and the
 * transition is validated against the same role-scoped lifecycle both here
 * and in the UI. On a real transition, records a logistics_events row and
 * best-effort notifies the donor and the claiming organization's members.
 */
export async function updatePickupStatus(input: UpdatePickupStatusInput): Promise<ActionResult<PickupRow>> {
  const context = await getAuthContext()
  if (!context) return actionError('updatePickupStatus', new Error('Not authenticated'))

  const parsed = updatePickupStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid status update.' }
  }

  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase.from('pickups').select('*').eq('id', parsed.data.pickupId).single()

  if (fetchError || !existing) {
    return actionError('updatePickupStatus:fetch', fetchError ?? new Error('Not found'), 'Pickup not found.')
  }

  if (!canUpdatePickupStatus(existing, context.profile)) {
    return { success: false, error: 'You are not allowed to update this pickup.' }
  }

  if (!isValidTransitionForRole(existing.status, parsed.data.status, context.profile.role)) {
    return { success: false, error: `Cannot move a pickup from "${existing.status}" to "${parsed.data.status}".` }
  }

  const timestampPatch: Partial<Database['public']['Tables']['pickups']['Update']> = {}
  if (parsed.data.status === 'completed') timestampPatch.actual_delivery_at = new Date().toISOString()
  if (parsed.data.status === 'in_transit') timestampPatch.actual_pickup_at = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from('pickups')
    .update({ status: parsed.data.status, notes: parsed.data.notes, ...timestampPatch })
    .eq('id', parsed.data.pickupId)
    .select('*')
    .single()

  if (error || !updated) return actionError('updatePickupStatus', error)

  const eventType = getLogisticsEventType(parsed.data.status)
  if (eventType) {
    const { error: eventError } = await supabase.from('logistics_events').insert({
      pickup_id: updated.id,
      recorded_by: context.user.id,
      event_type: eventType,
      notes: parsed.data.notes ?? null,
    })
    if (eventError) console.error('[updatePickupStatus] failed to record logistics event:', eventError)
  }

  await notifyPickupStakeholders(supabase, updated, parsed.data.status)

  revalidatePath('/dashboard')
  return actionOk(updated)
}

async function notifyPickupStakeholders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pickup: PickupRow,
  status: PickupRow['status'],
): Promise<void> {
  const STATUS_MESSAGE: Partial<Record<PickupRow['status'], string>> = {
    driver_assigned: 'A logistics partner has been assigned to your pickup.',
    in_transit: 'Your donation is on its way to pickup.',
    completed: 'Pickup completed — thank you for your donation!',
    failed: 'There was an issue with your scheduled pickup.',
    cancelled: 'Your pickup was cancelled.',
  }
  const message = STATUS_MESSAGE[status]
  if (!message) return

  // Best-effort: the pickup status update has already committed by the time
  // this runs. A notification-dispatch failure (including a missing
  // SUPABASE_SERVICE_ROLE_KEY) must never surface as a failure of the
  // status update itself.
  try {
    const { data: donation } = await supabase.from('donations').select('donor_id').eq('id', pickup.donation_id).single()
    const recipientIds = new Set<string>()
    if (donation?.donor_id) recipientIds.add(donation.donor_id)

    // The acting user (a logistics account, in the normal flow) has no RLS
    // visibility into other users' profile rows, so the RLS-scoped client
    // would silently return zero organization members here. Fanning out a
    // notification to a claimant org's members is a system-level operation —
    // the same legitimate use of the admin client as createNotification's
    // own insert (notifications_insert is admin-only by RLS design), not a
    // shortcut around what the logistics user is themselves allowed to read.
    const admin = createAdminClient()
    const { data: orgMembers } = await admin.from('profiles').select('id').eq('organization_id', pickup.organization_id)
    for (const member of orgMembers ?? []) recipientIds.add(member.id)

    const notificationType = status === 'completed' ? 'delivery_completed' : 'pickup_scheduled'

    await Promise.all(
      Array.from(recipientIds).map((userId) =>
        createNotification({
          userId,
          title: 'Pickup update',
          message,
          type: notificationType,
          referenceId: pickup.id,
          referenceType: 'pickup',
        }),
      ),
    )
  } catch (error) {
    console.error('[updatePickupStatus] failed to notify stakeholders:', error)
  }
}

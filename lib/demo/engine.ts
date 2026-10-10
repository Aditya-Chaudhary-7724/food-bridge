import type { ActionResult } from '@/lib/actions/shared'
import { createDonationSchema, deleteDonationSchema, type CreateDonationInput, type DeleteDonationInput } from '@/lib/validations/donation'
import { ngoRequirementSchema, type NgoRequirementInput } from '@/lib/validations/ngo-requirement'
import { respondToMatchSchema, type RespondToMatchInput } from '@/lib/validations/match'
import {
  acceptPickupSchema,
  assignVolunteerSchema,
  updatePickupStatusSchema,
  type AcceptPickupInput,
  type AssignVolunteerInput,
  type UpdatePickupStatusInput,
} from '@/lib/validations/pickup'
import { canClaimDonation, canCreateDonation, canDeleteDonation } from '@/lib/services/donation-authorization'
import { canAcceptPickup, canAssignVolunteer, canUpdatePickupStatus, isValidTransitionForRole } from '@/lib/services/pickup-lifecycle'
import { computeCapacityScore, computeDistanceScore, computeFinalScore, mapUrgencyToScore } from '@/lib/services/match-scoring'
import type {
  DemoDonation,
  DemoMatch,
  DemoNotification,
  DemoOrganization,
  DemoPickup,
  DemoProfile,
  DemoRequirement,
  DemoState,
} from '@/lib/demo/types'

// Pure, in-memory simulation of the FoodBridge workflow for demo mode.
//
// Every function takes the current DemoState plus the acting demo persona and
// returns a NEW state and an ActionResult with the same shape the real Server
// Action would return. Nothing here performs I/O: no Supabase client, no
// fetch, no Server Action import. Validation reuses the real Zod schemas and
// authorization reuses the real lib/services predicates, so the demo behaves
// like the product — but it is never an authorization boundary for anything
// real.

export type DemoContext = { now: Date; newId: () => string }
export type DemoOutcome<T> = { state: DemoState; result: ActionResult<T> }

const SIMULATION_ONLY_MESSAGE = 'This step is not simulated in demo mode.'

function ok<T>(state: DemoState, data: T): DemoOutcome<T> {
  return { state, result: { success: true, data } }
}

function fail<T>(state: DemoState, error: string): DemoOutcome<T> {
  return { state, result: { success: false, error } }
}

function firstIssue(error: { issues: { message: string }[] }, fallback: string): string {
  return error.issues[0]?.message ?? fallback
}

function notification(ctx: DemoContext, userId: string, title: string, message: string, type: DemoNotification['type'], referenceId: string | null, referenceType: string | null): DemoNotification {
  return { id: ctx.newId(), user_id: userId, title, message, type, reference_id: referenceId, reference_type: referenceType, read: false, created_at: ctx.now.toISOString() }
}

// ── Matching (simulated) ─────────────────────────────────────────────────────
// Distance, capacity, urgency and the final weighting reuse the exact
// arithmetic of lib/services/match-scoring.ts (mirrored by the SQL RPC).
// The semantic score is the one simulated input: the real engine compares
// Gemini embeddings, which the demo does not call, so it substitutes a simple
// food-category overlap. The explanation text is built only from these four
// numbers, in the same format the RPC uses.

const SIMULATED_SEMANTIC_CATEGORY_MATCH = 88
const SIMULATED_SEMANTIC_ANY_CATEGORY = 60
const SIMULATED_SEMANTIC_NO_MATCH = 30
// Neutral fallback the RPC uses when either side lacks embeddings/location.
const NEUTRAL_SCORE = 50

export function distanceKmBetween(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }): number | null {
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) return null
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export function scoreDemoMatch(donation: DemoDonation, requirement: DemoRequirement, organization: DemoOrganization) {
  const semantic =
    requirement.food_categories.length === 0
      ? SIMULATED_SEMANTIC_ANY_CATEGORY
      : requirement.food_categories.includes(donation.food_category)
        ? SIMULATED_SEMANTIC_CATEGORY_MATCH
        : SIMULATED_SEMANTIC_NO_MATCH
  const distanceKm = distanceKmBetween(donation, organization)
  const distance = distanceKm === null ? NEUTRAL_SCORE : computeDistanceScore(distanceKm)
  const capacity = computeCapacityScore(organization.daily_capacity_kg, donation.quantity, requirement.preferred_quantity_min, requirement.preferred_quantity_max)
  const urgency = mapUrgencyToScore(requirement.urgency_level)
  const final = computeFinalScore({ semantic, distance, capacity, urgency })
  const distanceText = distanceKm === null ? 'distance unknown' : `${Math.round(distanceKm * 10) / 10} km away`
  const capacityText = capacity >= 70 ? 'strong' : capacity >= 40 ? 'moderate' : 'limited'
  return {
    semantic_score: semantic,
    distance_score: distance,
    capacity_score: capacity,
    urgency_score: urgency,
    final_score: final,
    distance_km: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
    explanation: `${Math.round(semantic)}% food-category match (simulated), ${distanceText}, ${capacityText} capacity fit, ${requirement.urgency_level} urgency need.`,
  }
}

function generateMatches(state: DemoState, donation: DemoDonation, ctx: DemoContext): DemoMatch[] {
  const matches: DemoMatch[] = []
  for (const requirement of state.requirements) {
    if (!requirement.is_active) continue
    const organization = state.organizations.find((o) => o.id === requirement.organization_id)
    if (!organization) continue
    // One recommendation per (donation, organization) — the RPC upserts on that pair.
    if (matches.some((m) => m.organization_id === organization.id)) continue
    matches.push({
      id: ctx.newId(),
      donation_id: donation.id,
      organization_id: organization.id,
      ...scoreDemoMatch(donation, requirement, organization),
      status: 'pending',
      created_at: ctx.now.toISOString(),
      updated_at: ctx.now.toISOString(),
    })
  }
  return matches
}

// ── Donations ────────────────────────────────────────────────────────────────

export function demoCreateDonation(state: DemoState, actor: DemoProfile, input: CreateDonationInput, ctx: DemoContext): DemoOutcome<DemoDonation> {
  const parsed = createDonationSchema.safeParse(input)
  if (!parsed.success) return fail(state, firstIssue(parsed.error, 'Invalid donation.'))
  if (!canCreateDonation(actor)) return fail(state, 'Only donor accounts can create donations.')

  const now = ctx.now.toISOString()
  const donation: DemoDonation = {
    id: ctx.newId(),
    donor_id: actor.id,
    organization_id: null,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    food_category: parsed.data.food_category,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    prepared_at: null,
    expires_at: parsed.data.expires_at,
    pickup_address: parsed.data.pickup_address,
    pickup_location: null,
    latitude: parsed.data.latitude ?? null,
    longitude: parsed.data.longitude ?? null,
    status: 'available',
    food_embedding: null,
    created_at: now,
    updated_at: now,
  }
  const matches = generateMatches(state, donation, ctx)
  return ok({ ...state, donations: [donation, ...state.donations], matches: [...matches, ...state.matches] }, donation)
}

export function demoDeleteDonation(state: DemoState, actor: DemoProfile, input: DeleteDonationInput): DemoOutcome<{ id: string }> {
  const parsed = deleteDonationSchema.safeParse(input)
  if (!parsed.success) return fail(state, firstIssue(parsed.error, 'Invalid donation.'))
  const donation = state.donations.find((d) => d.id === parsed.data.donationId)
  if (!donation) return fail(state, 'Donation not found.')
  if (!canDeleteDonation(donation, actor)) return fail(state, 'Only available donations you created can be deleted.')
  return ok(
    { ...state, donations: state.donations.filter((d) => d.id !== donation.id), matches: state.matches.filter((m) => m.donation_id !== donation.id) },
    { id: donation.id },
  )
}

// ── NGO requirements ─────────────────────────────────────────────────────────

function requirementOrgFor(actor: DemoProfile): string | null {
  return actor.role === 'ngo' ? actor.organization_id : null
}

export function demoCreateRequirement(state: DemoState, actor: DemoProfile, input: NgoRequirementInput, ctx: DemoContext): DemoOutcome<DemoRequirement> {
  const organizationId = requirementOrgFor(actor)
  if (!organizationId) return fail(state, 'Only NGO accounts linked to an organization can manage requirements.')
  const parsed = ngoRequirementSchema.safeParse(input)
  if (!parsed.success) return fail(state, firstIssue(parsed.error, 'Invalid requirement.'))
  const now = ctx.now.toISOString()
  const requirement: DemoRequirement = {
    id: ctx.newId(),
    organization_id: organizationId,
    food_categories: parsed.data.food_categories,
    daily_capacity_kg: parsed.data.daily_capacity_kg,
    urgency_level: parsed.data.urgency_level,
    dietary_requirements: parsed.data.dietary_requirements,
    preferred_quantity_min: parsed.data.preferred_quantity_min,
    preferred_quantity_max: parsed.data.preferred_quantity_max ?? null,
    requirement_embedding: null,
    is_active: parsed.data.is_active,
    created_at: now,
    updated_at: now,
  }
  return ok({ ...state, requirements: [requirement, ...state.requirements] }, requirement)
}

export function demoUpdateRequirement(state: DemoState, actor: DemoProfile, requirementId: string, input: NgoRequirementInput, ctx: DemoContext): DemoOutcome<DemoRequirement> {
  const organizationId = requirementOrgFor(actor)
  const existing = state.requirements.find((r) => r.id === requirementId)
  if (!existing || existing.organization_id !== organizationId) return fail(state, 'Requirement not found.')
  const parsed = ngoRequirementSchema.safeParse(input)
  if (!parsed.success) return fail(state, firstIssue(parsed.error, 'Invalid requirement.'))
  const updated: DemoRequirement = {
    ...existing,
    ...parsed.data,
    preferred_quantity_max: parsed.data.preferred_quantity_max ?? null,
    updated_at: ctx.now.toISOString(),
  }
  return ok({ ...state, requirements: state.requirements.map((r) => (r.id === requirementId ? updated : r)) }, updated)
}

export function demoDeleteRequirement(state: DemoState, actor: DemoProfile, requirementId: string): DemoOutcome<null> {
  const organizationId = requirementOrgFor(actor)
  const existing = state.requirements.find((r) => r.id === requirementId)
  if (!existing || existing.organization_id !== organizationId) return fail(state, 'Requirement not found.')
  return ok({ ...state, requirements: state.requirements.filter((r) => r.id !== requirementId) }, null)
}

// ── Matches / claiming ───────────────────────────────────────────────────────
// Accepting a recommendation simulates claim_donation(): the donation must
// still be 'available'; it becomes 'claimed' by the organization and a
// 'scheduled' pickup is created. Other organizations' recommendations stay as
// they are — same as the real flow, where a later accept fails as
// "already claimed".

export function demoRespondToMatch(state: DemoState, actor: DemoProfile, input: RespondToMatchInput, ctx: DemoContext): DemoOutcome<{ pickupId: string | null }> {
  const parsed = respondToMatchSchema.safeParse(input)
  if (!parsed.success) return fail(state, firstIssue(parsed.error, 'Invalid response.'))
  if (actor.role !== 'ngo' && actor.role !== 'admin') return fail(state, 'Only NGO accounts can respond to match recommendations.')

  const match = state.matches.find((m) => m.id === parsed.data.matchId)
  if (!match || (actor.role === 'ngo' && match.organization_id !== actor.organization_id)) return fail(state, 'Recommendation not found.')
  if (match.status !== 'pending') return fail(state, 'This recommendation has already been responded to.')

  const now = ctx.now.toISOString()
  if (parsed.data.decision === 'rejected') {
    return ok({ ...state, matches: state.matches.map((m) => (m.id === match.id ? { ...m, status: 'rejected' as const, updated_at: now } : m)) }, { pickupId: null })
  }

  if (!canClaimDonation(actor)) return fail(state, 'Only NGO accounts can claim donations.')
  const donation = state.donations.find((d) => d.id === match.donation_id)
  const organization = state.organizations.find((o) => o.id === match.organization_id)
  if (!donation || !organization) return fail(state, 'Donation not found.')
  if (donation.status !== 'available') return fail(state, 'This donation has already been claimed by another organization')

  const pickup: DemoPickup = {
    id: ctx.newId(),
    donation_id: donation.id,
    organization_id: organization.id,
    logistics_user_id: null,
    volunteer_id: null,
    pickup_address: donation.pickup_address,
    pickup_location: null,
    destination_address: organization.address,
    destination_location: null,
    scheduled_at: now,
    estimated_duration_minutes: null,
    actual_pickup_at: null,
    actual_delivery_at: null,
    status: 'scheduled',
    notes: null,
    created_at: now,
    updated_at: now,
  }

  return ok(
    {
      ...state,
      donations: state.donations.map((d) => (d.id === donation.id ? { ...d, status: 'claimed' as const, organization_id: organization.id, updated_at: now } : d)),
      matches: state.matches.map((m) => (m.id === match.id ? { ...m, status: 'accepted' as const, updated_at: now } : m)),
      pickups: [pickup, ...state.pickups],
      notifications: [
        notification(ctx, actor.id, 'Donation claimed', 'You claimed a donation and a pickup has been scheduled.', 'donation_claimed', pickup.id, 'pickup'),
        ...state.notifications,
      ],
    },
    { pickupId: pickup.id },
  )
}

// ── Pickups ──────────────────────────────────────────────────────────────────

export function demoAcceptPickup(state: DemoState, actor: DemoProfile, input: AcceptPickupInput, ctx: DemoContext): DemoOutcome<{ pickupId: string }> {
  const parsed = acceptPickupSchema.safeParse(input)
  if (!parsed.success) return fail(state, firstIssue(parsed.error, 'Invalid pickup.'))
  if (!canAcceptPickup(actor)) return fail(state, 'Only logistics accounts can accept pickups.')
  const pickup = state.pickups.find((p) => p.id === parsed.data.pickupId)
  if (!pickup) return fail(state, 'Pickup not found.')
  if (pickup.status !== 'scheduled' || pickup.logistics_user_id !== null) return fail(state, 'This pickup is no longer available.')

  const now = ctx.now.toISOString()
  return ok(
    { ...state, pickups: state.pickups.map((p) => (p.id === pickup.id ? { ...p, logistics_user_id: actor.id, status: 'driver_assigned' as const, updated_at: now } : p)) },
    { pickupId: pickup.id },
  )
}

export function listDemoVolunteers(state: DemoState, actor: DemoProfile): ActionResult<{ id: string; fullName: string }[]> {
  if (!canAcceptPickup(actor)) return { success: false, error: 'Only logistics accounts can view available volunteers.' }
  return { success: true, data: state.profiles.filter((p) => p.role === 'volunteer').map((p) => ({ id: p.id, fullName: p.full_name })) }
}

const TERMINAL_PICKUP_STATUSES = new Set<DemoPickup['status']>(['completed', 'cancelled', 'failed'])

export function demoAssignVolunteer(state: DemoState, actor: DemoProfile, input: AssignVolunteerInput, ctx: DemoContext): DemoOutcome<{ pickupId: string }> {
  const parsed = assignVolunteerSchema.safeParse(input)
  if (!parsed.success) return fail(state, firstIssue(parsed.error, 'Invalid assignment request.'))
  if (!canAcceptPickup(actor)) return fail(state, 'Only logistics accounts can assign a volunteer to a pickup.')
  const pickup = state.pickups.find((p) => p.id === parsed.data.pickupId)
  if (!pickup || !canAssignVolunteer(pickup, actor)) return fail(state, 'You can only assign volunteers to pickups you are responsible for.')
  if (TERMINAL_PICKUP_STATUSES.has(pickup.status) || pickup.status === 'scheduled') return fail(state, 'This pickup cannot be assigned right now.')
  if (pickup.volunteer_id !== null) return fail(state, 'A volunteer is already assigned to this pickup.')
  const volunteer = state.profiles.find((p) => p.id === parsed.data.volunteerId && p.role === 'volunteer')
  if (!volunteer) return fail(state, 'Volunteer not found.')

  const now = ctx.now.toISOString()
  return ok(
    {
      ...state,
      pickups: state.pickups.map((p) => (p.id === pickup.id ? { ...p, volunteer_id: volunteer.id, updated_at: now } : p)),
      notifications: [
        notification(ctx, volunteer.id, 'New pickup assignment', 'You have been assigned to a pickup. Check My Pickups for details.', 'pickup_scheduled', pickup.id, 'pickup'),
        ...state.notifications,
      ],
    },
    { pickupId: pickup.id },
  )
}

const STATUS_MESSAGE: Partial<Record<DemoPickup['status'], string>> = {
  driver_assigned: 'A logistics partner has been assigned to your pickup.',
  in_transit: 'Your donation is on its way to pickup.',
  completed: 'Pickup completed — thank you for your donation!',
  failed: 'There was an issue with your scheduled pickup.',
  cancelled: 'Your pickup was cancelled.',
}

export function demoUpdatePickupStatus(state: DemoState, actor: DemoProfile, input: UpdatePickupStatusInput, ctx: DemoContext): DemoOutcome<DemoPickup> {
  const parsed = updatePickupStatusSchema.safeParse(input)
  if (!parsed.success) return fail(state, firstIssue(parsed.error, 'Invalid status update.'))
  const existing = state.pickups.find((p) => p.id === parsed.data.pickupId)
  if (!existing) return fail(state, 'Pickup not found.')
  if (!canUpdatePickupStatus(existing, actor)) return fail(state, 'You are not allowed to update this pickup.')
  if (!isValidTransitionForRole(existing.status, parsed.data.status, actor.role)) {
    return fail(state, `Cannot move a pickup from "${existing.status}" to "${parsed.data.status}".`)
  }

  const now = ctx.now.toISOString()
  const updated: DemoPickup = {
    ...existing,
    status: parsed.data.status,
    notes: parsed.data.notes ?? existing.notes,
    actual_pickup_at: parsed.data.status === 'in_transit' ? now : existing.actual_pickup_at,
    actual_delivery_at: parsed.data.status === 'completed' ? now : existing.actual_delivery_at,
    updated_at: now,
  }

  // Same recipients as the real notifyPickupStakeholders: the donor plus every
  // member of the claiming organization.
  const message = STATUS_MESSAGE[parsed.data.status]
  const recipients = new Set<string>()
  if (message) {
    const donorId = state.donations.find((d) => d.id === existing.donation_id)?.donor_id
    if (donorId) recipients.add(donorId)
    for (const member of state.profiles) if (member.organization_id === existing.organization_id) recipients.add(member.id)
  }
  const type: DemoNotification['type'] = parsed.data.status === 'completed' ? 'delivery_completed' : 'pickup_scheduled'
  const newNotifications = Array.from(recipients).map((userId) => notification(ctx, userId, 'Pickup update', message ?? '', type, existing.id, 'pickup'))

  return ok(
    { ...state, pickups: state.pickups.map((p) => (p.id === existing.id ? updated : p)), notifications: [...newNotifications, ...state.notifications] },
    updated,
  )
}

// ── Organizations / notifications ────────────────────────────────────────────

export function demoCreateOrganization(state: DemoState): DemoOutcome<{ organizationId: string }> {
  return fail(state, `${SIMULATION_ONLY_MESSAGE} Every demo NGO persona already belongs to a sample organization.`)
}

export function demoMarkNotificationsRead(state: DemoState, actor: DemoProfile): DemoState {
  return { ...state, notifications: state.notifications.map((n) => (n.user_id === actor.id && !n.read ? { ...n, read: true } : n)) }
}

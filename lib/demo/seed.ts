import type { UserRole } from '@/lib/db/types'
import {
  demoAcceptPickup,
  demoAssignVolunteer,
  demoCreateDonation,
  demoRespondToMatch,
  demoUpdatePickupStatus,
  type DemoContext,
  type DemoOutcome,
} from '@/lib/demo/engine'
import { DEMO_STATE_VERSION, type DemoOrganization, type DemoProfile, type DemoRequirement, type DemoState } from '@/lib/demo/types'

// Fictional sample data for demo mode. Names, emails (reserved .example
// domain) and organizations are invented. The workflow history is produced
// by replaying the demo engine's own commands in order, so every status,
// match, pickup and notification is consistent with what those steps would
// produce — nothing is hand-set into a state the workflow couldn't reach.

const HOUR = 60 * 60 * 1000

function demoUuid(n: number): string {
  return `d3e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

export const DEMO_PERSONA_IDS: Record<UserRole, string> = {
  donor: demoUuid(1),
  ngo: demoUuid(3),
  logistics: demoUuid(5),
  volunteer: demoUuid(6),
  admin: demoUuid(8),
}

const ORG_HOPE = demoUuid(101)
const ORG_COMMUNITY = demoUuid(102)
const ORG_LOGISTICS = demoUuid(103)

function profile(id: string, full_name: string, role: UserRole, organization_id: string | null, at: string): DemoProfile {
  const email = `${full_name.split(' ')[0].toLowerCase()}@demo.foodbridge.example`
  return { id, full_name, email, role, phone: null, avatar_url: null, organization_id, created_at: at, updated_at: at }
}

function organization(id: string, name: string, type: DemoOrganization['type'], address: string, latitude: number, longitude: number, daily_capacity_kg: number, description: string, at: string): DemoOrganization {
  return {
    id, name, type, address, location: null, latitude, longitude,
    contact_email: `hello@${name.split(' ')[0].toLowerCase()}.example`, contact_phone: null,
    description, daily_capacity_kg, dietary_preferences: [], is_verified: true, created_at: at, updated_at: at,
  }
}

function requirement(id: string, organization_id: string, food_categories: string[], daily_capacity_kg: number, urgency_level: DemoRequirement['urgency_level'], preferred_quantity_max: number | null, is_active: boolean, at: string): DemoRequirement {
  return {
    id, organization_id, food_categories, daily_capacity_kg, urgency_level, dietary_requirements: [],
    preferred_quantity_min: 0, preferred_quantity_max, requirement_embedding: null, is_active, created_at: at, updated_at: at,
  }
}

const KORAMANGALA = { latitude: 12.9352, longitude: 77.6245, address: '80 Feet Road, Koramangala, Bengaluru' }
const JAYANAGAR = { latitude: 12.9299, longitude: 77.5838, address: '11th Main, Jayanagar 4th Block, Bengaluru' }

export function createDemoSeed(now: Date = new Date()): DemoState {
  let counter = 1000
  const at = (offsetHours: number): DemoContext => ({ now: new Date(now.getTime() + offsetHours * HOUR), newId: () => demoUuid(++counter) })
  const weekAgo = new Date(now.getTime() - 7 * 24 * HOUR).toISOString()
  const inHours = (h: number) => new Date(now.getTime() + h * HOUR).toISOString()

  const profiles = [
    profile(DEMO_PERSONA_IDS.donor, 'Maya Patel', 'donor', null, weekAgo),
    profile(demoUuid(2), 'Daniel Okafor', 'donor', null, weekAgo),
    profile(DEMO_PERSONA_IDS.ngo, 'Arjun Mehta', 'ngo', ORG_HOPE, weekAgo),
    profile(demoUuid(4), 'Sara Lin', 'ngo', ORG_COMMUNITY, weekAgo),
    profile(DEMO_PERSONA_IDS.logistics, 'Leo Martins', 'logistics', ORG_LOGISTICS, weekAgo),
    profile(DEMO_PERSONA_IDS.volunteer, 'Priya Sharma', 'volunteer', null, weekAgo),
    profile(demoUuid(7), 'Tom Becker', 'volunteer', null, weekAgo),
    profile(DEMO_PERSONA_IDS.admin, 'Alex Rivera', 'admin', null, weekAgo),
  ]
  const byId = (id: string) => profiles.find((p) => p.id === id)!
  const [maya, daniel, arjun, sara, leo, priya, tom] = [
    byId(DEMO_PERSONA_IDS.donor), byId(demoUuid(2)), byId(DEMO_PERSONA_IDS.ngo), byId(demoUuid(4)),
    byId(DEMO_PERSONA_IDS.logistics), byId(DEMO_PERSONA_IDS.volunteer), byId(demoUuid(7)),
  ]

  let state: DemoState = {
    version: DEMO_STATE_VERSION,
    profiles,
    organizations: [
      organization(ORG_HOPE, 'Hope Foundation Shelter', 'ngo', '12 CMH Road, Indiranagar, Bengaluru', 12.9719, 77.6412, 150, 'Night shelter serving ~300 hot meals a day.', weekAgo),
      organization(ORG_COMMUNITY, 'Community Table Kitchen', 'ngo', '27 South End Road, Basavanagudi, Bengaluru', 12.9416, 77.5733, 60, 'Volunteer-run community kitchen for families.', weekAgo),
      organization(ORG_LOGISTICS, 'CityRoute Logistics', 'logistics', 'Hosur Road, Bengaluru', 12.9166, 77.6101, 0, 'Last-mile delivery partner donating driver time.', weekAgo),
    ],
    requirements: [
      requirement(demoUuid(201), ORG_HOPE, ['Fruits & Vegetables', 'Prepared Meals', 'Bakery & Bread'], 150, 'high', 200, true, weekAgo),
      requirement(demoUuid(202), ORG_COMMUNITY, ['Prepared Meals', 'Dairy Products'], 60, 'medium', 80, true, weekAgo),
      requirement(demoUuid(203), ORG_HOPE, ['Grains & Cereals'], 100, 'low', null, false, weekAgo),
    ],
    donations: [],
    matches: [],
    pickups: [],
    notifications: [],
  }

  function run<T>(outcome: DemoOutcome<T>): T {
    if (!outcome.result.success) throw new Error(`Demo seed step failed: ${outcome.result.error}`)
    state = outcome.state
    return outcome.result.data
  }
  function matchFor(donationId: string, organizationId: string): string {
    return state.matches.find((m) => m.donation_id === donationId && m.organization_id === organizationId)!.id
  }

  // 1. Yesterday: bread donated, claimed by Hope, delivered by volunteer Tom.
  const bread = run(demoCreateDonation(state, maya, { title: 'Day-old bread loaves', food_category: 'Bakery & Bread', quantity: 18, unit: 'kg', expires_at: inHours(4), pickup_address: KORAMANGALA.address, latitude: KORAMANGALA.latitude, longitude: KORAMANGALA.longitude, description: 'Sourdough and multigrain from yesterday’s bake.' }, at(-30)))
  const breadPickup = run(demoRespondToMatch(state, arjun, { matchId: matchFor(bread.id, ORG_HOPE), decision: 'accepted' }, at(-29.5))).pickupId!
  run(demoAcceptPickup(state, leo, { pickupId: breadPickup }, at(-29)))
  run(demoAssignVolunteer(state, leo, { pickupId: breadPickup, volunteerId: tom.id }, at(-28.8)))
  run(demoUpdatePickupStatus(state, tom, { pickupId: breadPickup, status: 'in_transit' }, at(-28)))
  run(demoUpdatePickupStatus(state, tom, { pickupId: breadPickup, status: 'completed' }, at(-27.4)))

  // 2. This morning: rice trays claimed by Hope, Leo accepted, Priya assigned (ready to start).
  const rice = run(demoCreateDonation(state, maya, { title: 'Cooked rice and dal trays', food_category: 'Prepared Meals', quantity: 25, unit: 'kg', expires_at: inHours(6), pickup_address: KORAMANGALA.address, latitude: KORAMANGALA.latitude, longitude: KORAMANGALA.longitude, description: 'Cooled and sealed after lunch service. Vegetarian.' }, at(-5)))
  const ricePickup = run(demoRespondToMatch(state, arjun, { matchId: matchFor(rice.id, ORG_HOPE), decision: 'accepted' }, at(-4.5))).pickupId!
  run(demoAcceptPickup(state, leo, { pickupId: ricePickup }, at(-4)))
  run(demoAssignVolunteer(state, leo, { pickupId: ricePickup, volunteerId: priya.id }, at(-3.8)))

  // 3. Yogurt claimed by Community Table — pickup waiting for a logistics partner.
  const yogurt = run(demoCreateDonation(state, daniel, { title: 'Yogurt cups (sealed)', food_category: 'Dairy Products', quantity: 30, unit: 'kg', expires_at: inHours(30), pickup_address: JAYANAGAR.address, latitude: JAYANAGAR.latitude, longitude: JAYANAGAR.longitude, description: 'Refrigerated, best before tomorrow evening.' }, at(-3)))
  run(demoRespondToMatch(state, sara, { matchId: matchFor(yogurt.id, ORG_COMMUNITY), decision: 'accepted' }, at(-2.5)))

  // 4. Fresh, still-open donations with pending recommendations for Hope.
  run(demoCreateDonation(state, maya, { title: 'Fresh vegetable crates', food_category: 'Fruits & Vegetables', quantity: 40, unit: 'kg', expires_at: inHours(20), pickup_address: KORAMANGALA.address, latitude: KORAMANGALA.latitude, longitude: KORAMANGALA.longitude, description: 'Tomatoes, carrots and greens from the weekend market surplus.' }, at(-1)))
  run(demoCreateDonation(state, daniel, { title: 'Whole-wheat bread loaves', food_category: 'Bakery & Bread', quantity: 15, unit: 'kg', expires_at: inHours(16), pickup_address: JAYANAGAR.address, latitude: JAYANAGAR.latitude, longitude: JAYANAGAR.longitude }, at(-0.3)))

  // Older notifications have already been seen.
  const readBefore = now.getTime() - 12 * HOUR
  state = { ...state, notifications: state.notifications.map((n) => (new Date(n.created_at).getTime() < readBefore ? { ...n, read: true } : n)) }
  return state
}

// crypto.randomUUID only exists in secure contexts (https/localhost); fall
// back to a v4 UUID from getRandomValues so the demo also works over plain
// http (e.g. a LAN preview).
export function newDemoId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

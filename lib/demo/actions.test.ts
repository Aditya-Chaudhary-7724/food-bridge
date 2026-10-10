import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Replace every real Server Action module with spies. If any demo code path
// reached a real action, these would record the call.
const realActionSpies = vi.hoisted(() => ({
  createDonation: vi.fn(), deleteDonation: vi.fn(), claimDonation: vi.fn(), updateDonation: vi.fn(), listMyDonations: vi.fn(),
  acceptPickup: vi.fn(), assignVolunteerToPickup: vi.fn(), listAvailableVolunteers: vi.fn(), updatePickupStatus: vi.fn(), listMyPickups: vi.fn(),
  createRequirement: vi.fn(), updateRequirement: vi.fn(), deleteRequirement: vi.fn(), listMyRequirements: vi.fn(),
  createOrganization: vi.fn(), respondToMatch: vi.fn(), listMyMatches: vi.fn(),
}))
vi.mock('@/lib/actions/donations', () => realActionSpies)
vi.mock('@/lib/actions/pickups', () => realActionSpies)
vi.mock('@/lib/actions/ngo-requirements', () => realActionSpies)
vi.mock('@/lib/actions/organizations', () => realActionSpies)
vi.mock('@/lib/actions/matches', () => realActionSpies)
vi.mock('@/lib/actions/notifications', () => realActionSpies)
vi.mock('@/lib/actions/profile', () => realActionSpies)

import type { UserRole } from '@/lib/db/types'
import { createDemoDashboardActions } from '@/lib/demo/actions'
import { createDemoSeed, DEMO_PERSONA_IDS } from '@/lib/demo/seed'
import { getDemoPersona, selectDemoDashboard } from '@/lib/demo/selectors'
import type { DemoState } from '@/lib/demo/types'

function harness(initialRole: UserRole) {
  let state = createDemoSeed(new Date())
  let role = initialRole
  let n = 0
  const actions = createDemoDashboardActions({
    getState: () => state,
    setState: (next: DemoState) => { state = next },
    getActor: () => getDemoPersona(state, role)!,
    context: () => ({ now: new Date(), newId: () => `b0000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }),
  })
  return { actions, get state() { return state }, switchTo: (r: UserRole) => { role = r } }
}

describe('demo dashboard actions', () => {
  it('drive the full workflow without invoking any real Server Action', async () => {
    const demo = harness('donor')
    const expires = new Date(Date.now() + 86_400_000).toISOString()

    const donation = await demo.actions.createDonation({ title: 'Veg biryani trays', food_category: 'Prepared Meals', quantity: 15, unit: 'kg', expires_at: expires, pickup_address: '80 Feet Road, Koramangala' })
    expect(donation.success).toBe(true)

    demo.switchTo('ngo')
    await demo.actions.createRequirement({ food_categories: ['Snacks & Packaged'], daily_capacity_kg: 20, urgency_level: 'low', dietary_requirements: [], preferred_quantity_min: 0, is_active: true })
    const match = selectDemoDashboard(demo.state, 'ngo')!.matches.find((m) => m.donationTitle === 'Veg biryani trays')!
    const claim = await demo.actions.respondToMatch({ matchId: match.id, decision: 'accepted' })
    if (!claim.success) throw new Error(claim.error)
    const pickupId = claim.data.pickupId!

    demo.switchTo('logistics')
    expect((await demo.actions.acceptPickup({ pickupId })).success).toBe(true)
    const volunteers = await demo.actions.listAvailableVolunteers()
    if (!volunteers.success) throw new Error(volunteers.error)
    expect(volunteers.data.map((v) => v.id)).toContain(DEMO_PERSONA_IDS.volunteer)
    expect((await demo.actions.assignVolunteerToPickup({ pickupId, volunteerId: DEMO_PERSONA_IDS.volunteer })).success).toBe(true)

    demo.switchTo('volunteer')
    expect((await demo.actions.updatePickupStatus({ pickupId, status: 'in_transit' })).success).toBe(true)
    expect((await demo.actions.updatePickupStatus({ pickupId, status: 'completed' })).success).toBe(true)
    expect(selectDemoDashboard(demo.state, 'donor')!.pickups.find((p) => p.id === pickupId)?.statusValue).toBe('completed')

    for (const spy of Object.values(realActionSpies)) expect(spy).not.toHaveBeenCalled()
  })

  it('reports organization onboarding as not simulated instead of pretending success', async () => {
    const demo = harness('ngo')
    const result = await demo.actions.createOrganization({ name: 'X', address: '1 Main Street' })
    expect(result.success).toBe(false)
    expect(realActionSpies.createOrganization).not.toHaveBeenCalled()
  })

  it('leaves state unchanged when a simulated action is rejected', async () => {
    const demo = harness('volunteer')
    const before = demo.state
    const result = await demo.actions.acceptPickup({ pickupId: before.pickups[0].id })
    expect(result.success).toBe(false)
    expect(demo.state).toBe(before)
  })
})

// Static guard on the demo boundary: nothing under lib/demo or
// components/demo may import a Server Action module, a Supabase client or
// the service-role helper as a value.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') ? [full] : []
  })
}

describe('demo-mode import boundary', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const files = [...sourceFiles(path.join(root, 'lib/demo')), ...sourceFiles(path.join(root, 'components/demo'))]

  it.each(files.map((f) => [path.relative(root, f), f]))('%s has no value import of real actions or Supabase', (_name, file) => {
    const source = readFileSync(file, 'utf8')
    const valueImports = source.split('\n').filter((line) => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line))
    for (const line of valueImports) {
      expect(line).not.toMatch(/@\/lib\/actions\/(?!shared)/)
      expect(line).not.toMatch(/@\/lib\/supabase|@supabase\//)
    }
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|createAdminClient/)
  })
})

// FoodBridgeDashboard keeps the real Server Actions as its default. Every
// component inside it must take actions from the injected context, so the
// demo's implementation actually replaces them.
describe('FoodBridgeDashboard action injection', () => {
  const source = readFileSync(path.resolve(import.meta.dirname, '../../components/foodbridge-dashboard.tsx'), 'utf8')
  const actionNames = ['createDonation', 'deleteDonation', 'createRequirement', 'updateRequirement', 'deleteRequirement', 'createOrganization', 'respondToMatch', 'acceptPickup', 'assignVolunteerToPickup', 'updatePickupStatus', 'listAvailableVolunteers']
  const components = source.split(/\n(?=function |export function )/)

  it.each(actionNames)('%s is only called via useDashboardActions()', (name) => {
    const callers = components.filter((chunk) => new RegExp(`\\b${name}\\(`).test(chunk))
    expect(callers.length).toBeGreaterThan(0)
    for (const chunk of callers) {
      expect(chunk).toMatch(new RegExp(`const \\{[^}]*\\b${name}\\b[^}]*\\} = useDashboardActions\\(\\)`))
    }
  })
})

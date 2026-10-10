import { describe, expect, it } from 'vitest'

import { createDemoSeed } from '@/lib/demo/seed'
import { selectDemoDashboard } from '@/lib/demo/selectors'
import { DEMO_ROLES } from '@/lib/demo/types'
import { getDashboardNavViews } from '@/lib/services/dashboard-navigation'
import { getPriorityTask } from '@/lib/services/dashboard-priority'
import type { PickupCardModel } from '@/lib/services/pickup-view-model'

const empty = { donations: [], pickups: [], matches: [] }

function pickup(over: Partial<PickupCardModel>): PickupCardModel {
  return { id: 'p', title: 'Rice', organizationName: 'Hope', status: '', statusValue: 'scheduled', tone: 'amber', scheduledAt: 'Oct 9', isAssignedToMe: false, hasVolunteerAssigned: false, ...over }
}

describe('getPriorityTask', () => {
  it('only ever points a role at a view in its own navigation', () => {
    const state = createDemoSeed(new Date())
    for (const role of DEMO_ROLES) {
      const view = selectDemoDashboard(state, role)!
      for (const data of [empty, { donations: view.donations, pickups: view.pickups, matches: view.matches }]) {
        expect(getDashboardNavViews(role)).toContain(getPriorityTask(role, data).view)
      }
    }
  })

  it('is calm when nothing is waiting on the user', () => {
    for (const role of DEMO_ROLES) expect(getPriorityTask(role, empty).urgency).toBe('calm')
  })

  it('asks logistics to accept open pickups before staffing their own', () => {
    const open = pickup({ id: 'open' })
    const mine = pickup({ id: 'mine', statusValue: 'driver_assigned', isAssignedToMe: true })
    expect(getPriorityTask('logistics', { ...empty, pickups: [mine, open] }).title).toBe('1 pickup needs a logistics partner')
    expect(getPriorityTask('logistics', { ...empty, pickups: [mine] }).title).toBe('1 pickup without a volunteer')
  })

  it('tells a volunteer to deliver before collecting', () => {
    const ready = pickup({ title: 'Bread', statusValue: 'driver_assigned', isAssignedToMe: true, hasVolunteerAssigned: true })
    const moving = pickup({ title: 'Rice', statusValue: 'in_transit', isAssignedToMe: true, hasVolunteerAssigned: true })
    expect(getPriorityTask('volunteer', { ...empty, pickups: [ready, moving] }).title).toBe('Deliver Rice')
    expect(getPriorityTask('volunteer', { ...empty, pickups: [ready] }).title).toBe('Collect Bread')
  })

  it('reflects the seeded demo: NGO has matches to review, volunteer has a pickup to collect', () => {
    const state = createDemoSeed(new Date())
    const ngo = selectDemoDashboard(state, 'ngo')!
    expect(getPriorityTask('ngo', ngo).urgency).toBe('action')
    expect(getPriorityTask('ngo', ngo).view).toBe('Matches')
    const volunteer = selectDemoDashboard(state, 'volunteer')!
    expect(getPriorityTask('volunteer', volunteer).title).toMatch(/^Collect /)
  })
})

import type { DashboardActions } from '@/lib/services/dashboard-actions'
import {
  demoAcceptPickup,
  demoAssignVolunteer,
  demoCreateDonation,
  demoCreateOrganization,
  demoCreateRequirement,
  demoDeleteDonation,
  demoDeleteRequirement,
  demoRespondToMatch,
  demoUpdatePickupStatus,
  demoUpdateRequirement,
  listDemoVolunteers,
  type DemoContext,
  type DemoOutcome,
} from '@/lib/demo/engine'
import type { DemoProfile, DemoState } from '@/lib/demo/types'

// The demo-mode boundary. Implements the dashboard's action interface purely
// against in-browser demo state: this module (and everything it imports) has
// no Supabase client and no Server Action import, so a demo control has no
// code path to the real backend. The acting persona comes from the role
// switcher and is only ever used to drive this simulation.

export type DemoStore = {
  getState: () => DemoState
  setState: (state: DemoState) => void
  getActor: () => DemoProfile
  context: () => DemoContext
}

export function createDemoDashboardActions(store: DemoStore): DashboardActions {
  function apply<T>(run: (state: DemoState, actor: DemoProfile, ctx: DemoContext) => DemoOutcome<T>) {
    const outcome = run(store.getState(), store.getActor(), store.context())
    if (outcome.result.success) store.setState(outcome.state)
    return Promise.resolve(outcome.result)
  }

  return {
    createDonation: (input) => apply((s, a, c) => demoCreateDonation(s, a, input, c)),
    deleteDonation: (input) => apply((s, a) => demoDeleteDonation(s, a, input)),
    createRequirement: (input) => apply((s, a, c) => demoCreateRequirement(s, a, input, c)),
    updateRequirement: (requirementId, input) => apply((s, a, c) => demoUpdateRequirement(s, a, requirementId, input, c)),
    deleteRequirement: (requirementId) => apply((s, a) => demoDeleteRequirement(s, a, requirementId)),
    createOrganization: () => apply((s) => demoCreateOrganization(s)),
    respondToMatch: (input) => apply((s, a, c) => demoRespondToMatch(s, a, input, c)),
    acceptPickup: (input) => apply((s, a, c) => demoAcceptPickup(s, a, input, c)),
    assignVolunteerToPickup: (input) => apply((s, a, c) => demoAssignVolunteer(s, a, input, c)),
    updatePickupStatus: (input) => apply((s, a, c) => demoUpdatePickupStatus(s, a, input, c)),
    listAvailableVolunteers: () => Promise.resolve(listDemoVolunteers(store.getState(), store.getActor())),
  }
}

import type { Database } from '@/lib/db/types'

// Pure mirror of the pickup lifecycle. RLS (pickups_update: admin or the
// assigned logistics_user_id) and protect_pickup_fields (logistics may only
// change status/actual_pickup_at/actual_delivery_at/estimated_duration_minutes/notes)
// remain the actual enforcement. This exists so Server Actions can reject an
// invalid transition with a clean error before hitting the database, and so
// the UI knows which next-status buttons are valid to show.

type PickupStatus = Database['public']['Tables']['pickups']['Row']['status']
type Profile = Database['public']['Tables']['profiles']['Row']
type PickupRow = Database['public']['Tables']['pickups']['Row']

const ALLOWED_TRANSITIONS: Record<PickupStatus, PickupStatus[]> = {
  scheduled: ['driver_assigned', 'cancelled'],
  driver_assigned: ['in_transit', 'cancelled', 'failed'],
  in_transit: ['completed', 'failed'],
  completed: [],
  cancelled: [],
  failed: [],
}

export function isValidPickupTransition(from: PickupStatus, to: PickupStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

// A volunteer executes the physical pickup/delivery once a logistics
// coordinator has already accepted it (status 'driver_assigned' or later)
// and assigned them to it — they never accept an unassigned pickup
// themselves (canAcceptPickup stays logistics/admin-only) and never touch
// the administrative end states (cancelled is a logistics/admin decision).
// This is a role-scoped restriction layered on top of the general
// transition graph above, mirroring pickups_update's WITH CHECK (which
// enforces the same target-status subset at the database layer as
// defense in depth) — the full from/to legality still comes from
// isValidPickupTransition().
const VOLUNTEER_ALLOWED_TARGET_STATUSES = new Set<PickupStatus>(['in_transit', 'completed', 'failed'])

export function isValidTransitionForRole(from: PickupStatus, to: PickupStatus, role: Profile['role']): boolean {
  if (!isValidPickupTransition(from, to)) return false
  if (role === 'volunteer') return VOLUNTEER_ALLOWED_TARGET_STATUSES.has(to)
  return true
}

export function canUpdatePickupStatus(pickup: PickupRow, profile: Profile): boolean {
  if (profile.role === 'admin') return true
  if (profile.role === 'logistics') return pickup.logistics_user_id === profile.id
  if (profile.role === 'volunteer') return pickup.volunteer_id === profile.id
  return false
}

export function canAcceptPickup(profile: Profile): boolean {
  return profile.role === 'logistics' || profile.role === 'admin'
}

// Pure mirror of assign_volunteer_to_pickup()'s role+ownership gate (see
// 20260906000001_add_volunteer_role_support.sql) — the RPC remains the
// actual authorization boundary; this exists only for a clean, fast
// client-side error before the round trip.
export function canAssignVolunteer(pickup: PickupRow, profile: Profile): boolean {
  if (profile.role === 'admin') return true
  return profile.role === 'logistics' && pickup.logistics_user_id === profile.id
}

type LogisticsEventType = Database['public']['Tables']['logistics_events']['Row']['event_type']

// logistics_event_type has no direct 'cancelled' label; 'exception' is the
// closest fit for both failure and cancellation, distinguished by the event's
// notes/metadata rather than a separate enum value.
const STATUS_TO_EVENT: Partial<Record<PickupStatus, LogisticsEventType>> = {
  driver_assigned: 'driver_assigned',
  in_transit: 'in_transit',
  completed: 'delivered',
  failed: 'exception',
  cancelled: 'exception',
}

export function getLogisticsEventType(status: PickupStatus): LogisticsEventType | null {
  return STATUS_TO_EVENT[status] ?? null
}

import type { UserRole } from '@/lib/db/types'
import { DEMO_STATE_VERSION, isDemoRole, type DemoState } from '@/lib/demo/types'

// sessionStorage persistence for demo mode, so a page refresh keeps the
// demonstration's progress. Only fictional sample data and the selected demo
// role are stored — never auth tokens, credentials or real user data. Every
// access is guarded: storage may be unavailable (private mode, disabled
// cookies, SSR) or hold corrupted/outdated data, in which case the caller
// falls back to a fresh seed.

export const DEMO_STATE_STORAGE_KEY = 'foodbridge:demo:state'
export const DEMO_ROLE_STORAGE_KEY = 'foodbridge:demo:role'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function getBrowserSessionStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

const COLLECTIONS = ['profiles', 'organizations', 'donations', 'requirements', 'matches', 'pickups', 'notifications'] as const

function isRecordArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string')
}

export function isDemoState(value: unknown): value is DemoState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return candidate.version === DEMO_STATE_VERSION && COLLECTIONS.every((key) => isRecordArray(candidate[key]))
}

export function loadDemoState(storage: StorageLike | null): DemoState | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(DEMO_STATE_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isDemoState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveDemoState(storage: StorageLike | null, state: DemoState): boolean {
  if (!storage) return false
  try {
    storage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function loadDemoRole(storage: StorageLike | null): UserRole | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(DEMO_ROLE_STORAGE_KEY)
    return isDemoRole(raw) ? raw : null
  } catch {
    return null
  }
}

export function saveDemoRole(storage: StorageLike | null, role: UserRole): void {
  if (!storage) return
  try {
    storage.setItem(DEMO_ROLE_STORAGE_KEY, role)
  } catch {
    // Persistence is best-effort; the in-memory demo keeps working.
  }
}

export function clearDemoSession(storage: StorageLike | null): void {
  if (!storage) return
  try {
    storage.removeItem(DEMO_STATE_STORAGE_KEY)
    storage.removeItem(DEMO_ROLE_STORAGE_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

import { describe, expect, it } from 'vitest'

import { createDemoSeed } from '@/lib/demo/seed'
import {
  DEMO_ROLE_STORAGE_KEY,
  DEMO_STATE_STORAGE_KEY,
  clearDemoSession,
  loadDemoRole,
  loadDemoState,
  saveDemoRole,
  saveDemoState,
  type StorageLike,
} from '@/lib/demo/storage'

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

const throwingStorage: StorageLike = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceededError') },
  removeItem: () => { throw new Error('SecurityError') },
}

describe('demo state persistence', () => {
  it('round-trips state so a refresh restores the demonstration', () => {
    const storage = memoryStorage()
    const state = createDemoSeed(new Date())
    expect(saveDemoState(storage, state)).toBe(true)
    expect(loadDemoState(storage)).toEqual(state)
  })

  it('returns null when nothing is stored or storage is unavailable', () => {
    expect(loadDemoState(memoryStorage())).toBeNull()
    expect(loadDemoState(null)).toBeNull()
    expect(saveDemoState(null, createDemoSeed())).toBe(false)
  })

  it('ignores corrupted, outdated or malformed data', () => {
    const storage = memoryStorage()
    storage.setItem(DEMO_STATE_STORAGE_KEY, '{not json')
    expect(loadDemoState(storage)).toBeNull()

    storage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify({ ...createDemoSeed(), version: 999 }))
    expect(loadDemoState(storage)).toBeNull()

    storage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify({ ...createDemoSeed(), pickups: 'nope' }))
    expect(loadDemoState(storage)).toBeNull()

    storage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify({ ...createDemoSeed(), donations: [null] }))
    expect(loadDemoState(storage)).toBeNull()
  })

  it('never throws when storage access throws', () => {
    expect(loadDemoState(throwingStorage)).toBeNull()
    expect(saveDemoState(throwingStorage, createDemoSeed())).toBe(false)
    expect(loadDemoRole(throwingStorage)).toBeNull()
    expect(() => saveDemoRole(throwingStorage, 'ngo')).not.toThrow()
    expect(() => clearDemoSession(throwingStorage)).not.toThrow()
  })

  it('persists only a valid demo role', () => {
    const storage = memoryStorage()
    saveDemoRole(storage, 'volunteer')
    expect(loadDemoRole(storage)).toBe('volunteer')
    storage.setItem(DEMO_ROLE_STORAGE_KEY, 'superuser')
    expect(loadDemoRole(storage)).toBeNull()
  })

  it('clears the demo session on exit', () => {
    const storage = memoryStorage()
    saveDemoState(storage, createDemoSeed())
    saveDemoRole(storage, 'admin')
    clearDemoSession(storage)
    expect(storage.data.size).toBe(0)
  })

  it('stores no credentials or tokens', () => {
    const storage = memoryStorage()
    saveDemoState(storage, createDemoSeed())
    const raw = storage.getItem(DEMO_STATE_STORAGE_KEY) ?? ''
    expect(raw).not.toMatch(/password|access_token|refresh_token|service_role|sb-/i)
  })
})

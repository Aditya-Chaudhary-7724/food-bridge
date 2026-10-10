import { afterEach, describe, expect, it, vi } from 'vitest'

import { isDemoModeEnabled, isDemoPath, parseDemoModeFlag } from '@/lib/demo/config'

describe('parseDemoModeFlag', () => {
  it('is disabled when unset or empty', () => {
    expect(parseDemoModeFlag(undefined)).toBe(false)
    expect(parseDemoModeFlag(null)).toBe(false)
    expect(parseDemoModeFlag('')).toBe(false)
  })

  it('is enabled only by the string "true" (case/whitespace-insensitive)', () => {
    expect(parseDemoModeFlag('true')).toBe(true)
    expect(parseDemoModeFlag(' TRUE ')).toBe(true)
  })

  it.each(['false', '1', 'yes', 'on', 'enabled', 'truee', 'true,false'])('treats %j as disabled', (value) => {
    expect(parseDemoModeFlag(value)).toBe(false)
  })
})

describe('isDemoModeEnabled', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is disabled by default', () => {
    vi.stubEnv('NEXT_PUBLIC_FOODBRIDGE_DEMO_MODE', undefined)
    expect(isDemoModeEnabled()).toBe(false)
  })

  it('is disabled when explicitly false', () => {
    vi.stubEnv('NEXT_PUBLIC_FOODBRIDGE_DEMO_MODE', 'false')
    expect(isDemoModeEnabled()).toBe(false)
  })

  it('is enabled when explicitly true', () => {
    vi.stubEnv('NEXT_PUBLIC_FOODBRIDGE_DEMO_MODE', 'true')
    expect(isDemoModeEnabled()).toBe(true)
  })
})

describe('isDemoPath', () => {
  it('matches only the demo route', () => {
    expect(isDemoPath('/demo')).toBe(true)
    expect(isDemoPath('/demo/anything')).toBe(true)
  })

  it('never matches protected or look-alike routes', () => {
    for (const path of ['/', '/dashboard', '/login', '/register', '/profile', '/settings', '/notifications', '/demonstration', '/dashboard/demo']) {
      expect(isDemoPath(path)).toBe(false)
    }
  })
})

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FlaskConical, Leaf, LogOut, RotateCcw } from 'lucide-react'

import FoodBridgeDashboard from '@/components/foodbridge-dashboard'
import type { UserRole } from '@/lib/db/types'
import { createDemoDashboardActions } from '@/lib/demo/actions'
import { demoMarkNotificationsRead } from '@/lib/demo/engine'
import { createDemoSeed, newDemoId } from '@/lib/demo/seed'
import { getDemoPersona, selectDemoDashboard } from '@/lib/demo/selectors'
import { clearDemoSession, getBrowserSessionStorage, loadDemoRole, loadDemoState, saveDemoRole, saveDemoState } from '@/lib/demo/storage'
import { DEMO_ROLE_LABELS, DEMO_ROLES, isDemoRole, type DemoState } from '@/lib/demo/types'

// Demo-mode shell around the real FoodBridgeDashboard. Holds the simulated
// state in the browser (persisted to sessionStorage), lets the visitor switch
// persona instantly, and hands the dashboard the demo action implementation —
// so every button in demo mode updates local state and never calls a Server
// Action or Supabase. No auth session is read or required here.

export default function DemoDashboard() {
  const router = useRouter()
  const [state, setState] = useState<DemoState | null>(null)
  const [role, setRole] = useState<UserRole>('donor')
  const stateRef = useRef<DemoState | null>(null)
  const roleRef = useRef<UserRole>('donor')

  const commit = useCallback((next: DemoState) => {
    stateRef.current = next
    setState(next)
    saveDemoState(getBrowserSessionStorage(), next)
  }, [])

  // Load after mount (not during render) so server and client markup match.
  useEffect(() => {
    const storage = getBrowserSessionStorage()
    commit(loadDemoState(storage) ?? createDemoSeed())
    const savedRole = loadDemoRole(storage)
    if (savedRole) {
      roleRef.current = savedRole
      setRole(savedRole)
    }
  }, [commit])

  const actions = useMemo(
    () =>
      createDemoDashboardActions({
        getState: () => stateRef.current as DemoState,
        setState: commit,
        getActor: () => {
          const actor = stateRef.current && getDemoPersona(stateRef.current, roleRef.current)
          if (!actor) throw new Error('Demo persona unavailable')
          return actor
        },
        context: () => ({ now: new Date(), newId: newDemoId }),
      }),
    [commit],
  )

  function switchRole(next: UserRole) {
    roleRef.current = next
    setRole(next)
    saveDemoRole(getBrowserSessionStorage(), next)
  }

  function resetDemo() {
    commit(createDemoSeed())
  }

  function exitDemo() {
    clearDemoSession(getBrowserSessionStorage())
    router.push('/login')
  }

  const view = state ? selectDemoDashboard(state, role) : null

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div role="status" className="flex items-center gap-3 text-sm font-medium text-stone-700">
          <div className="flex h-9 w-9 animate-pulse items-center justify-center rounded-lg bg-forest-700 text-paper"><Leaf className="h-4 w-4" /></div>
          Loading demo workspace…
        </div>
      </div>
    )
  }

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6">
        <div className="max-w-sm rounded-xl border border-stone-200 bg-white p-6 text-center">
          <p className="font-display text-lg font-medium text-ink">The saved demo data couldn&apos;t be loaded.</p>
          <p className="mt-1 text-sm text-stone-600">Resetting starts a fresh simulated workspace.</p>
          <button onClick={resetDemo} className="mt-4 rounded-lg bg-forest-700 px-4 py-2.5 text-sm font-semibold text-paper hover:bg-forest-800">Reset demo</button>
        </div>
      </div>
    )
  }

  // Rendered by the dashboard as a strip above its header.
  const controls = (
    <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-8">
      <p className="flex min-w-0 items-center gap-2 text-sm">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-tomato-500 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white"><FlaskConical className="h-3 w-3" aria-hidden />Demo</span>
        <span className="hidden text-forest-100 md:inline">Simulated data, kept only in this browser tab.</span>
      </p>
      <div className="ml-auto flex items-center gap-1.5">
        <label htmlFor="demo-role" className="sr-only text-sm text-forest-100 sm:not-sr-only">Viewing as</label>
        <select
          id="demo-role"
          value={role}
          onChange={(event) => isDemoRole(event.target.value) && switchRole(event.target.value)}
          className="min-h-9 max-w-[11rem] rounded-lg border border-forest-600 bg-forest-800 px-2.5 text-sm font-semibold text-paper outline-none transition hover:border-forest-400 focus:border-forest-300 [color-scheme:dark] sm:max-w-none"
        >
          {DEMO_ROLES.map((r) => <option key={r} value={r}>{DEMO_ROLE_LABELS[r]}</option>)}
        </select>
        <span className="hidden text-sm text-forest-100 lg:inline">· {view.persona.full_name}</span>
        <button onClick={resetDemo} title="Reset demo data" aria-label="Reset demo data" className="ml-1 rounded-lg p-2.5 text-forest-100 transition hover:bg-forest-800 hover:text-paper active:scale-95"><RotateCcw className="h-4 w-4" /></button>
        <button onClick={exitDemo} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-forest-100 transition hover:bg-forest-800 hover:text-paper active:scale-95" aria-label="Exit demo">
          <LogOut className="h-4 w-4" /><span className="hidden md:inline">Exit demo</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      <FoodBridgeDashboard
        key={role}
        role={role}
        displayName={view.persona.full_name}
        hasOrganization={view.hasOrganization}
        showOrganizationOnboarding={false}
        donations={view.donations}
        pickups={view.pickups}
        requirements={view.requirements}
        matches={view.matches}
        donorStats={view.donorStats}
        ngoStats={view.ngoStats}
        logisticsStats={view.logisticsStats}
        directory={view.directory}
        actions={actions}
        demo={{
          controls,
          notifications: view.notifications,
          onMarkAllNotificationsRead: () => {
            const current = stateRef.current
            const actor = current && getDemoPersona(current, roleRef.current)
            if (current && actor) commit(demoMarkNotificationsRead(current, actor))
          },
        }}
      />
    </>
  )
}

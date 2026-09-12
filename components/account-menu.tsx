'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Bell, ChevronDown, LogOut, Settings, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'
import { getUserDisplayName, getUserInitials } from '@/lib/user'

function MenuItem({
  href,
  onClick,
  icon: Icon,
  label,
  destructive = false,
}: {
  href?: string
  onClick?: () => void
  icon: typeof UserRound
  label: string
  destructive?: boolean
}) {
  const classes = destructive
    ? 'text-rose-600 hover:bg-rose-50 focus-visible:bg-rose-50'
    : 'text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50'

  const content = (
    <>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        role="menuitem"
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${classes}`}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${classes}`}
    >
      {content}
    </button>
  )
}

export default function AccountMenu() {
  const router = useRouter()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let isMounted = true

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!isMounted) return
      setUser(user)
      setIsLoading(false)
    }

    loadUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const displayName = getUserDisplayName(user)
  const initials = getUserInitials(displayName, user?.email)

  const handleSignOut = async () => {
    if (isSigningOut) return

    setIsSigningOut(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      setError('Unable to sign out right now. Please try again.')
      setIsSigningOut(false)
      return
    }

    setIsOpen(false)
    router.replace('/login')
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="account-menu"
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white ring-2 ring-white">
          {isLoading ? '...' : initials}
        </div>
        <div className="hidden min-w-0 sm:block">
          <div className="truncate text-sm font-semibold text-slate-800">
            {isLoading ? 'Loading...' : displayName}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {user?.email ?? 'Account'}
          </div>
        </div>
        <ChevronDown
          className={`hidden h-4 w-4 text-slate-400 transition sm:block ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="account-menu"
            role="menu"
            aria-label="Account menu"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                <p className="truncate text-xs text-slate-500">{user?.email ?? 'Account'} </p>
              </div>
            </div>

            <div className="mt-2 space-y-1">
              <MenuItem href="/profile" icon={UserRound} label="My Profile" onClick={() => setIsOpen(false)} />
              <MenuItem href="/settings" icon={Settings} label="Settings" onClick={() => setIsOpen(false)} />
              <MenuItem href="/notifications" icon={Bell} label="Notifications" onClick={() => setIsOpen(false)} />
            </div>

            <div className="my-2 h-px bg-slate-100" />

            <div className="px-1 pb-1">
              {error && (
                <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="button"
                aria-label="Log out"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                <span>{isSigningOut ? 'Logging out...' : 'Log out'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

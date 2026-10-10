"use client"

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'
import { getLoginAuthError } from '@/lib/services/auth-error-mapping'
import { isDemoModeEnabled } from '@/lib/demo/config'
import AuthShell, { authInputClass, authLabelClass, authPrimaryButtonClass } from '@/components/auth-shell'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function redirectIfUserExists() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!isMounted) return
      if (user) {
        router.replace('/dashboard')
      }
    }

    redirectIfUserExists()

    return () => {
      isMounted = false
    }
  }, [router])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(getLoginAuthError(error))
      setLoading(false)
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your FoodBridge workspace.">
        <form onSubmit={handleLogin} className="space-y-5" noValidate>
          <div>
            <label htmlFor="email" className={authLabelClass}>
              Email
            </label>

            <input
              id="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className={authInputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className={authLabelClass}>
              Password
            </label>

            <input
              id="password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className={authInputClass}
            />
          </div>

          {error && (
            <div aria-live="polite" role="alert" className="rounded-lg border border-tomato-200 bg-tomato-50 p-3 text-sm text-tomato-800">
              {error}
            </div>
          )}

          <button disabled={loading} type="submit" className={authPrimaryButtonClass}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-stone-700">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-semibold text-forest-700 underline-offset-4 hover:text-forest-900 hover:underline">
            Create one
          </Link>
        </p>

        {isDemoModeEnabled() && (
          <div className="mt-8 border-t border-stone-200 pt-6">
            <p className="text-sm font-medium text-ink">Just looking around?</p>
            <Link
              href="/demo"
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-stone-300 bg-white px-4 font-semibold text-forest-800 transition hover:border-forest-400 hover:bg-sage-50 active:scale-[.99]"
            >
              Explore demo
            </Link>
            <p className="mt-2 text-xs text-stone-600">No sign-in needed — sample data only, nothing is saved.</p>
          </div>
        )}
    </AuthShell>
  )
}

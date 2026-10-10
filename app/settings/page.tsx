import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Mail,
  Shield,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'

import { getAuthContext } from '@/lib/auth/session'

export default async function SettingsPage() {
  const context = await getAuthContext()

  if (!context) {
    redirect('/login')
  }

  const { user, profile } = context
  const displayName = profile.full_name

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-300 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="mb-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-forest-700">
                Settings
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                Account preferences
              </h1>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-forest-50 px-3 py-1.5 text-xs font-semibold text-forest-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Secure session
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">Account</h2>
                <p className="text-sm text-stone-600">Profile and contact details</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-medium text-stone-800">
                Name
                <input
                  readOnly
                  value={displayName}
                  className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-ink outline-none"
                />
              </label>

              <label className="block text-sm font-medium text-stone-800">
                Email
                <input
                  readOnly
                  value={user.email ?? ''}
                  className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-ink outline-none"
                />
              </label>
            </div>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Full profile editing is coming soon. You can update this information from your Supabase auth settings.
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">Security</h2>
                <p className="text-sm text-stone-600">Passwords and session safety</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                disabled
                className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-left text-sm font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Change password
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Coming soon
                </span>
              </button>

              <button
                type="button"
                disabled
                className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-left text-sm font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email and security information
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Coming soon
                </span>
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">Preferences</h2>
                <p className="text-sm text-stone-600">Notifications and experience settings</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                disabled
                className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-left text-sm font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Notification preferences
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Coming soon
                </span>
              </button>

              <button
                type="button"
                disabled
                className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-left text-sm font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  UI preferences
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Coming soon
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

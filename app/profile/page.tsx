import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CalendarDays, Mail, Shield, UserRound } from 'lucide-react'

import { getAuthContext } from '@/lib/auth/session'
import { getRoleLabel, getUserCreatedDate, getUserInitials } from '@/lib/user'

export default async function ProfilePage() {
  const context = await getAuthContext()

  if (!context) {
    redirect('/login')
  }

  const { user, profile } = context
  const displayName = profile.full_name
  const initials = getUserInitials(displayName, profile.email)
  const role = getRoleLabel(profile.role)
  const createdAt = getUserCreatedDate({ created_at: profile.created_at })

  return (
    <main className="min-h-screen bg-[#f5f8f7] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-700 text-xl font-bold text-white shadow-sm">
                {initials}
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Account
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                  {displayName}
                </h1>
                <p className="mt-1 text-sm text-slate-500">{role}</p>
              </div>
            </div>

            <Link
              href="/settings"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Edit profile
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-emerald-700">
                <UserRound className="h-5 w-5" />
                <p className="text-sm font-semibold">Display name</p>
              </div>
              <p className="mt-3 text-base font-semibold text-slate-900">{displayName}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-emerald-700">
                <Mail className="h-5 w-5" />
                <p className="text-sm font-semibold">Email</p>
              </div>
              <p className="mt-3 truncate text-base font-medium text-slate-900">{user.email ?? 'No email available'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-emerald-700">
                <Shield className="h-5 w-5" />
                <p className="text-sm font-semibold">Role</p>
              </div>
              <p className="mt-3 text-base font-medium text-slate-900">{role}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-emerald-700">
                <CalendarDays className="h-5 w-5" />
                <p className="text-sm font-semibold">Joined</p>
              </div>
              <p className="mt-3 text-base font-medium text-slate-900">
                {createdAt ?? 'Date unavailable'}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Account information
            </p>
            <dl className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="flex justify-between gap-4 border-b border-slate-200 pb-2">
                <dt className="text-slate-500">Email status</dt>
                <dd className="font-medium text-slate-900">
                  {user.email_confirmed_at ? 'Confirmed' : 'Pending confirmation'}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-200 pb-2">
                <dt className="text-slate-500">User ID</dt>
                <dd className="max-w-[14rem] truncate font-medium text-slate-900">{user.id}</dd>
              </div>
              <div className="flex justify-between gap-4 pb-2">
                <dt className="text-slate-500">Provider</dt>
                <dd className="font-medium text-slate-900">{user.app_metadata?.provider ?? 'Email'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </main>
  )
}

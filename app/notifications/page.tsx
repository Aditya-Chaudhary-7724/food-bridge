import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { getAuthContext } from '@/lib/auth/session'
import { listMyNotifications } from '@/lib/actions/notifications'
import NotificationsList from '@/components/notifications-list'

export default async function NotificationsPage() {
  const context = await getAuthContext()

  if (!context) {
    redirect('/login')
  }

  const result = await listMyNotifications()

  return (
    <main className="min-h-screen bg-[#f5f8f7] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <NotificationsList notifications={result.success ? result.data : []} loadError={result.success ? null : result.error} />
      </div>
    </main>
  )
}

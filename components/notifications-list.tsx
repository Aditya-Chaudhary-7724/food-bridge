'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Bell, CheckCircle2 } from 'lucide-react'

import { markAllNotificationsAsRead, type NotificationRow } from '@/lib/actions/notifications'

function formatNotificationDate(isoDate: string) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default function NotificationsList({
  notifications,
  loadError,
}: {
  notifications: NotificationRow[]
  loadError: string | null
}) {
  const [items, setItems] = useState(notifications)
  const [isPending, startTransition] = useTransition()
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const unreadCount = items.filter((item) => !item.read).length

  function handleMarkAllRead() {
    setActionMessage(null)
    startTransition(async () => {
      const result = await markAllNotificationsAsRead()
      if (!result.success) {
        setActionMessage(result.error)
        return
      }
      setItems((prev) => prev.map((item) => ({ ...item, read: true })))
    })
  }

  if (loadError) {
    return (
      <div className="rounded-3xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
        <AlertCircle className="mb-2 h-5 w-5" />
        We couldn&apos;t load your notifications right now. Please refresh the page.
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Notifications</h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={isPending}
            className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Marking...' : 'Mark all read'}
          </button>
        )}
      </div>

      {actionMessage && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{actionMessage}</p>}

      {items.length === 0 ? (
        <div className="py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <Bell className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-slate-950">No new notifications</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Your inbox is empty right now. When important updates arrive, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className={`rounded-xl p-4 ${item.read ? 'bg-slate-50' : 'bg-emerald-50/60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.message}</p>
                </div>
                {item.read && <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-300" />}
              </div>
              <p className="mt-2 text-xs text-slate-400">{formatNotificationDate(item.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

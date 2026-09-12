'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/db/types'
import { actionError, actionOk, type ActionResult } from '@/lib/actions/shared'

export type NotificationRow = Database['public']['Tables']['notifications']['Row']

export async function listMyNotifications(): Promise<ActionResult<NotificationRow[]>> {
  const context = await getAuthContext()
  if (!context) return actionError('listMyNotifications', new Error('Not authenticated'))

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return actionError('listMyNotifications', error)
  return actionOk(data ?? [])
}

/**
 * Marks the caller's own unread notifications as read. RLS scopes the
 * UPDATE to user_id = auth.uid(), and trg_protect_notification_fields
 * silently reverts every column except `read` for non-admins, so this
 * cannot be used to alter notification content.
 */
export async function markAllNotificationsAsRead(): Promise<ActionResult<null>> {
  const context = await getAuthContext()
  if (!context) return actionError('markAllNotificationsAsRead', new Error('Not authenticated'))

  const supabase = await createClient()
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', context.user.id).eq('read', false)

  if (error) return actionError('markAllNotificationsAsRead', error)

  revalidatePath('/notifications')
  return actionOk(null)
}

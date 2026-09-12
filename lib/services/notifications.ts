import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/db/types'

type NotificationType = Database['public']['Tables']['notifications']['Row']['type']

// notifications_insert is admin-only by RLS design (see
// 20260825000003_rls_authorization.sql) — there is no policy letting a
// regular user (e.g. the NGO claiming a donation) insert a notification for
// someone else, by design. This is the one legitimate use of the service-role
// client in the current foundation: a trusted server-side event writing a
// notification on another user's behalf after an action it already
// authorized (e.g. claimDonation).
//
// A notification failure must never roll back the action that triggered it
// (the claim already committed) — errors are logged, not thrown.
export async function createNotification(input: {
  userId: string
  title: string
  message: string
  type: NotificationType
  referenceId?: string
  referenceType?: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('notifications').insert({
      user_id: input.userId,
      title: input.title,
      message: input.message,
      type: input.type,
      reference_id: input.referenceId ?? null,
      reference_type: input.referenceType ?? null,
    })

    if (error) {
      console.error('[notifications] failed to create notification:', error)
    }
  } catch (error) {
    console.error('[notifications] admin client unavailable:', error)
  }
}

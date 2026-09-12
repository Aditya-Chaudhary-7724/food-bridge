import type { User } from '@supabase/supabase-js'

import type { UserRole } from '@/lib/db/types'

const ROLE_LABEL: Record<UserRole, string> = {
  donor: 'Food donor',
  ngo: 'NGO / Organization',
  volunteer: 'Volunteer',
  logistics: 'Logistics partner',
  admin: 'Administrator',
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABEL[role]
}

function toNameValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function getUserDisplayName(user: Pick<User, 'email' | 'user_metadata'> | null | undefined) {
  if (!user) return 'FoodBridge user'

  const metadata = user.user_metadata ?? {}

  const fullName =
    toNameValue(metadata.full_name) ??
    toNameValue(metadata.name) ??
    (
      [
        toNameValue(metadata.first_name),
        toNameValue(metadata.last_name),
      ]
        .filter(Boolean)
        .join(' ') || null
    )

  if (fullName) return fullName

  if (user.email) {
    const localPart = user.email.split('@')[0]?.replace(/[._-]+/g, ' ').trim()
    if (localPart) return localPart
  }

  return 'FoodBridge user'
}

export function getUserInitials(name: string | null | undefined, email?: string | null) {
  const source = name?.trim() || email || 'FB'
  const chunks = source.split(/\s+/).filter(Boolean).slice(0, 2)

  if (chunks.length === 0) return 'FB'

  const initials = chunks
    .map((chunk) => chunk.charAt(0)?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)

  return initials || 'FB'
}

export function getUserRole(user: Pick<User, 'user_metadata'> | null | undefined) {
  if (!user) return 'Food donor'

  const metadata = user.user_metadata ?? {}
  const role = toNameValue(metadata.role)

  if (role) return role

  const accountType = toNameValue(metadata.account_type)
  if (accountType) return accountType

  return 'Food donor'
}

export function getUserCreatedDate(user: Pick<User, 'created_at'> | null | undefined) {
  if (!user?.created_at) return null

  const date = new Date(user.created_at)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

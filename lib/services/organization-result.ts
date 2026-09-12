import type { Json } from '@/lib/db/types'

// public.create_organization_and_link_profile() returns jsonb — narrow it
// defensively at runtime rather than asserting its shape, same rationale
// as lib/services/claim-result.ts and assign-result.ts.

export type CreateOrganizationResult = { success: true; organizationId: string } | { success: false; error: string; message: string }

export function parseCreateOrganizationResult(value: Json): CreateOrganizationResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, Json | undefined>

  if (typeof record.success !== 'boolean') return null

  if (record.success) {
    if (typeof record.organization_id !== 'string') return null
    return { success: true, organizationId: record.organization_id }
  }

  return {
    success: false,
    error: typeof record.error === 'string' ? record.error : 'unknown_error',
    message: typeof record.message === 'string' ? record.message : 'Unable to set up your organization.',
  }
}

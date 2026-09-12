import { z } from 'zod/v4'

// Only the fields lib/db/types.ts models for organizations (the current,
// non-legacy column set — see that file's comment history) are exposed
// here. `type` is deliberately not a field: createOrganization() always
// sets it to 'ngo' server-side, since this schema backs NGO self-service
// onboarding only.
export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(200),
  description: z.string().max(1000).optional(),
  address: z.string().min(5, 'Address is required').max(500),
  contact_email: z.email('Enter a valid contact email').optional(),
  contact_phone: z.string().max(30).optional(),
  daily_capacity_kg: z.number().min(0, 'Capacity cannot be negative').max(999999).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

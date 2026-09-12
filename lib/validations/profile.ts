import { z } from 'zod/v4'

export const updateProfileSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(200).optional(),
  phone: z.string().max(30).optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

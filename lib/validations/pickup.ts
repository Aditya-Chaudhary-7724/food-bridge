import { z } from 'zod/v4'

export const acceptPickupSchema = z.object({
  pickupId: z.uuid('A valid pickup is required'),
})

export type AcceptPickupInput = z.infer<typeof acceptPickupSchema>

export const PICKUP_STATUSES = ['scheduled', 'driver_assigned', 'in_transit', 'completed', 'cancelled', 'failed'] as const

export const updatePickupStatusSchema = z.object({
  pickupId: z.uuid('A valid pickup is required'),
  status: z.enum(PICKUP_STATUSES),
  notes: z.string().max(500).optional(),
})

export type UpdatePickupStatusInput = z.infer<typeof updatePickupStatusSchema>

export const assignVolunteerSchema = z.object({
  pickupId: z.uuid('A valid pickup is required'),
  volunteerId: z.uuid('A valid volunteer is required'),
})

export type AssignVolunteerInput = z.infer<typeof assignVolunteerSchema>

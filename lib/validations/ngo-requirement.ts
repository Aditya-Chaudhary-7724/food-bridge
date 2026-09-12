import { z } from 'zod/v4'

export const URGENCY_LEVELS = ['low', 'medium', 'high', 'critical'] as const

export const ngoRequirementSchema = z
  .object({
    food_categories: z.array(z.string().min(1).max(100)).default([]),
    daily_capacity_kg: z.number().min(0, 'Capacity cannot be negative').max(999999),
    urgency_level: z.enum(URGENCY_LEVELS).default('medium'),
    dietary_requirements: z.array(z.string().min(1).max(100)).default([]),
    preferred_quantity_min: z.number().min(0).default(0),
    preferred_quantity_max: z.number().min(0).optional(),
    is_active: z.boolean().default(true),
  })
  .refine((data) => data.preferred_quantity_max === undefined || data.preferred_quantity_max >= data.preferred_quantity_min, {
    message: 'Maximum quantity must be greater than or equal to minimum quantity',
    path: ['preferred_quantity_max'],
  })

export type NgoRequirementInput = z.infer<typeof ngoRequirementSchema>

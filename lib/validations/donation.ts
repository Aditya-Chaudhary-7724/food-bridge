import { z } from 'zod/v4'

// ── Donation Item Schema ──────────────────────────────────────────────────────

export const donationItemSchema = z.object({
  name: z.string().min(1, 'Item name is required').max(200),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().min(1).max(20).default('kg'),
  food_category: z.string().max(100).optional(),
  dietary_flags: z.array(z.string()).default([]),
  storage_requirement: z.enum(['ambient', 'refrigerated', 'frozen']).default('ambient'),
  notes: z.string().max(500).optional(),
  expiration_date: z.iso.datetime().optional(),
})

export type DonationItemInput = z.infer<typeof donationItemSchema>

// ── Create Donation Schema ────────────────────────────────────────────────────
// Base shape is kept separate from createDonationSchema's .refine() below so
// updateDonationSchema can still derive via .omit()/.partial() — those
// methods aren't available on a ZodEffects (refined) schema.

const donationBaseSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().max(1000).optional(),
  food_category: z.string().min(1, 'Food category is required').max(100),
  quantity: z.number().positive('Quantity must be positive').max(99999),
  unit: z.string().min(1).max(20).default('kg'),
  expires_at: z.iso.datetime({ message: 'Valid expiry date is required' }),
  pickup_address: z.string().min(5, 'Pickup address is required').max(500),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  items: z.array(donationItemSchema).optional(),
})

export const EXPIRY_FUTURE_MESSAGE = 'Expiry must be a future date and time.'

export const createDonationSchema = donationBaseSchema.refine((data) => new Date(data.expires_at).getTime() > Date.now(), {
  message: EXPIRY_FUTURE_MESSAGE,
  path: ['expires_at'],
})

export type CreateDonationInput = z.infer<typeof createDonationSchema>

// ── Update Donation Schema ────────────────────────────────────────────────────
// Same editable fields as create, all optional. Ownership/status authorization
// happens in lib/services/donation-authorization.ts and is enforced again by
// RLS — this schema only validates shape.

export const updateDonationSchema = donationBaseSchema.omit({ items: true }).partial()

export type UpdateDonationInput = z.infer<typeof updateDonationSchema>

// ── Claim Donation Schema ─────────────────────────────────────────────────────

export const claimDonationSchema = z.object({
  donationId: z.uuid('A valid donation is required'),
  organizationId: z.uuid('A valid organization is required'),
})

export type ClaimDonationInput = z.infer<typeof claimDonationSchema>

// ── Delete Donation Schema ────────────────────────────────────────────────────

export const deleteDonationSchema = z.object({
  donationId: z.uuid('A valid donation is required'),
})

export type DeleteDonationInput = z.infer<typeof deleteDonationSchema>

// ── Filter Schema ─────────────────────────────────────────────────────────────

export const donationFilterSchema = z.object({
  food_category: z.string().optional(),
  min_quantity: z.number().positive().optional(),
  max_quantity: z.number().positive().optional(),
  status: z.string().optional(),
})

export type DonationFilterInput = z.infer<typeof donationFilterSchema>

// ── Food Categories ───────────────────────────────────────────────────────────

export const FOOD_CATEGORIES = [
  'Fruits & Vegetables',
  'Dairy Products',
  'Bakery & Bread',
  'Grains & Cereals',
  'Canned Goods',
  'Prepared Meals',
  'Beverages',
  'Frozen Foods',
  'Meat & Poultry',
  'Snacks & Packaged',
  'Other',
] as const

export const STORAGE_OPTIONS = [
  { value: 'ambient', label: 'Room Temperature' },
  { value: 'refrigerated', label: 'Refrigerated' },
  { value: 'frozen', label: 'Frozen' },
] as const

export const UNIT_OPTIONS = ['kg', 'lbs', 'pieces', 'servings', 'boxes', 'bags', 'liters'] as const

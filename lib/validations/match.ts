import { z } from 'zod/v4'

export const respondToMatchSchema = z.object({
  matchId: z.uuid('A valid match is required'),
  decision: z.enum(['accepted', 'rejected']),
})

export type RespondToMatchInput = z.infer<typeof respondToMatchSchema>

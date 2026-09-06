import { z } from 'zod'

export const aiStatusSchema = z.object({ enabled: z.boolean() })

export const proposedActionSchema = z.object({
  type: z.enum(['check_in', 'checkout']),
  reservation_id: z.number().int(),
  guest_name: z.string(),
})

export const copilotReplySchema = z.object({
  reply: z.string(),
  proposed_action: proposedActionSchema.nullable(),
})

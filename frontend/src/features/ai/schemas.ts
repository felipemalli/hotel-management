import { z } from 'zod'

export const aiStatusSchema = z.object({ enabled: z.boolean() })

export const parsedGuestSchema = z.object({
  full_name: z.string(),
  document: z.string(),
  phone: z.string(),
})

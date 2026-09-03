import type { z } from 'zod'

import type { aiStatusSchema, parsedGuestSchema } from './schemas'

export type AiStatus = z.infer<typeof aiStatusSchema>

export type ParsedGuestFields = z.infer<typeof parsedGuestSchema>

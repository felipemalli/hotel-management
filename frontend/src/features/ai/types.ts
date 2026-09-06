import type { z } from 'zod'

import type { aiStatusSchema, copilotReplySchema, proposedActionSchema } from './schemas'

export type AiStatus = z.infer<typeof aiStatusSchema>

export type ProposedAction = z.infer<typeof proposedActionSchema>

export type CopilotReply = z.infer<typeof copilotReplySchema>

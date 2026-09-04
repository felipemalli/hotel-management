import type { z } from 'zod'

import type { roomSchema, roomSummarySchema } from './schemas'

export type RoomSummary = z.infer<typeof roomSummarySchema>

export type Room = z.infer<typeof roomSchema>

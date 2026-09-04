import type { z } from 'zod'

import type { roomSchema, roomSummarySchema } from './schemas'

export type RoomSummary = z.infer<typeof roomSummarySchema>

export type Room = z.infer<typeof roomSchema>

export interface RoomListParams {
  includeInactive?: boolean
  page?: number
}

// people = titular + acompanhantes; o servidor filtra capacidade com ele.
export interface AvailabilityQuery {
  checkin_date: string
  checkout_date: string
  people: number
}

export interface CreateRoomPayload {
  number: string
  capacity: number
}

export interface UpdateRoomPatch {
  capacity?: number
  is_active?: boolean
}

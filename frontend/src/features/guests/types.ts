import type { z } from 'zod'

import type {
  guestInHotelSchema,
  guestPendingCheckinSchema,
  guestSchema,
  reservationSummarySchema,
} from './schemas'

export type Guest = z.infer<typeof guestSchema>

export type GuestRef = Pick<Guest, 'id' | 'full_name'>

export type ReservationSummary = z.infer<typeof reservationSummarySchema>

export type GuestInHotel = z.infer<typeof guestInHotelSchema>

export type GuestPendingCheckin = z.infer<typeof guestPendingCheckinSchema>

export interface CreateGuestPayload {
  full_name: string
  document: string
  phone: string
  nationality: string
}

import type { z } from 'zod'

import type {
  billLineSchema,
  checkoutStatementSchema,
  lateFeeSchema,
  reservationSchema,
  reservationStatusSchema,
} from './schemas'

export type ReservationStatus = z.infer<typeof reservationStatusSchema>

export type Reservation = z.infer<typeof reservationSchema>

export type BillLine = z.infer<typeof billLineSchema>

export type LateFee = z.infer<typeof lateFeeSchema>

export type CheckoutStatement = z.infer<typeof checkoutStatementSchema>

export interface CreateReservationPayload {
  guest_id: number
  checkin_date: string
  checkout_date: string
  has_vehicle: boolean
}

export interface CheckInPayload {
  id: number
  allow_early: boolean
}

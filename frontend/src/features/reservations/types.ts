import type { z } from 'zod'

import type { userRefSchema } from '@/lib/api/schemas'

import type {
  accountSchema,
  accountStatusSchema,
  billLineSchema,
  checkoutStatementSchema,
  guestRefSchema,
  lateFeeSchema,
  paymentMethodSchema,
  paymentSchema,
  reservationOrderingSchema,
  reservationSchema,
  reservationStatusSchema,
} from './schemas'

export type ReservationStatus = z.infer<typeof reservationStatusSchema>

export type ReservationOrdering = z.infer<typeof reservationOrderingSchema>

export type ReservationSortField = 'checkin_date' | 'checkout_date'

export type Reservation = z.infer<typeof reservationSchema>

export type Account = z.infer<typeof accountSchema>

export type AccountStatus = z.infer<typeof accountStatusSchema>

export type PaymentMethod = z.infer<typeof paymentMethodSchema>

export type GuestRef = z.infer<typeof guestRefSchema>

export type UserRef = z.infer<typeof userRefSchema>

export type BillLine = z.infer<typeof billLineSchema>

export type LateFee = z.infer<typeof lateFeeSchema>

export type CheckoutStatement = z.infer<typeof checkoutStatementSchema>

export type Payment = z.infer<typeof paymentSchema>

export interface PayReservationPayload {
  id: number
  payment_method: PaymentMethod
}

export interface CreateReservationPayload {
  guest_id: number
  room_id: number
  companion_ids: number[]
  checkin_date: string
  checkout_date: string
  has_vehicle: boolean
}

export interface ReservationFormValues extends Omit<CreateReservationPayload, 'room_id'> {
  room_id: number | null
}

export interface CheckInPayload {
  id: number
  allow_early: boolean
}

// page some na primeira: a URL não carrega o padrão.
export interface ReservationListParams {
  status?: ReservationStatus
  paid?: boolean
  search?: string
  checkin_date?: string
  checkout_date?: string
  ordering?: ReservationOrdering
  page?: number
}

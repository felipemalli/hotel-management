import type { z } from 'zod'

import type {
  billLineSchema,
  checkoutStatementSchema,
  guestRefSchema,
  lateFeeSchema,
  paymentMethodSchema,
  paymentSchema,
  reservationSchema,
  reservationStatusSchema,
} from './schemas'

export type ReservationStatus = z.infer<typeof reservationStatusSchema>

export type Reservation = z.infer<typeof reservationSchema>

export type PaymentMethod = z.infer<typeof paymentMethodSchema>

export type GuestRef = z.infer<typeof guestRefSchema>

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

// O que está nos campos enquanto o atendente preenche: só o quarto difere do
// payload, porque começa vazio.
export interface ReservationFormValues extends Omit<CreateReservationPayload, 'room_id'> {
  room_id: number | null
}

export interface CheckInPayload {
  id: number
  allow_early: boolean
}

// Filtros aceitos pelo servidor. `page` some quando é a primeira: a URL do
// atendente não carrega o padrão.
export interface ReservationListParams {
  status?: ReservationStatus
  paid?: boolean
  page?: number
}

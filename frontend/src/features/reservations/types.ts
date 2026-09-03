/**
 * Tipos do contrato de reservas (SPEC 4.4).
 *
 * Todo campo monetario e `string` — nunca `number`. Isso nao e estilo: e o
 * invariante da SPEC 0.3 tipado. Um `number` aqui convidaria a soma no
 * cliente e a perda de precisao que o `Decimal` do backend existe para evitar.
 */

export const RESERVATION_STATUSES = ['PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'] as const

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

export interface Reservation {
  id: number
  guest_id: number
  checkin_date: string
  checkout_date: string
  has_vehicle: boolean
  status: ReservationStatus
  checked_in_at: string | null
  checked_out_at: string | null
  /** Congelados no checkout (SPEC 1.3); `null` antes dele. */
  total_daily: string | null
  total_parking: string | null
  late_fee: string | null
  total_amount: string | null
  created_at: string
}

export interface CreateReservationPayload {
  guest_id: number
  checkin_date: string
  checkout_date: string
  has_vehicle: boolean
}

/** Uma diaria do extrato (SPEC 4.4): a data cobrada, sua tarifa e a vaga. */
export interface BillLine {
  date: string
  weekday: string
  daily_rate: string
  parking_fee: string
}

/** `base_rate` e `null` quando nao houve multa (D3). */
export interface LateFee {
  applied: boolean
  base_rate: string | null
  amount: string
}

export interface CheckoutStatement {
  reservation_id: number
  guest: { id: number; full_name: string }
  checked_in_at: string
  checked_out_at: string
  lines: BillLine[]
  subtotal_daily: string
  subtotal_parking: string
  late_fee: LateFee
  total: string
}

export interface CheckInPayload {
  id: number
  /** D4: reenvio com `true` confirma o check-in antes das 14h. */
  allow_early: boolean
}

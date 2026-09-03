export const RESERVATION_STATUSES = ['PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'] as const

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

// Todo campo monetário é string decimal ("120.00"), nunca `number`: o valor
// atravessa o frontend sem passar por ponto flutuante.
export interface Reservation {
  id: number
  guest_id: number
  checkin_date: string
  checkout_date: string
  has_vehicle: boolean
  status: ReservationStatus
  checked_in_at: string | null
  checked_out_at: string | null
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

export interface BillLine {
  date: string
  weekday: string
  daily_rate: string
  parking_fee: string
}

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
  allow_early: boolean
}

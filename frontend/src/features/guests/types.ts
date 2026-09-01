/**
 * Tipos do contrato de hospedes (SPEC 4.3).
 *
 * `document` e `phone` chegam **mascarados** nas listagens e completos no
 * detalhe (SPEC 2.2). O mascaramento e do backend; aqui so se exibe a string
 * recebida — o frontend nunca reconstroi nem desmascara PII.
 */

export interface Guest {
  id: number
  full_name: string
  document: string
  phone: string
  created_at: string
}

/** Reserva aninhada nas listagens de hospedes (SPEC 4.3). */
export interface ReservationSummary {
  id: number
  checkin_date: string
  checkout_date: string
  has_vehicle: boolean
  checked_in_at: string | null
}

/** `active_reservation` e unico por hospede — constraint da SPEC 1.5. */
export interface GuestInHotel extends Guest {
  active_reservation: ReservationSummary
}

/** Um hospede pode ter varias reservas futuras (SPEC 4.3). */
export interface GuestPendingCheckin extends Guest {
  pending_reservations: ReservationSummary[]
}

export interface CreateGuestPayload {
  full_name: string
  document: string
  phone: string
}

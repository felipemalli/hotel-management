// `document` e `phone` chegam normalizados da API: documento alfanumérico
// maiúsculo, telefone só dígitos. A máscara de exibição é de `lib/pii.ts`.
export interface Guest {
  id: number
  full_name: string
  document: string
  phone: string
  created_at: string
}

export interface ReservationSummary {
  id: number
  checkin_date: string
  checkout_date: string
  has_vehicle: boolean
  checked_in_at: string | null
}

export interface GuestInHotel extends Guest {
  active_reservation: ReservationSummary
}

export interface GuestPendingCheckin extends Guest {
  pending_reservations: ReservationSummary[]
}

export interface CreateGuestPayload {
  full_name: string
  document: string
  phone: string
}

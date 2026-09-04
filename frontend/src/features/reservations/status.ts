import type { BadgeTone } from '@/components/ui'

import type { PaymentMethod, Reservation, ReservationStatus } from './types'

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: 'Pendente',
  CHECKED_IN: 'No hotel',
  CHECKED_OUT: 'Finalizada',
  CANCELLED: 'Cancelada',
}

export const RESERVATION_STATUS_TONES: Record<ReservationStatus, BadgeTone> = {
  PENDING: 'warning',
  CHECKED_IN: 'success',
  CHECKED_OUT: 'neutral',
  CANCELLED: 'error',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  PIX: 'Pix',
  OTHER: 'Outro',
}

// Titular mais acompanhantes: o preço não muda com pessoas (D19), mas a
// capacidade do quarto sim, e é o número que o balcão confere.
export function peopleCount(reservation: Reservation): number {
  return 1 + reservation.companions.length
}

// "—" fora de `CHECKED_OUT`: antes do checkout não existe conta para estar
// paga ou em aberto, e dizer "em aberto" ali sugeriria uma cobrança pendente.
export function paymentLabel(reservation: Reservation): string {
  if (reservation.status !== 'CHECKED_OUT') return '—'
  return reservation.paid_at === null ? 'Em aberto' : 'Pago'
}

import type { VariantProps } from 'class-variance-authority'

import type { badgeVariants } from '@/components/ui'

import type { PaymentMethod, Reservation, ReservationStatus } from './types'

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: 'Pendente',
  CHECKED_IN: 'No hotel',
  CHECKED_OUT: 'Finalizada',
  CANCELLED: 'Cancelada',
}

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

export const RESERVATION_STATUS_TONES: Record<ReservationStatus, BadgeVariant> = {
  PENDING: 'warning',
  CHECKED_IN: 'success',
  CHECKED_OUT: 'secondary',
  CANCELLED: 'destructive',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  PIX: 'Pix',
  OTHER: 'Outro',
}

export function peopleCount(reservation: Reservation): number {
  return 1 + reservation.companions.length
}

// — fora de CHECKED_OUT: antes do checkout não existe conta.
export function paymentLabel(reservation: Reservation): string {
  if (reservation.status !== 'CHECKED_OUT') return '—'
  return reservation.account?.status === 'PAID' ? 'Pago' : 'Em aberto'
}

import type { VariantProps } from 'class-variance-authority'

import type { badgeVariants } from '@/components/ui'

import type { Reservation, ReservationStatus } from './types'

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

export function peopleCount(reservation: Reservation): number {
  return 1 + reservation.companions.length
}

// — fora de CHECKED_OUT: antes do checkout não existe conta.
export function paymentLabel(reservation: Reservation): string {
  if (reservation.status !== 'CHECKED_OUT') return '—'
  return reservation.account?.status === 'PAID' ? 'Pago' : 'Em aberto'
}

export type CheckoutAlert = 'due' | 'overdue'

export const CHECKOUT_ALERT_LABELS: Record<CheckoutAlert, string> = {
  due: 'Sai hoje',
  overdue: 'Saída atrasada',
}

export const CHECKOUT_ALERT_TONES: Record<CheckoutAlert, BadgeVariant> = {
  due: 'warning',
  overdue: 'destructive',
}

export interface CheckoutClock {
  today: string
  /** Hora local `HH:MM:SS`; `checkoutLimit` vem `HH:MM` da política vigente. */
  time: string
  checkoutLimit: string
}

// Só CHECKED_IN: outro status pintaria a lista sem quarto a devolver.
export function checkoutAlert(
  reservation: Reservation,
  clock: CheckoutClock | null,
): CheckoutAlert | null {
  if (clock === null || reservation.status !== 'CHECKED_IN') return null
  if (reservation.checkout_date < clock.today) return 'overdue'
  if (reservation.checkout_date !== clock.today) return null
  // 12:00:00 em ponto ainda é isento: o vermelho só passa do limite.
  return clock.time > `${clock.checkoutLimit}:00` ? 'overdue' : 'due'
}

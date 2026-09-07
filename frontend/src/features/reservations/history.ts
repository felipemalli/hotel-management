import { formatISODateTime } from '@/lib/format/dates'

import { PAYMENT_METHOD_LABELS } from './payment'
import type { Reservation, UserRef } from './types'

export interface HistoryEntry {
  label: string
  at: string
  by: UserRef | null
}

// Nulo é transição que não aconteceu, não lacuna a preencher.
export function historyEntries(reservation: Reservation): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    { label: 'Criada', at: reservation.created_at, by: reservation.created_by },
  ]

  if (reservation.checked_in_at !== null) {
    entries.push({
      label: 'Check-in',
      at: reservation.checked_in_at,
      by: reservation.checked_in_by,
    })
  }

  if (reservation.checked_out_at !== null) {
    entries.push({
      label: 'Checkout',
      at: reservation.checked_out_at,
      by: reservation.checked_out_by,
    })
  }

  const payment = reservation.account?.payment ?? null
  if (payment !== null) {
    entries.push({
      label: `Pagamento (${PAYMENT_METHOD_LABELS[payment.method]})`,
      at: payment.paid_at,
      by: payment.received_by,
    })
  }

  if (reservation.cancelled_at !== null) {
    entries.push({
      label: 'Cancelamento',
      at: reservation.cancelled_at,
      by: reservation.cancelled_by,
    })
  }

  return entries
}

export function describeEntry(entry: HistoryEntry): string {
  const actor = entry.by === null ? 'sistema' : entry.by.username
  return `${entry.label} em ${formatISODateTime(entry.at)} por ${actor}`
}

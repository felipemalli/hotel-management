import { formatISODateTime } from '@/lib/format/dates'

import { PAYMENT_METHOD_LABELS } from './status'
import type { Reservation, UserRef } from './types'

export interface HistoryEntry {
  label: string
  at: string
  by: UserRef | null
}

// A máquina de estados é linear e cada transição acontece uma vez: a coluna com
// o seu `*_at` ao lado já é o histórico com ator. Aqui só se lê o que houve,
// nunca se infere o que faltou — uma linha nula é uma transição que não
// aconteceu, e não uma lacuna a preencher.
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

  if (reservation.paid_at !== null) {
    const method =
      reservation.payment_method === null
        ? 'Pagamento'
        : `Pagamento (${PAYMENT_METHOD_LABELS[reservation.payment_method]})`
    entries.push({ label: method, at: reservation.paid_at, by: reservation.paid_by })
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

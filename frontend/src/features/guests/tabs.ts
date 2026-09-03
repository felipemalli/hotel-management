import type { TabItem } from '@/components/ui'
import type { Paginated } from '@/lib/apiClient'

import type { Guest, GuestInHotel, GuestPendingCheckin, ReservationSummary } from './types'

export const DEBOUNCE_MS = 300

export const GUEST_TABS = ['all', 'in-hotel', 'pending-checkin'] as const

export type GuestTab = (typeof GUEST_TABS)[number]

export type GuestRow =
  | { tab: 'all'; guest: Guest }
  | {
      tab: 'in-hotel'
      guest: GuestInHotel
      reservation: ReservationSummary
      reservationStatus: 'CHECKED_IN'
    }
  | {
      tab: 'pending-checkin'
      guest: GuestPendingCheckin
      reservation: ReservationSummary
      reservationStatus: 'PENDING'
    }

interface GuestTabConfig {
  label: string
  caption: string
  emptyMessage: string
  headers: readonly string[]
}

export const GUEST_TAB_CONFIG = {
  all: {
    label: 'Todos',
    caption: 'Todos os hóspedes cadastrados',
    emptyMessage: 'Nenhum hóspede encontrado',
    headers: ['Nome', 'Documento', 'Telefone', 'Cadastro', 'Ações'],
  },
  'in-hotel': {
    label: 'No hotel',
    caption: 'Hóspedes no hotel',
    emptyMessage: 'Nenhum hóspede no hotel',
    headers: ['Nome', 'Documento', 'Telefone', 'Estadia', 'Vaga', 'Check-in', 'Ações'],
  },
  'pending-checkin': {
    label: 'Check-in pendente',
    caption: 'Hóspedes com reserva pendente de check-in',
    emptyMessage: 'Nenhuma reserva aguardando check-in',
    headers: ['Nome', 'Documento', 'Telefone', 'Reserva', 'Vaga', 'Ações'],
  },
} satisfies Record<GuestTab, GuestTabConfig>

export const GUEST_TAB_ITEMS: readonly TabItem<GuestTab>[] = GUEST_TABS.map((id) => ({
  id,
  label: GUEST_TAB_CONFIG[id].label,
}))

export interface GuestTabDatasets {
  all: Paginated<Guest> | undefined
  'in-hotel': Paginated<GuestInHotel> | undefined
  'pending-checkin': Paginated<GuestPendingCheckin> | undefined
}

export function toGuestRows(tab: GuestTab, datasets: GuestTabDatasets): GuestRow[] {
  switch (tab) {
    case 'all':
      return (datasets.all?.results ?? []).map((guest) => ({ tab, guest }))
    case 'in-hotel':
      return (datasets['in-hotel']?.results ?? []).map((guest) => ({
        tab,
        guest,
        reservation: guest.active_reservation,
        reservationStatus: 'CHECKED_IN',
      }))
    case 'pending-checkin':
      return (datasets['pending-checkin']?.results ?? []).flatMap((guest) =>
        guest.pending_reservations.map((reservation) => ({
          tab,
          guest,
          reservation,
          reservationStatus: 'PENDING',
        })),
      )
  }
}

export function guestRowKey(row: GuestRow): number {
  return row.tab === 'all' ? row.guest.id : row.reservation.id
}

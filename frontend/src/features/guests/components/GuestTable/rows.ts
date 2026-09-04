import type {
  Guest,
  GuestInHotel,
  GuestPendingCheckin,
  ReservationSummary,
} from '@/features/guests/types'
import type { Paginated } from '@/lib/api/apiClient'

export const GUEST_TABS = ['all', 'in-hotel', 'pending-checkin'] as const

export type GuestTab = (typeof GUEST_TABS)[number]

export function isGuestTab(value: string): value is GuestTab {
  return (GUEST_TABS as readonly string[]).includes(value)
}

export interface GuestTabItem {
  id: GuestTab
  label: string
}

export const GUEST_TAB_ITEMS: readonly GuestTabItem[] = [
  { id: 'all', label: 'Todos' },
  { id: 'in-hotel', label: 'No hotel' },
  { id: 'pending-checkin', label: 'Check-in pendente' },
]

export const GUEST_TAB_CAPTIONS: Record<GuestTab, string> = {
  all: 'Todos os hóspedes cadastrados',
  'in-hotel': 'Hóspedes no hotel',
  'pending-checkin': 'Hóspedes com reserva pendente de check-in',
}

export const GUEST_TAB_EMPTY_MESSAGES: Record<GuestTab, string> = {
  all: 'Nenhum hóspede encontrado',
  'in-hotel': 'Nenhum hóspede no hotel',
  'pending-checkin': 'Nenhuma reserva aguardando check-in',
}

export type PartyRole = 'holder' | 'companion'

// Sem campo de papel: acompanhante é quem tem guest_id de outra pessoa.
export function roleOf(guest: Guest, reservation: ReservationSummary): PartyRole {
  return reservation.guest_id === guest.id ? 'holder' : 'companion'
}

export interface GuestAllRow {
  guest: Guest
}

export interface GuestInHotelRow {
  guest: GuestInHotel
  reservation: ReservationSummary
  role: PartyRole
}

export interface GuestPendingRow {
  guest: GuestPendingCheckin
  reservation: ReservationSummary
  role: PartyRole
}

export function toAllRows(data: Paginated<Guest> | undefined): GuestAllRow[] {
  return (data?.results ?? []).map((guest) => ({ guest }))
}

export function toInHotelRows(data: Paginated<GuestInHotel> | undefined): GuestInHotelRow[] {
  return (data?.results ?? []).map((guest) => ({
    guest,
    reservation: guest.active_reservation,
    role: roleOf(guest, guest.active_reservation),
  }))
}

export function toPendingRows(data: Paginated<GuestPendingCheckin> | undefined): GuestPendingRow[] {
  return (data?.results ?? []).flatMap((guest) =>
    guest.pending_reservations.map((reservation) => ({
      guest,
      reservation,
      role: roleOf(guest, reservation),
    })),
  )
}

export function allRowId(row: GuestAllRow): string {
  return `guest-${row.guest.id}`
}

// Titular e acompanhante da mesma reserva: a chave precisa dos dois ids.
export function partyRowId(row: GuestInHotelRow | GuestPendingRow): string {
  return `reservation-${row.reservation.id}-guest-${row.guest.id}`
}

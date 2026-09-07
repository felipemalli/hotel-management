import { ROOM_101 } from '@/features/rooms/__fixtures__/rooms'

import type { Guest, GuestInHotel, GuestPendingCheckin, ReservationSummary } from '../types'

export const ANA: Guest = {
  id: 1,
  full_name: 'Ana Souza',
  document: '12345678901',
  phone: '5521988887777',
  nationality: 'BR',
  created_at: '2026-09-01T08:00:00-03:00',
}

export const BRUNO: Guest = {
  id: 2,
  full_name: 'Bruno Lima',
  document: '22222222100',
  phone: '5511977776666',
  nationality: 'BR',
  created_at: '2026-09-01T08:01:00-03:00',
}

export const CARLA: Guest = {
  id: 3,
  full_name: 'Carla Nunes',
  document: 'AB123456',
  phone: '5531966665555',
  nationality: 'PT',
  created_at: '2026-08-28T08:00:00-03:00',
}

export const DAVI: Guest = {
  id: 4,
  full_name: 'Davi Rocha',
  document: '44444444400',
  phone: '5541955554444',
  nationality: 'BR',
  created_at: '2026-09-01T08:03:00-03:00',
}

export const EVA: Guest = {
  id: 5,
  full_name: 'Eva Lima',
  document: '55544433322',
  phone: '541155554444',
  nationality: 'AR',
  created_at: '2026-09-01T08:02:00-03:00',
}

const STAY: ReservationSummary = {
  id: 0,
  guest_id: 0,
  room: { id: ROOM_101.id, number: ROOM_101.number },
  checkin_date: '2026-09-01',
  checkout_date: '2026-09-03',
  has_vehicle: true,
  checked_in_at: null,
}

// `guest_id` cai no próprio hóspede (titular); outro id em `stay` monta o acompanhante.
export function inHotel(guest: Guest, stay: Partial<ReservationSummary> = {}): GuestInHotel {
  return {
    ...guest,
    active_reservation: {
      ...STAY,
      id: guest.id,
      guest_id: guest.id,
      checked_in_at: '2026-09-01T14:02:00-03:00',
      ...stay,
    },
  }
}

export function pendingCheckin(
  guest: Guest,
  stay: Partial<ReservationSummary> = {},
): GuestPendingCheckin {
  return {
    ...guest,
    pending_reservations: [{ ...STAY, id: guest.id, guest_id: guest.id, ...stay }],
  }
}

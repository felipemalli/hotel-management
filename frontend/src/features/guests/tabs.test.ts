import { describe, expect, it } from 'vitest'

import { page } from '@/test/fixtures'

import { ANA, BRUNO, inHotel, pendingCheckin } from './__fixtures__/guests'
import { GUEST_TABS, guestRowKey, type GuestTabDatasets, toGuestRows } from './tabs'

const EMPTY: GuestTabDatasets = {
  all: undefined,
  'in-hotel': undefined,
  'pending-checkin': undefined,
}

describe('toGuestRows', () => {
  it('devolve lista vazia para qualquer aba sem dado em cache', () => {
    for (const tab of GUEST_TABS) {
      expect(toGuestRows(tab, EMPTY)).toEqual([])
    }
  })

  it('le apenas o dataset da aba pedida', () => {
    const datasets: GuestTabDatasets = {
      all: page([ANA, BRUNO]),
      'in-hotel': page([inHotel(BRUNO)]),
      'pending-checkin': page([pendingCheckin(ANA)]),
    }

    expect(toGuestRows('all', datasets).map((row) => row.guest.id)).toEqual([ANA.id, BRUNO.id])
    expect(toGuestRows('in-hotel', datasets).map((row) => row.guest.id)).toEqual([BRUNO.id])
    expect(toGuestRows('pending-checkin', datasets).map((row) => row.guest.id)).toEqual([ANA.id])
  })

  it('anexa a reserva ativa e o estado do check-in na aba do hotel', () => {
    const guest = inHotel(BRUNO)
    const rows = toGuestRows('in-hotel', { ...EMPTY, 'in-hotel': page([guest]) })

    expect(rows).toEqual([
      {
        tab: 'in-hotel',
        guest,
        reservation: guest.active_reservation,
        reservationStatus: 'CHECKED_IN',
      },
    ])
  })

  it('abre uma linha por reserva pendente, nao uma por hospede', () => {
    const first = pendingCheckin(ANA, { id: 10, checkin_date: '2026-09-10' })
    const second = pendingCheckin(ANA, { id: 11, checkin_date: '2026-09-20' })
    const guest = {
      ...first,
      pending_reservations: [...first.pending_reservations, ...second.pending_reservations],
    }

    const rows = toGuestRows('pending-checkin', { ...EMPTY, 'pending-checkin': page([guest]) })

    expect(rows).toHaveLength(2)
    expect(rows.map(guestRowKey)).toEqual([10, 11])
    expect(rows.every((row) => row.tab === 'pending-checkin')).toBe(true)
  })

  it('identifica a linha pelo hospede na aba de todos e pela reserva nas demais', () => {
    const guest = inHotel(BRUNO, { id: 99 })

    expect(guestRowKey({ tab: 'all', guest: ANA })).toBe(ANA.id)
    expect(
      guestRowKey({
        tab: 'in-hotel',
        guest,
        reservation: guest.active_reservation,
        reservationStatus: 'CHECKED_IN',
      }),
    ).toBe(99)
  })
})

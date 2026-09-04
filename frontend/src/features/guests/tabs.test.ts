import { describe, expect, it } from 'vitest'

import { page } from '@/test/fixtures'

import { ANA, BRUNO, EVA, inHotel, pendingCheckin } from './__fixtures__/guests'
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
        role: 'holder',
      },
    ])
  })

  it('marca como acompanhante a linha cuja reserva pertence a outro hospede', () => {
    const holder = inHotel(BRUNO, { id: 20 })
    const companion = inHotel(EVA, { id: 20, guest_id: BRUNO.id })

    const rows = toGuestRows('in-hotel', {
      ...EMPTY,
      'in-hotel': page([holder, companion]),
    })

    expect(rows.map((row) => (row.tab === 'in-hotel' ? row.role : null))).toEqual([
      'holder',
      'companion',
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
    expect(rows.map(guestRowKey)).toEqual([
      `reservation-10-guest-${ANA.id}`,
      `reservation-11-guest-${ANA.id}`,
    ])
    expect(rows.every((row) => row.tab === 'pending-checkin')).toBe(true)
  })

  // Titular e acompanhante compartilham a reserva: a chave precisa dos dois ids,
  // senao o React reciclaria uma linha na outra.
  it('identifica a linha pelo hospede na aba de todos e pelo par nas demais', () => {
    const holder = inHotel(BRUNO, { id: 99 })
    const companion = inHotel(EVA, { id: 99, guest_id: BRUNO.id })

    expect(guestRowKey({ tab: 'all', guest: ANA })).toBe(`guest-${ANA.id}`)

    const keys = [holder, companion].map((guest) =>
      guestRowKey({
        tab: 'in-hotel',
        guest,
        reservation: guest.active_reservation,
        reservationStatus: 'CHECKED_IN',
        role: guest.active_reservation.guest_id === guest.id ? 'holder' : 'companion',
      }),
    )

    expect(keys).toEqual([`reservation-99-guest-${BRUNO.id}`, `reservation-99-guest-${EVA.id}`])
    expect(new Set(keys).size).toBe(2)
  })
})

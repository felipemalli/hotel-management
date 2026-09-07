import { ANA, BRUNO, CARLA, EVA } from '@/features/guests/__fixtures__/guests'
import { ROOM_101, ROOM_102, ROOM_103 } from '@/features/rooms/__fixtures__/rooms'

import type { Account, Reservation } from '../types'

export const ATTENDANT_REF = { id: 1, username: 'atendente' }

const BASE: Reservation = {
  id: 1,
  guest_id: ANA.id,
  companions: [],
  room: { id: ROOM_101.id, number: ROOM_101.number },
  policy_id: null,
  checkin_date: '2026-09-04',
  checkout_date: '2026-09-06',
  has_vehicle: true,
  status: 'PENDING',
  checked_in_at: null,
  checked_out_at: null,
  cancelled_at: null,
  account: null,
  created_at: '2026-09-01T08:00:00-03:00',
  created_by: ATTENDANT_REF,
  checked_in_by: null,
  checked_out_by: null,
  cancelled_by: null,
}

const OPEN_ACCOUNT: Account = {
  id: 1,
  status: 'OPEN',
  total_amount: null,
  opened_at: '2026-09-03T15:00:00-03:00',
  closed_at: null,
  payment: null,
}

const CLOSED_ACCOUNT: Account = {
  id: 2,
  status: 'CLOSED',
  total_amount: '425.00',
  opened_at: '2026-08-28T15:00:00-03:00',
  closed_at: '2026-08-30T12:01:00-03:00',
  payment: null,
}

export function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return { ...BASE, ...overrides }
}

export const ANA_PENDING = reservation()

export const BRUNO_CHECKED_IN = reservation({
  id: 2,
  guest_id: BRUNO.id,
  companions: [{ id: EVA.id, full_name: EVA.full_name }],
  room: { id: ROOM_102.id, number: ROOM_102.number },
  policy_id: 1,
  checkin_date: '2026-09-03',
  checkout_date: '2026-09-05',
  has_vehicle: false,
  status: 'CHECKED_IN',
  checked_in_at: '2026-09-03T15:00:00-03:00',
  checked_in_by: ATTENDANT_REF,
  account: OPEN_ACCOUNT,
})

export const CARLA_CHECKED_OUT = reservation({
  id: 3,
  guest_id: CARLA.id,
  room: { id: ROOM_103.id, number: ROOM_103.number },
  policy_id: 1,
  checkin_date: '2026-08-28',
  checkout_date: '2026-08-30',
  status: 'CHECKED_OUT',
  checked_in_at: '2026-08-28T15:00:00-03:00',
  checked_out_at: '2026-08-30T12:01:00-03:00',
  checked_in_by: ATTENDANT_REF,
  checked_out_by: ATTENDANT_REF,
  account: CLOSED_ACCOUNT,
})

export const CARLA_PAID = reservation({
  ...CARLA_CHECKED_OUT,
  account: {
    ...CLOSED_ACCOUNT,
    status: 'PAID',
    payment: {
      paid_at: '2026-08-30T12:30:00-03:00',
      method: 'PIX',
      received_by: ATTENDANT_REF,
    },
  },
})

// Id próprio: cancelada é outra linha, não a pendente.
export const ANA_CANCELLED = reservation({
  id: 4,
  status: 'CANCELLED',
  cancelled_at: '2026-09-02T09:00:00-03:00',
  cancelled_by: ATTENDANT_REF,
})

export const ALL_RESERVATIONS = [ANA_PENDING, BRUNO_CHECKED_IN, CARLA_CHECKED_OUT, ANA_CANCELLED]

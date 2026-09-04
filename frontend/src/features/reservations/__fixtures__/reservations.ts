import { ANA, BRUNO, CARLA, EVA } from '@/features/guests/__fixtures__/guests'
import { ROOM_101, ROOM_102, ROOM_103 } from '@/features/rooms/__fixtures__/rooms'

import type { Reservation } from '../types'

export const ATTENDANT_REF = { id: 1, username: 'atendente' }

// Base PENDING: todo campo que só existe depois de uma transição nasce nulo,
// que é como a linha sai de `create_reservation`.
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
  total_daily: null,
  total_parking: null,
  late_fee: null,
  late_fee_base: null,
  total_amount: null,
  paid_at: null,
  payment_method: null,
  created_at: '2026-09-01T08:00:00-03:00',
  created_by: ATTENDANT_REF,
  checked_in_by: null,
  checked_out_by: null,
  cancelled_by: null,
  paid_by: null,
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
})

// Totais congelados iguais aos de T7, a mesma estadia que o seed encerra em
// aberto: é a conta que exercita o pagamento.
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
  total_daily: '300.00',
  total_parking: '35.00',
  late_fee: '90.00',
  late_fee_base: '180.00',
  total_amount: '425.00',
  checked_in_by: ATTENDANT_REF,
  checked_out_by: ATTENDANT_REF,
})

export const CARLA_PAID = reservation({
  ...CARLA_CHECKED_OUT,
  paid_at: '2026-08-30T12:30:00-03:00',
  payment_method: 'PIX',
  paid_by: ATTENDANT_REF,
})

// Id próprio: uma reserva cancelada é outra linha, não a mesma da pendente.
export const ANA_CANCELLED = reservation({
  id: 4,
  status: 'CANCELLED',
  cancelled_at: '2026-09-02T09:00:00-03:00',
  cancelled_by: ATTENDANT_REF,
})

export const ALL_RESERVATIONS = [ANA_PENDING, BRUNO_CHECKED_IN, CARLA_CHECKED_OUT, ANA_CANCELLED]

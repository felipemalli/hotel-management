// Espelho de `backend/tests/unit/test_pricing.py`: os mesmos 9 casos T1–T9, com
// os mesmos números. Mudou a tabela de preços, mudam os dois arquivos.

import type { CheckoutStatement } from '../types'

// T1 — seg 15:00 → qua 11:00, sem vaga, sem multa = 240,00
export const T1_STATEMENT: CheckoutStatement = {
  reservation_id: 1,
  guest: { id: 101, full_name: 'Ana Souza' },
  checked_in_at: '2025-03-03T15:00:00-03:00',
  checked_out_at: '2025-03-05T11:00:00-03:00',
  lines: [
    {
      date: '2025-03-03',
      weekday: 'segunda-feira',
      daily_rate: '120.00',
      parking_fee: '0.00',
    },
    {
      date: '2025-03-04',
      weekday: 'terça-feira',
      daily_rate: '120.00',
      parking_fee: '0.00',
    },
  ],
  subtotal_daily: '240.00',
  subtotal_parking: '0.00',
  late_fee: { applied: false, base_rate: null, amount: '0.00' },
  total: '240.00',
}

// T2 — sáb 14:00 → seg 10:00, com vaga, sem multa = 400,00
export const T2_STATEMENT: CheckoutStatement = {
  reservation_id: 2,
  guest: { id: 102, full_name: 'Bruno Lima' },
  checked_in_at: '2025-03-08T14:00:00-03:00',
  checked_out_at: '2025-03-10T10:00:00-03:00',
  lines: [
    {
      date: '2025-03-08',
      weekday: 'sábado',
      daily_rate: '180.00',
      parking_fee: '20.00',
    },
    {
      date: '2025-03-09',
      weekday: 'domingo',
      daily_rate: '180.00',
      parking_fee: '20.00',
    },
  ],
  subtotal_daily: '360.00',
  subtotal_parking: '40.00',
  late_fee: { applied: false, base_rate: null, amount: '0.00' },
  total: '400.00',
}

// T3 — sex 16:00 → seg 11:30, com vaga, três tarifas = 535,00
export const T3_STATEMENT: CheckoutStatement = {
  reservation_id: 3,
  guest: { id: 103, full_name: 'Carla Nunes' },
  checked_in_at: '2025-03-07T16:00:00-03:00',
  checked_out_at: '2025-03-10T11:30:00-03:00',
  lines: [
    {
      date: '2025-03-07',
      weekday: 'sexta-feira',
      daily_rate: '120.00',
      parking_fee: '15.00',
    },
    {
      date: '2025-03-08',
      weekday: 'sábado',
      daily_rate: '180.00',
      parking_fee: '20.00',
    },
    {
      date: '2025-03-09',
      weekday: 'domingo',
      daily_rate: '180.00',
      parking_fee: '20.00',
    },
  ],
  subtotal_daily: '480.00',
  subtotal_parking: '55.00',
  late_fee: { applied: false, base_rate: null, amount: '0.00' },
  total: '535.00',
}

// T4 — ter 14:00 → qui 11:59, sem vaga, antes das 12h = 240,00
export const T4_STATEMENT: CheckoutStatement = {
  reservation_id: 4,
  guest: { id: 104, full_name: 'Davi Rocha' },
  checked_in_at: '2025-03-04T14:00:00-03:00',
  checked_out_at: '2025-03-06T11:59:00-03:00',
  lines: [
    {
      date: '2025-03-04',
      weekday: 'terça-feira',
      daily_rate: '120.00',
      parking_fee: '0.00',
    },
    {
      date: '2025-03-05',
      weekday: 'quarta-feira',
      daily_rate: '120.00',
      parking_fee: '0.00',
    },
  ],
  subtotal_daily: '240.00',
  subtotal_parking: '0.00',
  late_fee: { applied: false, base_rate: null, amount: '0.00' },
  total: '240.00',
}

// T5 — ter 14:00 → qui 12:01, sem vaga, multa útil 60,00 = 300,00
export const T5_STATEMENT: CheckoutStatement = {
  reservation_id: 5,
  guest: { id: 105, full_name: 'Elisa Prado' },
  checked_in_at: '2025-03-04T14:00:00-03:00',
  checked_out_at: '2025-03-06T12:01:00-03:00',
  lines: [
    {
      date: '2025-03-04',
      weekday: 'terça-feira',
      daily_rate: '120.00',
      parking_fee: '0.00',
    },
    {
      date: '2025-03-05',
      weekday: 'quarta-feira',
      daily_rate: '120.00',
      parking_fee: '0.00',
    },
  ],
  subtotal_daily: '240.00',
  subtotal_parking: '0.00',
  late_fee: { applied: true, base_rate: '120.00', amount: '60.00' },
  total: '300.00',
}

// T6 — sex 15:00 → dom 11:59, sem vaga, antes das 12h = 300,00
export const T6_STATEMENT: CheckoutStatement = {
  reservation_id: 6,
  guest: { id: 106, full_name: 'Fabio Moraes' },
  checked_in_at: '2025-03-07T15:00:00-03:00',
  checked_out_at: '2025-03-09T11:59:00-03:00',
  lines: [
    {
      date: '2025-03-07',
      weekday: 'sexta-feira',
      daily_rate: '120.00',
      parking_fee: '0.00',
    },
    {
      date: '2025-03-08',
      weekday: 'sábado',
      daily_rate: '180.00',
      parking_fee: '0.00',
    },
  ],
  subtotal_daily: '300.00',
  subtotal_parking: '0.00',
  late_fee: { applied: false, base_rate: null, amount: '0.00' },
  total: '300.00',
}

// T7 — sex 15:00 → dom 12:01, com vaga, multa 90,00 = 425,00
export const T7_STATEMENT: CheckoutStatement = {
  reservation_id: 7,
  guest: { id: 107, full_name: 'Gabriela Reis' },
  checked_in_at: '2025-03-07T15:00:00-03:00',
  checked_out_at: '2025-03-09T12:01:00-03:00',
  lines: [
    {
      date: '2025-03-07',
      weekday: 'sexta-feira',
      daily_rate: '120.00',
      parking_fee: '15.00',
    },
    {
      date: '2025-03-08',
      weekday: 'sábado',
      daily_rate: '180.00',
      parking_fee: '20.00',
    },
  ],
  subtotal_daily: '300.00',
  subtotal_parking: '35.00',
  late_fee: { applied: true, base_rate: '180.00', amount: '90.00' },
  total: '425.00',
}

// T8 — qua 18:00 → sex 12:00:00 exatas: a igualdade é isenta = 240,00
export const T8_STATEMENT: CheckoutStatement = {
  reservation_id: 8,
  guest: { id: 108, full_name: 'Heitor Campos' },
  checked_in_at: '2025-03-05T18:00:00-03:00',
  checked_out_at: '2025-03-07T12:00:00-03:00',
  lines: [
    {
      date: '2025-03-05',
      weekday: 'quarta-feira',
      daily_rate: '120.00',
      parking_fee: '0.00',
    },
    {
      date: '2025-03-06',
      weekday: 'quinta-feira',
      daily_rate: '120.00',
      parking_fee: '0.00',
    },
  ],
  subtotal_daily: '240.00',
  subtotal_parking: '0.00',
  late_fee: { applied: false, base_rate: null, amount: '0.00' },
  total: '240.00',
}

// T9 — day-use seg 14:00 → 18:00, com vaga, mínimo de 1 diária = 195,00
export const T9_STATEMENT: CheckoutStatement = {
  reservation_id: 9,
  guest: { id: 109, full_name: 'Iris Tavares' },
  checked_in_at: '2025-03-03T14:00:00-03:00',
  checked_out_at: '2025-03-03T18:00:00-03:00',
  lines: [
    {
      date: '2025-03-03',
      weekday: 'segunda-feira',
      daily_rate: '120.00',
      parking_fee: '15.00',
    },
  ],
  subtotal_daily: '120.00',
  subtotal_parking: '15.00',
  late_fee: { applied: true, base_rate: '120.00', amount: '60.00' },
  total: '195.00',
}

export const BILL_FIXTURES = {
  T1: T1_STATEMENT,
  T2: T2_STATEMENT,
  T3: T3_STATEMENT,
  T4: T4_STATEMENT,
  T5: T5_STATEMENT,
  T6: T6_STATEMENT,
  T7: T7_STATEMENT,
  T8: T8_STATEMENT,
  T9: T9_STATEMENT,
} as const

export type BillFixtureId = keyof typeof BILL_FIXTURES

export const BILL_TOTALS: Record<BillFixtureId, string> = {
  T1: '240.00',
  T2: '400.00',
  T3: '535.00',
  T4: '240.00',
  T5: '300.00',
  T6: '300.00',
  T7: '425.00',
  T8: '240.00',
  T9: '195.00',
}

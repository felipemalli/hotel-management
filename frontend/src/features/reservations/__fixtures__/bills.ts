/**
 * Fixtures do extrato de checkout — replica 1:1 da tabela SPEC 3.3.
 *
 * A SPEC 3.3 e a **fonte da verdade** dos numeros deste projeto. Esta tabela
 * esta replicada em `backend/tests/unit/test_pricing.py` (os 9 casos T1-T9
 * parametrizados) e aqui. Alterou a tabela -> alterou os dois arquivos, ou o
 * CI quebra.
 *
 * Doutrina da SPEC 6.3: teste de frontend **nao recalcula** aritmetica. Estes
 * valores sao copia literal do contrato, entao qualquer drift no payload da
 * SPEC 4.4 quebra o render, que e exatamente o que se quer provar.
 *
 * Calendario de referencia: marco/2025 (03=seg, 04=ter, 05=qua, 06=qui,
 * 07=sex, 08=sab, 09=dom, 10=seg).
 */

import type { CheckoutStatement } from '../types'

/**
 * T1 — Dias úteis puros, saída no horário.
 *
 * Check-in Seg 03/03 15:00 · Checkout Qua 05/03 11:00 · Vaga: Não
 * Diarias segunda 120,00 + terça 120,00 = 240,00 · Vaga 0,00 · Multa 0,00 · TOTAL R$ 240,00
 */
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

/**
 * T2 — Fim de semana puro + vaga fds.
 *
 * Check-in Sáb 08/03 14:00 · Checkout Seg 10/03 10:00 · Vaga: Sim
 * Diarias sábado 180,00 + domingo 180,00 = 360,00 · Vaga 40,00 · Multa 0,00 · TOTAL R$ 400,00
 */
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

/**
 * T3 — Travessia sexta→segunda mistura tarifas.
 *
 * Check-in Sex 07/03 16:00 · Checkout Seg 10/03 11:30 · Vaga: Sim
 * Diarias sexta 120,00 + sábado 180,00 + domingo 180,00 = 480,00 · Vaga 55,00 · Multa 0,00 · TOTAL R$ 535,00
 */
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

/**
 * T4 — Fronteira 11:59 em dia útil → isento.
 *
 * Check-in Ter 04/03 14:00 · Checkout Qui 06/03 11:59 · Vaga: Não
 * Diarias terça 120,00 + quarta 120,00 = 240,00 · Vaga 0,00 · Multa 0,00 · TOTAL R$ 240,00
 */
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

/**
 * T5 — 12:01 em dia útil → multa base útil.
 *
 * Check-in Ter 04/03 14:00 · Checkout Qui 06/03 12:01 · Vaga: Não
 * Diarias terça 120,00 + quarta 120,00 = 240,00 · Vaga 0,00 · Multa 60,00 · TOTAL R$ 300,00
 */
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

/**
 * T6 — Fronteira 11:59 em fim de semana → isento.
 *
 * Check-in Sex 07/03 15:00 · Checkout Dom 09/03 11:59 · Vaga: Não
 * Diarias sexta 120,00 + sábado 180,00 = 300,00 · Vaga 0,00 · Multa 0,00 · TOTAL R$ 300,00
 */
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

/**
 * T7 — 12:01 no domingo → multa base fds + vaga mista.
 *
 * Check-in Sex 07/03 15:00 · Checkout Dom 09/03 12:01 · Vaga: Sim
 * Diarias sexta 120,00 + sábado 180,00 = 300,00 · Vaga 35,00 · Multa 90,00 · TOTAL R$ 425,00
 */
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

/**
 * T8 — Igualdade exata 12:00:00 → isento (D3).
 *
 * Check-in Qua 05/03 18:00 · Checkout Sex 07/03 12:00:00 · Vaga: Não
 * Diarias quarta 120,00 + quinta 120,00 = 240,00 · Vaga 0,00 · Multa 0,00 · TOTAL R$ 240,00
 */
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

/**
 * T9 — Day-use: mínimo 1 diária (D1) + multa mesmo dia.
 *
 * Check-in Seg 03/03 14:00 · Checkout Seg 03/03 18:00 · Vaga: Sim
 * Diarias segunda 120,00 = 120,00 · Vaga 15,00 · Multa 60,00 · TOTAL R$ 195,00
 */
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

/** Os 9 casos da SPEC 3.3 indexados pelo id imutavel da tabela. */
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

/** Totais da coluna "TOTAL R$" da SPEC 3.3, para assercao direta. */
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

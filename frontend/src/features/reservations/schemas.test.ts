import { describe, expect, it } from 'vitest'

import { BILL_FIXTURES, T7_STATEMENT } from './__fixtures__/bills'
import {
  checkoutStatementSchema,
  lateFeeSchema,
  reservationFormSchema,
  reservationSchema,
} from './schemas'

const TODAY = '2026-09-03'

describe('reservationFormSchema', () => {
  it('aceita entrada hoje e saida no dia seguinte', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse({
      guest_id: 1,
      checkin_date: TODAY,
      checkout_date: '2026-09-04',
      has_vehicle: false,
    })

    expect(result.success).toBe(true)
  })

  it('devolve exatamente um problema por data vazia, nunca a comparacao tambem', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse({
      guest_id: 1,
      checkin_date: '',
      checkout_date: '',
      has_vehicle: false,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(2)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Campo obrigatório.',
      'Campo obrigatório.',
    ])
  })

  it('barra entrada no passado, comparando strings ISO', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse({
      guest_id: 1,
      checkin_date: '2026-09-02',
      checkout_date: '2026-09-04',
      has_vehicle: false,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['checkin_date'],
        message: 'A reserva não pode começar no passado.',
      }),
    ])
  })

  it('barra saida no mesmo dia ou antes da entrada', () => {
    const schema = reservationFormSchema(TODAY)

    const sameDay = schema.safeParse({
      guest_id: 1,
      checkin_date: TODAY,
      checkout_date: TODAY,
      has_vehicle: false,
    })
    expect(sameDay.success).toBe(false)
    expect(sameDay.error?.issues).toEqual([
      expect.objectContaining({
        path: ['checkout_date'],
        message: 'A saída deve ser depois da entrada (mínimo de 1 noite).',
      }),
    ])

    const before = schema.safeParse({
      guest_id: 1,
      checkin_date: '2026-09-05',
      checkout_date: '2026-09-04',
      has_vehicle: false,
    })
    expect(before.success).toBe(false)
  })
})

describe('checkoutStatementSchema', () => {
  it('aceita os nove extratos da tabela de precos', () => {
    const rejected = Object.entries(BILL_FIXTURES)
      .filter(([, statement]) => !checkoutStatementSchema.safeParse(statement).success)
      .map(([id]) => id)

    expect(rejected).toEqual([])
  })

  it('recusa multa cobrada sem a tarifa que a originou', () => {
    const impossible = {
      ...T7_STATEMENT,
      late_fee: { applied: true, base_rate: null, amount: '90.00' },
    }

    expect(checkoutStatementSchema.safeParse(impossible).success).toBe(false)
    expect(
      lateFeeSchema.safeParse({ applied: false, base_rate: '180.00', amount: '0.00' }).success,
    ).toBe(false)
  })

  it('recusa dinheiro que exigiria conversao', () => {
    expect(checkoutStatementSchema.safeParse({ ...T7_STATEMENT, total: 425 }).success).toBe(false)
    expect(checkoutStatementSchema.safeParse({ ...T7_STATEMENT, total: '425' }).success).toBe(false)
  })
})

describe('reservationSchema', () => {
  const PENDING = {
    id: 7,
    guest_id: 1,
    checkin_date: '2026-09-03',
    checkout_date: '2026-09-05',
    has_vehicle: true,
    status: 'PENDING',
    checked_in_at: null,
    checked_out_at: null,
    total_daily: null,
    total_parking: null,
    late_fee: null,
    total_amount: null,
    created_at: '2026-09-01T10:00:00-03:00',
  }

  it('aceita a reserva sem valores fechados e recusa status desconhecido', () => {
    expect(reservationSchema.safeParse(PENDING).success).toBe(true)
    expect(reservationSchema.safeParse({ ...PENDING, status: 'NO_SHOW' }).success).toBe(false)
  })

  it('recusa data-hora sem deslocamento, que o formatador nao saberia situar', () => {
    expect(
      reservationSchema.safeParse({ ...PENDING, created_at: '2026-09-01T10:00:00' }).success,
    ).toBe(false)
  })
})

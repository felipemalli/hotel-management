import { describe, expect, it } from 'vitest'

import { BILL_FIXTURES, T7_STATEMENT } from './__fixtures__/bills'
import { ANA_PENDING, BRUNO_CHECKED_IN, CARLA_PAID } from './__fixtures__/reservations'
import {
  checkoutStatementSchema,
  COMPANION_UNRESOLVED_MESSAGE,
  lateFeeSchema,
  reservationFormSchema,
  reservationSchema,
  ROOM_REQUIRED_MESSAGE,
} from './schemas'

const TODAY = '2026-09-03'

const FILLED = {
  guest_id: 1,
  room_id: 1,
  companion_ids: [],
  companion_draft: '',
  checkin_date: TODAY,
  checkout_date: '2026-09-04',
  has_vehicle: false,
}

describe('reservationFormSchema', () => {
  it('aceita entrada hoje e saida no dia seguinte', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse(FILLED)

    expect(result.success).toBe(true)
    expect(result.data?.room_id).toBe(1)
  })

  it('exige o quarto com a mensagem propria', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse({ ...FILLED, room_id: null })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['room_id'], message: ROOM_REQUIRED_MESSAGE }),
    ])
  })

  it('devolve exatamente um problema por data vazia, nunca a comparacao tambem', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse({ ...FILLED, checkin_date: '', checkout_date: '' })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(2)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Campo obrigatório.',
      'Campo obrigatório.',
    ])
  })

  it('so uma data vazia tambem barra so o campo obrigatorio, nunca a comparacao', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse({ ...FILLED, checkout_date: '' })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['checkout_date'], message: 'Campo obrigatório.' }),
    ])
  })

  it('barra entrada no passado, comparando strings ISO', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse({ ...FILLED, checkin_date: '2026-09-02' })

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

    const sameDay = schema.safeParse({ ...FILLED, checkout_date: TODAY })
    expect(sameDay.success).toBe(false)
    expect(sameDay.error?.issues).toEqual([
      expect.objectContaining({
        path: ['checkout_date'],
        message: 'A saída deve ser depois da entrada (mínimo de 1 noite).',
      }),
    ])

    const before = schema.safeParse({
      ...FILLED,
      checkin_date: '2026-09-05',
      checkout_date: '2026-09-04',
    })
    expect(before.success).toBe(false)
  })

  it('barra busca de acompanhante que nao foi escolhida na lista', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse({ ...FILLED, companion_draft: 'zzz' })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['companion_ids'],
        message: COMPANION_UNRESOLVED_MESSAGE,
      }),
    ])
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
      late_fee: { applied: true, amount: '90.00', days: [] },
    }

    expect(checkoutStatementSchema.safeParse(impossible).success).toBe(false)
    expect(
      lateFeeSchema.safeParse({
        applied: false,
        amount: '0.00',
        days: [{ date: '2025-03-09', weekday: 'domingo', base_rate: '180.00', amount: '90.00' }],
      }).success,
    ).toBe(false)
  })

  it('recusa dinheiro que exigiria conversao', () => {
    expect(checkoutStatementSchema.safeParse({ ...T7_STATEMENT, total: 425 }).success).toBe(false)
    expect(checkoutStatementSchema.safeParse({ ...T7_STATEMENT, total: '425' }).success).toBe(false)
  })
})

describe('reservationSchema', () => {
  const PENDING = ANA_PENDING

  it('aceita a reserva sem valores fechados e recusa status desconhecido', () => {
    expect(reservationSchema.safeParse(PENDING).success).toBe(true)
    expect(reservationSchema.safeParse({ ...PENDING, status: 'NO_SHOW' }).success).toBe(false)
  })

  it('aceita a estadia com acompanhante e a conta paga, com os atores', () => {
    expect(reservationSchema.safeParse(BRUNO_CHECKED_IN).success).toBe(true)
    expect(reservationSchema.safeParse(CARLA_PAID).success).toBe(true)
  })

  it('recusa status de conta e forma de pagamento fora do contrato', () => {
    const account = CARLA_PAID.account

    expect(
      reservationSchema.safeParse({ ...CARLA_PAID, account: { ...account, status: 'FOO' } })
        .success,
    ).toBe(false)
    expect(
      reservationSchema.safeParse({
        ...CARLA_PAID,
        account: { ...account, payment: { ...account?.payment, method: 'BOLETO' } },
      }).success,
    ).toBe(false)
  })

  it('recusa data-hora sem deslocamento, que o formatador nao saberia situar', () => {
    expect(
      reservationSchema.safeParse({ ...PENDING, created_at: '2026-09-01T10:00:00' }).success,
    ).toBe(false)
  })
})

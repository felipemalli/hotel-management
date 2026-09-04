import { describe, expect, it } from 'vitest'

import { BILL_FIXTURES, T7_STATEMENT } from './__fixtures__/bills'
import { ANA_PENDING, BRUNO_CHECKED_IN, CARLA_PAID } from './__fixtures__/reservations'
import {
  checkoutStatementSchema,
  lateFeeSchema,
  reservationFormSchema,
  reservationSchema,
  ROOM_REQUIRED_MESSAGE,
} from './schemas'

const TODAY = '2026-09-03'

// O que o formulário entrega ao resolver: o quarto já escolhido e a lista de
// acompanhantes, que é o payload da API menos o `room_id` ainda nulo.
const FILLED = {
  guest_id: 1,
  room_id: 1,
  companion_ids: [],
  checkin_date: TODAY,
  checkout_date: '2026-09-04',
  has_vehicle: false,
}

describe('reservationFormSchema', () => {
  it('aceita entrada hoje e saida no dia seguinte', () => {
    const schema = reservationFormSchema(TODAY)
    const result = schema.safeParse(FILLED)

    expect(result.success).toBe(true)
    // O refine estreita a saída: o que sai do submit já é o payload da API.
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
  const PENDING = ANA_PENDING

  it('aceita a reserva sem valores fechados e recusa status desconhecido', () => {
    expect(reservationSchema.safeParse(PENDING).success).toBe(true)
    expect(reservationSchema.safeParse({ ...PENDING, status: 'NO_SHOW' }).success).toBe(false)
  })

  it('aceita a estadia com acompanhante e a conta paga, com os atores', () => {
    expect(reservationSchema.safeParse(BRUNO_CHECKED_IN).success).toBe(true)
    expect(reservationSchema.safeParse(CARLA_PAID).success).toBe(true)
  })

  it('recusa forma de pagamento fora do contrato', () => {
    expect(reservationSchema.safeParse({ ...CARLA_PAID, payment_method: 'BOLETO' }).success).toBe(
      false,
    )
  })

  it('recusa data-hora sem deslocamento, que o formatador nao saberia situar', () => {
    expect(
      reservationSchema.safeParse({ ...PENDING, created_at: '2026-09-01T10:00:00' }).success,
    ).toBe(false)
  })
})

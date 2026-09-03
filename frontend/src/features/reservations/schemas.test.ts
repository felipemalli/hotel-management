import { describe, expect, it } from 'vitest'

import { reservationFormSchema } from './schemas'

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

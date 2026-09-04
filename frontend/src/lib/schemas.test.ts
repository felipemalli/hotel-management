import { describe, expect, it } from 'vitest'

import {
  decimalString,
  factorString,
  isoDate,
  isoDateTime,
  moneyString,
  paginated,
  timeHHMM,
  userRefSchema,
} from './schemas'

describe('moneyString', () => {
  it('aceita a forma que a API promete, com ou sem sinal', () => {
    expect(moneyString.safeParse('120.00').success).toBe(true)
    expect(moneyString.safeParse('0.50').success).toBe(true)
    expect(moneyString.safeParse('-90.00').success).toBe(true)
    expect(moneyString.safeParse('1234567.89').success).toBe(true)
  })

  it('recusa tudo o que exigiria conversao para virar dinheiro', () => {
    for (const value of ['120', '120.0', '120.000', '120,00', 'R$ 120,00', '', 120]) {
      expect(moneyString.safeParse(value).success).toBe(false)
    }
  })
})

describe('isoDate e isoDateTime', () => {
  it('separa a data pura da data-hora com deslocamento', () => {
    expect(isoDate.safeParse('2026-09-03').success).toBe(true)
    expect(isoDate.safeParse('2026-09-03T15:00:00-03:00').success).toBe(false)

    expect(isoDateTime.safeParse('2026-09-03T15:00:00-03:00').success).toBe(true)
    expect(isoDateTime.safeParse('2026-09-03T18:00:00.123456Z').success).toBe(true)
    expect(isoDateTime.safeParse('2026-09-03T15:00:00').success).toBe(false)
    expect(isoDateTime.safeParse('2026-09-03').success).toBe(false)
  })
})

describe('paginated', () => {
  it('valida o envelope de listagem e cada item dentro dele', () => {
    const schema = paginated(moneyString)

    expect(schema.safeParse({ count: 1, next: null, previous: null, results: ['10.00'] })).toEqual(
      expect.objectContaining({ success: true }),
    )
    expect(
      schema.safeParse({ count: 1, next: null, previous: null, results: ['dez reais'] }).success,
    ).toBe(false)
    expect(schema.safeParse({ results: [] }).success).toBe(false)
  })
})

describe('decimalString e factorString', () => {
  it('exige exatamente as casas que o DecimalField serializa', () => {
    expect(decimalString(3).safeParse('1.000').success).toBe(true)
    expect(factorString.safeParse('0.5000').success).toBe(true)
    expect(factorString.safeParse('0.2500').success).toBe(true)
  })

  it('recusa a forma curta, a longa e o numero', () => {
    for (const value of ['0.5', '0.50000', '0', 0.5]) {
      expect(factorString.safeParse(value).success).toBe(false)
    }
  })
})

describe('timeHHMM', () => {
  it('aceita a hora com precisao de minuto, como o serializer', () => {
    for (const value of ['14:00', '00:00', '23:59']) {
      expect(timeHHMM.safeParse(value).success).toBe(true)
    }
  })

  it('recusa hora inexistente, segundos e falta de zero a esquerda', () => {
    for (const value of ['24:00', '14:60', '14:00:00', '9:00', '']) {
      expect(timeHHMM.safeParse(value).success).toBe(false)
    }
  })
})

describe('userRefSchema', () => {
  it('descreve o ator de uma escrita', () => {
    expect(userRefSchema.safeParse({ id: 2, username: 'admin' }).success).toBe(true)
    expect(userRefSchema.safeParse({ id: 2 }).success).toBe(false)
  })
})

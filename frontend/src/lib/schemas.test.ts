import { describe, expect, it } from 'vitest'

import { isoDate, isoDateTime, moneyString, paginated } from './schemas'

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

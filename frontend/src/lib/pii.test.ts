import { describe, expect, it } from 'vitest'

import { formatDocument, formatPhone } from './pii'

/**
 * SPEC 6.2 — `lib/pii.test.ts`: mascara de CPF/telefone na exibicao.
 *
 * A API entrega o valor normalizado; o frontend so veste. Passaporte e
 * tamanhos fora do padrao brasileiro saem crus.
 */
describe('formatDocument', () => {
  it('aplica mascara de CPF em 11 digitos', () => {
    expect(formatDocument('12345678901')).toBe('123.456.789-01')
  })

  it('devolve passaporte e demais tamanhos crus', () => {
    expect(formatDocument('AB123456')).toBe('AB123456')
    expect(formatDocument('1234')).toBe('1234')
    expect(formatDocument('123456789012')).toBe('123456789012')
  })
})

describe('formatPhone', () => {
  it('aplica mascara de celular em 11 digitos', () => {
    expect(formatPhone('21988887777')).toBe('(21) 98888-7777')
  })

  it('aplica mascara de fixo em 10 digitos', () => {
    expect(formatPhone('2133334444')).toBe('(21) 3333-4444')
  })

  it('devolve demais tamanhos crus', () => {
    expect(formatPhone('988887777')).toBe('988887777')
    expect(formatPhone('5521988887777')).toBe('5521988887777')
  })
})

import { describe, expect, it } from 'vitest'

import {
  isInternationalPhone,
  normalizeDocument,
  normalizePhone,
  withLeadingPlus,
} from './normalize'

describe('normalizeDocument', () => {
  it('remove pontuacao e mantem os digitos do CPF', () => {
    expect(normalizeDocument('123.456.789-01')).toBe('12345678901')
  })

  it('caixa alta o passaporte alfanumerico', () => {
    expect(normalizeDocument('ab123456')).toBe('AB123456')
  })

  it('normaliza tambem um fragmento de busca mascarado', () => {
    expect(normalizeDocument('789-01')).toBe('78901')
    expect(normalizeDocument('.-/')).toBe('')
  })
})

describe('normalizePhone', () => {
  it('mantem so os digitos do telefone com mascara', () => {
    expect(normalizePhone('(21) 98888-7777')).toBe('21988887777')
    expect(normalizePhone('(21) 98888')).toBe('2198888')
  })
})

describe('withLeadingPlus', () => {
  it('prefixa o mais quando o valor nao tem', () => {
    expect(withLeadingPlus('55 21 98888-7777')).toBe('+55 21 98888-7777')
    expect(withLeadingPlus('  54 11 5555-4444  ')).toBe('+54 11 5555-4444')
  })

  it('nao duplica o mais ja digitado', () => {
    expect(withLeadingPlus('+55 21 98888-7777')).toBe('+55 21 98888-7777')
  })
})

describe('isInternationalPhone', () => {
  it('aceita o numero com codigo do pais e digitos suficientes', () => {
    expect(isInternationalPhone('+55 21 98888-7777')).toBe(true)
    expect(isInternationalPhone('  +54 11 5555-4444  ')).toBe(true)
    expect(isInternationalPhone('55 21 98888-7777')).toBe(true)
  })

  it('recusa o numero sem o codigo do pais', () => {
    expect(isInternationalPhone('(21) 98888-7777')).toBe(false)
    expect(isInternationalPhone('21988887777')).toBe(false)
  })

  it('recusa o numero curto demais para qualquer plano', () => {
    expect(isInternationalPhone('+55 21')).toBe(false)
    expect(isInternationalPhone('55 21')).toBe(false)
  })
})

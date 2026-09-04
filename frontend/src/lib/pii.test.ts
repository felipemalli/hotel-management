import { describe, expect, it } from 'vitest'

import { formatDocument, formatPhone } from './pii'

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
  it('veste o celular brasileiro guardado em E.164', () => {
    expect(formatPhone('5521988887777')).toBe('+55 (21) 98888-7777')
  })

  it('veste o fixo brasileiro de oito digitos', () => {
    expect(formatPhone('552133334444')).toBe('+55 (21) 3333-4444')
  })

  it('veste o plano norte-americano', () => {
    expect(formatPhone('12125550100')).toBe('+1 (212) 555-0100')
  })

  it('agrupa mecanicamente o pais sem mascara conhecida', () => {
    expect(formatPhone('541155554444')).toBe('+5411 5555-4444')
  })

  it('devolve cru o que nao parece um numero E.164', () => {
    expect(formatPhone('+55 21')).toBe('+55 21')
    expect(formatPhone('1234567')).toBe('1234567')
  })
})

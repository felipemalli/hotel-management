import { describe, expect, it } from 'vitest'

import { normalizeDocument, normalizePhone } from './normalize'

describe('normalizeDocument', () => {
  it('remove pontuacao e mantem os digitos do CPF', () => {
    expect(normalizeDocument('123.456.789-01')).toBe('12345678901')
  })

  it('caixa alta o passaporte alfanumerico', () => {
    expect(normalizeDocument('ab123456')).toBe('AB123456')
  })

  it('normaliza tambem um fragmento de busca mascarado', () => {
    expect(normalizeDocument('789-01')).toBe('78901')
  })

  it('devolve vazio quando nao sobra nenhum alfanumerico', () => {
    expect(normalizeDocument('.-/')).toBe('')
  })
})

describe('normalizePhone', () => {
  it('mantem so os digitos do telefone com mascara', () => {
    expect(normalizePhone('(21) 98888-7777')).toBe('21988887777')
  })

  it('normaliza um fragmento de busca com mascara parcial', () => {
    expect(normalizePhone('(21) 98888')).toBe('2198888')
  })
})

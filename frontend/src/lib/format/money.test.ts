import { describe, expect, it } from 'vitest'

import { BILL_TOTALS } from '@/features/reservations/__fixtures__/bills'

import { formatBRL, formatDecimalBR, toDecimalString } from './money'

describe('formatBRL', () => {
  it('veste a string decimal da API sem tocar no valor', () => {
    expect(formatBRL('120.00')).toBe('R$ 120,00')
    expect(formatBRL('1234.50')).toBe('R$ 1.234,50')
    expect(formatBRL('0.00')).toBe('R$ 0,00')
  })

  it('formata todos os totais da tabela de precos sem perder centavos', () => {
    expect(Object.entries(BILL_TOTALS).map(([id, total]) => `${id}=${formatBRL(total)}`)).toEqual([
      'T1=R$ 240,00',
      'T2=R$ 400,00',
      'T3=R$ 535,00',
      'T4=R$ 240,00',
      'T5=R$ 300,00',
      'T6=R$ 300,00',
      'T7=R$ 425,00',
      'T8=R$ 240,00',
      'T9=R$ 195,00',
    ])
  })

  it('agrupa milhares acima de seis digitos, ainda sem aritmetica', () => {
    expect(formatBRL('1234567.89')).toBe('R$ 1.234.567,89')
  })

  it('preserva o sinal negativo e os centavos abaixo de um real', () => {
    expect(formatBRL('-90.00')).toBe('R$ -90,00')
    expect(formatBRL('-1234.56')).toBe('R$ -1.234,56')
    expect(formatBRL('0.50')).toBe('R$ 0,50')
    expect(formatBRL('0.05')).toBe('R$ 0,05')
  })

  it('lanca em vez de exibir um valor plausivel para entrada fora do contrato', () => {
    for (const malformed of ['120', '120.0', '120.000', '120,00', 'R$ 120,00', '', ' 120.00']) {
      expect(() => formatBRL(malformed)).toThrow(TypeError)
    }
  })
})

describe('toDecimalString', () => {
  it('completa as casas de um inteiro digitado', () => {
    expect(toDecimalString('120', 2)).toBe('120.00')
    expect(toDecimalString('0', 4)).toBe('0.0000')
  })

  it('aceita virgula e ponto como separador do balcao', () => {
    expect(toDecimalString('120,5', 2)).toBe('120.50')
    expect(toDecimalString('120.5', 2)).toBe('120.50')
    expect(toDecimalString('120,50', 2)).toBe('120.50')
  })

  it('tolera separador solto no fim e espaco em volta', () => {
    expect(toDecimalString('120.', 2)).toBe('120.00')
    expect(toDecimalString('  15 ', 2)).toBe('15.00')
  })

  it('descarta zeros a esquerda sem comer o proprio zero', () => {
    expect(toDecimalString('0120', 2)).toBe('120.00')
    expect(toDecimalString('0', 2)).toBe('0.00')
  })

  it('preserva o sinal para o formulario recusar com mensagem propria', () => {
    expect(toDecimalString('-90', 2)).toBe('-90.00')
  })

  it('normaliza o fator com quatro casas', () => {
    expect(toDecimalString('0,5', 4)).toBe('0.5000')
    expect(toDecimalString('0.5000', 4)).toBe('0.5000')
    expect(toDecimalString('0,25', 4)).toBe('0.2500')
  })

  it('recusa fracao mais longa que o contrato em vez de arredondar', () => {
    expect(toDecimalString('12.345', 2)).toBeNull()
    expect(toDecimalString('0.50000', 4)).toBeNull()
  })

  it('recusa separador de milhar, porque dois separadores sao ambiguos', () => {
    expect(toDecimalString('1.234,50', 2)).toBeNull()
    expect(toDecimalString('1,234.50', 2)).toBeNull()
    expect(toDecimalString('1 234', 2)).toBeNull()
  })

  it('recusa o que nao e digito com separador', () => {
    expect(toDecimalString('', 2)).toBeNull()
    expect(toDecimalString('abc', 2)).toBeNull()
    expect(toDecimalString('12a', 2)).toBeNull()
    expect(toDecimalString('1e3', 2)).toBeNull()
    expect(toDecimalString('-', 2)).toBeNull()
    expect(toDecimalString('.5', 2)).toBeNull()
    expect(toDecimalString('R$ 120', 2)).toBeNull()
  })

  it('compoe com formatBRL: o que normaliza, formata', () => {
    const normalized = toDecimalString('120,5', 2)
    expect(normalized).not.toBeNull()
    expect(formatBRL(normalized ?? '')).toBe('R$ 120,50')
  })
})

describe('formatDecimalBR', () => {
  it('troca o ponto do contrato pela virgula do balcao', () => {
    expect(formatDecimalBR('0.5000')).toBe('0,5000')
    expect(formatDecimalBR('120.00')).toBe('120,00')
  })

  it('recusa um valor que nao veio do contrato', () => {
    expect(() => formatDecimalBR('0,5')).toThrow(TypeError)
    expect(() => formatDecimalBR('120')).toThrow(TypeError)
  })
})

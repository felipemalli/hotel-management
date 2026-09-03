import { describe, expect, it } from 'vitest'

import { BILL_TOTALS } from '@/features/reservations/__fixtures__/bills'

import { formatBRL } from './money'

describe('formatBRL', () => {
  it('veste a string decimal da API sem tocar no valor', () => {
    expect(formatBRL('120.00')).toBe('R$ 120,00')
    expect(formatBRL('1234.50')).toBe('R$ 1.234,50')
    expect(formatBRL('0.00')).toBe('R$ 0,00')
  })

  it('formata o total de T3 vindo da fixture, e nao de um literal', () => {
    expect(formatBRL('535.00')).toBe('R$ 535,00')
    expect(formatBRL(BILL_TOTALS.T3)).toBe('R$ 535,00')
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
})

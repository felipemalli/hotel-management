import { BILL_TOTALS } from '@/features/reservations/__fixtures__/bills'

import { formatBRL } from './money'

/**
 * SPEC 6.2 — `lib/money.test.ts`: os 3 exemplos da SPEC 5.3 + "535.00" (T3).
 *
 * Invariante SPEC 0.3 vigiado aqui: entra string, sai string. Nenhum caso
 * abaixo pede soma — o valor formatado e sempre o valor recebido, so vestido.
 */
describe('formatBRL', () => {
  it('formata os tres exemplos da SPEC 5.3', () => {
    expect(formatBRL('120.00')).toBe('R$ 120,00')
    expect(formatBRL('1234.50')).toBe('R$ 1.234,50')
    expect(formatBRL('0.00')).toBe('R$ 0,00')
  })

  it('formata o total do caso T3 da tabela SPEC 3.3', () => {
    expect(formatBRL('535.00')).toBe('R$ 535,00')
    // Do fixture, nao do literal: drift na tabela quebra aqui tambem.
    expect(formatBRL(BILL_TOTALS.T3)).toBe('R$ 535,00')
  })

  it('formata todos os totais da tabela SPEC 3.3 sem perder centavos', () => {
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

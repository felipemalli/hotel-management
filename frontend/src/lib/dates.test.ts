import { describe, expect, it } from 'vitest'

import { addDaysISO, formatISODate, formatISODateTime, todayISO } from './dates'

// Fixado aqui, e não deixado ao ambiente: o mesmo teste tem que provar o
// invariante em qualquer máquina, não só na que já roda em UTC-3.
process.env.TZ = 'America/Sao_Paulo'

describe('formatISODate', () => {
  it('nunca desloca o dia: o split literal ignora o construtor de Date', () => {
    // Prova de que o deslocamento é real neste fuso: se `formatISODate` usasse
    // `new Date(value)`, a meia-noite UTC de 01/01 viraria 31/12 aqui.
    expect(new Date('2026-01-01').getDate()).toBe(31)

    expect(formatISODate('2026-01-01')).toBe('01/01/2026')
    expect(formatISODate('2026-12-31')).toBe('31/12/2026')
  })

  it('devolve a entrada intacta quando falta um segmento', () => {
    expect(formatISODate('2026-09')).toBe('2026-09')
    expect(formatISODate('')).toBe('')
  })
})

describe('formatISODateTime', () => {
  it('junta a data já invertida com a hora, sem recalcular nenhuma das duas', () => {
    expect(formatISODateTime('2026-01-01T21:00:00-03:00')).toBe('01/01/2026 21:00')
  })

  it('devolve so a data quando nao ha parte de hora', () => {
    expect(formatISODateTime('2026-01-01')).toBe('01/01/2026')
  })
})

describe('addDaysISO', () => {
  it('atravessa o fim do mes somando um dia', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('atravessa o fim do ano somando um dia', () => {
    expect(addDaysISO('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('soma varios dias dentro do mesmo mes', () => {
    expect(addDaysISO('2026-09-03', 5)).toBe('2026-09-08')
  })

  it('devolve a string original quando falta um segmento da data', () => {
    expect(addDaysISO('2026-09', 3)).toBe('2026-09')
    expect(addDaysISO('2026', 3)).toBe('2026')
    expect(addDaysISO('', 3)).toBe('')
  })
})

describe('todayISO', () => {
  it('formata a data injetada, sem ler o relogio do sistema', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayISO(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

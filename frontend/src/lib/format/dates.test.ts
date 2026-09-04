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
  it('mostra a hora do hotel, e nao a hora que veio na string', () => {
    expect(formatISODateTime('2026-01-01T21:00:00-03:00')).toBe('01/01/2026 21:00')
    expect(formatISODateTime('2026-01-02T00:00:00Z')).toBe('01/01/2026 21:00')
    expect(formatISODateTime('2026-01-02T02:00:00+02:00')).toBe('01/01/2026 21:00')
  })

  it('nao encosta na meia-noite: 00:00 nunca vira 24:00', () => {
    expect(formatISODateTime('2026-01-01T00:00:00-03:00')).toBe('01/01/2026 00:00')
  })

  it('devolve so a data quando nao ha parte de hora', () => {
    expect(formatISODateTime('2026-01-01')).toBe('01/01/2026')
  })

  it('devolve a entrada intacta quando a data-hora nao existe', () => {
    expect(formatISODateTime('2026-01-32T10:00:00-03:00')).toBe('2026-01-32T10:00:00-03:00')
    expect(formatISODateTime('')).toBe('')
  })
})

describe('addDaysISO', () => {
  it('atravessa o fim do mes somando um dia', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDaysISO('2026-09-03', 5)).toBe('2026-09-08')
  })

  it('atravessa o fim do ano somando um dia', () => {
    expect(addDaysISO('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('devolve a string original quando a data nao esta em AAAA-MM-DD', () => {
    expect(addDaysISO('2026-09', 3)).toBe('2026-09')
    expect(addDaysISO('2026', 3)).toBe('2026')
    expect(addDaysISO('', 3)).toBe('')
    expect(addDaysISO('03/09/2026', 3)).toBe('03/09/2026')
  })
})

describe('todayISO', () => {
  it('formata a data injetada, sem ler o relogio do sistema', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayISO(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

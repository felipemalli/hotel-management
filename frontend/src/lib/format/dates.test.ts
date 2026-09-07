import { describe, expect, it } from 'vitest'

import {
  addDaysISO,
  formatISODate,
  formatISODateTime,
  isISODate,
  nowTimeISO,
  todayISO,
} from './dates'

// TZ fixo: o invariante tem de valer em qualquer máquina, não só em UTC-3.
process.env.TZ = 'America/Sao_Paulo'

describe('formatISODate', () => {
  it('nunca desloca o dia: o split literal ignora o construtor de Date', () => {
    // Se usasse `new Date(value)`, a meia-noite UTC de 01/01 viraria 31/12 neste fuso.
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

  // 02:00 UTC do dia 1º ainda é o dia 31 no hotel: o navegador do balcão pode
  // estar em qualquer fuso, e a regra é decidida em hora de São Paulo.
  it('devolve o dia do hotel, e nao o dia do navegador', () => {
    expect(todayISO(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12-31')
    expect(todayISO(new Date('2026-01-01T03:00:00Z'))).toBe('2026-01-01')
  })
})

describe('nowTimeISO', () => {
  it('devolve a hora do hotel com segundos, em h23', () => {
    expect(nowTimeISO(new Date('2026-01-01T02:00:00Z'))).toBe('23:00:00')
    expect(nowTimeISO(new Date('2026-01-01T15:00:01Z'))).toBe('12:00:01')
    expect(nowTimeISO(new Date('2026-01-01T03:00:00Z'))).toBe('00:00:00')
  })
})

describe('isISODate', () => {
  it('aceita a data que existe no calendario', () => {
    expect(isISODate('2026-09-07')).toBe(true)
    expect(isISODate('2024-02-29')).toBe(true)
  })

  it('recusa o dia que nao existe, e nao o normaliza para o mes seguinte', () => {
    expect(isISODate('2026-02-31')).toBe(false)
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('2025-02-29')).toBe(false)
  })

  it('recusa o que nao esta em AAAA-MM-DD', () => {
    expect(isISODate('07/09/2026')).toBe(false)
    expect(isISODate('2026-9-7')).toBe(false)
    expect(isISODate('')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import {
  buildCountryOptions,
  COUNTRY_CODES,
  COUNTRY_OPTIONS,
  countryName,
  isCountryCode,
  type RegionNames,
} from './countries'

// Espelha o fallback do `Intl.DisplayNames` sem depender do ICU da maquina.
const SILENT: RegionNames = { of: () => undefined }

describe('COUNTRY_CODES', () => {
  it('tem os 249 codigos atribuidos, sem repetido e em alpha-2', () => {
    expect(COUNTRY_CODES).toHaveLength(249)
    expect(new Set(COUNTRY_CODES).size).toBe(249)
    expect(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true)
  })
})

describe('isCountryCode', () => {
  it('aceita o codigo da lista e recusa o resto', () => {
    expect(isCountryCode('BR')).toBe(true)
    expect(isCountryCode('AR')).toBe(true)
    expect(isCountryCode('ZZ')).toBe(false)
    expect(isCountryCode('br')).toBe(false)
    expect(isCountryCode('')).toBe(false)
  })
})

describe('countryName', () => {
  it('traduz o codigo conhecido para portugues', () => {
    expect(countryName('BR')).toBe('Brasil')
    expect(countryName('AR')).toBe('Argentina')
  })

  it('devolve o proprio codigo quando ele nao esta na lista', () => {
    expect(countryName('ZZ')).toBe('ZZ')
  })

  it('devolve o codigo quando o ICU nao conhece a regiao', () => {
    expect(countryName('AR', SILENT)).toBe('AR')
  })
})

describe('buildCountryOptions', () => {
  it('coloca o Brasil primeiro e ordena o resto pelo nome', () => {
    const options = buildCountryOptions()
    const [first] = options

    expect(first).toEqual({ code: 'BR', name: 'Brasil' })
    expect(options).toHaveLength(249)

    const names = options.slice(1).map((option) => option.name)
    expect(names).toEqual([...names].sort(new Intl.Collator('pt-BR').compare))
  })

  it('cai no codigo como nome quando o ICU nao responde', () => {
    const options = buildCountryOptions(SILENT)
    expect(options.every((option) => option.name === option.code)).toBe(true)
  })

  it('expoe a lista pronta usada pelo formulario', () => {
    expect(COUNTRY_OPTIONS).toHaveLength(249)
  })
})

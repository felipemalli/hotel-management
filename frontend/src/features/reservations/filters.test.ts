import { describe, expect, it } from 'vitest'

import {
  DEFAULT_FILTERS,
  parseReservationFilters,
  parseReservationId,
  toListParams,
  toSearchParams,
} from './filters'

function parse(query: string) {
  return parseReservationFilters(new URLSearchParams(query))
}

describe('parseReservationFilters', () => {
  it('devolve os padroes sem parametro nenhum', () => {
    expect(parse('')).toEqual(DEFAULT_FILTERS)
  })

  it('le o status que o contrato conhece', () => {
    expect(parse('status=CHECKED_IN').status).toBe('CHECKED_IN')
  })

  it('ignora em silencio o status que nao existe', () => {
    expect(parse('status=NO_SHOW').status).toBeNull()
  })

  // No servidor `paid=false` casa toda PENDING, CHECKED_IN e CANCELLED: fora de
  // uma conta fechada o filtro diria uma coisa por outra.
  it('so aceita o filtro de pagamento sobre conta fechada', () => {
    expect(parse('paid=true').paid).toBeNull()
    expect(parse('status=PENDING&paid=false').paid).toBeNull()
    expect(parse('status=CHECKED_OUT&paid=false').paid).toBe(false)
    expect(parse('status=CHECKED_OUT&paid=true').paid).toBe(true)
    expect(parse('status=CHECKED_OUT&paid=talvez').paid).toBeNull()
  })

  // O parsing de página em si (formato inválido, zero) já é provado por
  // `pageFromSearchParams`; aqui só se confirma que o valor chega ao filtro.
  it('repassa a pagina para pageFromSearchParams', () => {
    expect(parse('page=2').page).toBe(2)
  })
})

describe('toSearchParams', () => {
  it('omite os padroes, para a URL limpa continuar sendo a URL da lista', () => {
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe('')
  })

  it('escreve o que foge do padrao', () => {
    expect(toSearchParams({ status: 'CHECKED_OUT', paid: false, page: 3 }).toString()).toBe(
      'status=CHECKED_OUT&paid=false&page=3',
    )
  })
})

describe('toListParams', () => {
  it('manda ao servidor so o que foi escolhido', () => {
    expect(toListParams(DEFAULT_FILTERS)).toEqual({})
    expect(toListParams({ status: 'PENDING', paid: null, page: 1 })).toEqual({ status: 'PENDING' })
    expect(toListParams({ status: 'CHECKED_OUT', paid: true, page: 2 })).toEqual({
      status: 'CHECKED_OUT',
      paid: true,
      page: 2,
    })
  })
})

describe('parseReservationId', () => {
  it('aceita id positivo e recusa o resto sem chamar a API', () => {
    expect(parseReservationId('7')).toBe(7)
    expect(parseReservationId('abc')).toBeNull()
    expect(parseReservationId('0')).toBeNull()
    expect(parseReservationId('-1')).toBeNull()
    expect(parseReservationId(undefined)).toBeNull()
  })
})

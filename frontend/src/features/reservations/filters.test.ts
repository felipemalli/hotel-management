import { describe, expect, it } from 'vitest'

import {
  DEFAULT_FILTERS,
  nextOrdering,
  parseReservationFilters,
  parseReservationId,
  sortDirectionOf,
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

  // No servidor `paid=false` casa PENDING/CHECKED_IN/CANCELLED; o filtro mentiria.
  it('so aceita o filtro de pagamento sobre conta fechada', () => {
    expect(parse('paid=true').paid).toBeNull()
    expect(parse('status=PENDING&paid=false').paid).toBeNull()
    expect(parse('status=CHECKED_OUT&paid=false').paid).toBe(false)
    expect(parse('status=CHECKED_OUT&paid=true').paid).toBe(true)
    expect(parse('status=CHECKED_OUT&paid=talvez').paid).toBeNull()
  })

  it('repassa a pagina para pageFromSearchParams', () => {
    expect(parse('page=2').page).toBe(2)
  })

  it('le o termo de busca, com o parametro q', () => {
    expect(parse('q=ana').search).toBe('ana')
    expect(parse('').search).toBe('')
  })

  it('le hoje e uma data escolhida nos dois filtros de estadia', () => {
    expect(parse('checkin=today').checkinDate).toBe('today')
    expect(parse('checkout=today').checkoutDate).toBe('today')
    expect(parse('checkin=2026-09-07').checkinDate).toBe('2026-09-07')
    expect(parse('checkout=2026-09-07').checkoutDate).toBe('2026-09-07')
  })

  // 2026-02-31 casa o formato e o servidor responderia 400.
  it('ignora data mal formada ou inexistente no calendario', () => {
    expect(parse('checkin=ontem').checkinDate).toBeNull()
    expect(parse('checkin=07/09/2026').checkinDate).toBeNull()
    expect(parse('checkout=2026-02-31').checkoutDate).toBeNull()
  })

  it('le a ordenacao que o servidor conhece e ignora o resto', () => {
    expect(parse('ordering=-checkout_date').ordering).toBe('-checkout_date')
    expect(parse('ordering=checkin_date').ordering).toBe('checkin_date')
    expect(parse('ordering=guest').ordering).toBeNull()
  })
})

describe('toSearchParams', () => {
  it('omite os padroes, para a URL limpa continuar sendo a URL da lista', () => {
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe('')
  })

  it('escreve o que foge do padrao', () => {
    expect(
      toSearchParams({
        ...DEFAULT_FILTERS,
        status: 'CHECKED_OUT',
        paid: false,
        page: 3,
      }).toString(),
    ).toBe('status=CHECKED_OUT&paid=false&page=3')
    expect(toSearchParams({ ...DEFAULT_FILTERS, search: 'ana' }).toString()).toBe('q=ana')
  })

  // 'hoje' na URL continua valendo amanha; a data resolvida envelheceria.
  it('guarda hoje como hoje, e nao como a data de hoje', () => {
    expect(
      toSearchParams({
        ...DEFAULT_FILTERS,
        checkoutDate: 'today',
        ordering: '-checkin_date',
      }).toString(),
    ).toBe('checkout=today&ordering=-checkin_date')
  })
})

describe('toListParams', () => {
  const TODAY = '2026-09-07'

  it('manda ao servidor so o que foi escolhido', () => {
    expect(toListParams(DEFAULT_FILTERS, TODAY)).toEqual({})
    expect(toListParams({ ...DEFAULT_FILTERS, status: 'PENDING' }, TODAY)).toEqual({
      status: 'PENDING',
    })
    expect(
      toListParams({ ...DEFAULT_FILTERS, status: 'CHECKED_OUT', paid: true, page: 2 }, TODAY),
    ).toEqual({ status: 'CHECKED_OUT', paid: true, page: 2 })
    expect(toListParams({ ...DEFAULT_FILTERS, search: '  ana  ' }, TODAY)).toEqual({
      search: 'ana',
    })
  })

  it('resolve hoje pelo relogio recebido, e repassa a data escolhida', () => {
    expect(toListParams({ ...DEFAULT_FILTERS, checkoutDate: 'today' }, TODAY)).toEqual({
      checkout_date: TODAY,
    })
    expect(toListParams({ ...DEFAULT_FILTERS, checkinDate: '2026-09-10' }, TODAY)).toEqual({
      checkin_date: '2026-09-10',
    })
    expect(toListParams({ ...DEFAULT_FILTERS, ordering: 'checkout_date' }, TODAY)).toEqual({
      ordering: 'checkout_date',
    })
  })
})

describe('sortDirectionOf', () => {
  it('so reconhece a coluna que esta ordenando', () => {
    expect(sortDirectionOf('checkin_date', 'checkin_date')).toBe('ascending')
    expect(sortDirectionOf('-checkin_date', 'checkin_date')).toBe('descending')
    expect(sortDirectionOf('-checkin_date', 'checkout_date')).toBe('none')
    expect(sortDirectionOf(null, 'checkin_date')).toBe('none')
  })
})

describe('nextOrdering', () => {
  it('cicla crescente, decrescente e volta ao padrao do servidor', () => {
    expect(nextOrdering(null, 'checkout_date')).toBe('checkout_date')
    expect(nextOrdering('checkout_date', 'checkout_date')).toBe('-checkout_date')
    expect(nextOrdering('-checkout_date', 'checkout_date')).toBeNull()
  })

  it('trocar de coluna comeca crescente de novo', () => {
    expect(nextOrdering('-checkin_date', 'checkout_date')).toBe('checkout_date')
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

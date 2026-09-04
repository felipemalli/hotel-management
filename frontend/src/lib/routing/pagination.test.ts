import { describe, expect, it } from 'vitest'

import { pageFromSearchParams, withPage } from './pagination'

describe('pageFromSearchParams', () => {
  it('devolve a primeira pagina sem o parametro', () => {
    expect(pageFromSearchParams(new URLSearchParams())).toBe(1)
  })

  it('le o numero declarado', () => {
    expect(pageFromSearchParams(new URLSearchParams('page=3'))).toBe(3)
  })

  it('cai na primeira pagina para valor fora do formato', () => {
    expect(pageFromSearchParams(new URLSearchParams('page=abc'))).toBe(1)
    expect(pageFromSearchParams(new URLSearchParams('page=-2'))).toBe(1)
    expect(pageFromSearchParams(new URLSearchParams('page=1.5'))).toBe(1)
    expect(pageFromSearchParams(new URLSearchParams('page=0'))).toBe(1)
  })
})

describe('withPage', () => {
  it('omite a primeira pagina da URL', () => {
    expect(withPage(new URLSearchParams('page=4'), 1).toString()).toBe('')
  })

  it('escreve as demais e preserva os outros parametros', () => {
    expect(withPage(new URLSearchParams('is_active=false'), 2).toString()).toBe(
      'is_active=false&page=2',
    )
  })

  it('nao muta o parametro recebido', () => {
    const params = new URLSearchParams('page=2')
    withPage(params, 5)
    expect(params.get('page')).toBe('2')
  })
})

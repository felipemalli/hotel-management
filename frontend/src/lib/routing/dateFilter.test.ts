import { describe, expect, it } from 'vitest'

import { parseDateFilter, resolveDateFilter, TODAY } from './dateFilter'

describe('parseDateFilter', () => {
  it('aceita hoje e a data do calendario', () => {
    expect(parseDateFilter('today')).toBe(TODAY)
    expect(parseDateFilter('2026-09-07')).toBe('2026-09-07')
  })

  it('cai no vazio no que o servidor recusaria', () => {
    expect(parseDateFilter('hoje')).toBeNull()
    expect(parseDateFilter('2026-02-31')).toBeNull()
    expect(parseDateFilter(null)).toBeNull()
  })
})

describe('resolveDateFilter', () => {
  it('troca hoje pelo relogio recebido e deixa a data escolhida passar', () => {
    expect(resolveDateFilter(TODAY, '2026-09-07')).toBe('2026-09-07')
    expect(resolveDateFilter('2026-09-10', '2026-09-07')).toBe('2026-09-10')
    expect(resolveDateFilter(null, '2026-09-07')).toBeNull()
  })
})

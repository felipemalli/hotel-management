import { describe, expect, it } from 'vitest'

import { ROUTES } from './routes'

describe('ROUTES', () => {
  it('monta o caminho do detalhe a partir do id', () => {
    expect(ROUTES.reservation(7)).toBe('/reservas/7')
  })

  it('mantem as rotas em portugues, como a barra de endereco mostra', () => {
    expect(ROUTES.reservations).toBe('/reservas')
    expect(ROUTES.rooms).toBe('/quartos')
    expect(ROUTES.pricing).toBe('/tarifas')
  })
})

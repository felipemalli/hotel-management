import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  ALL_RESERVATIONS,
  BRUNO_CHECKED_IN,
  CARLA_CHECKED_OUT,
} from '@/features/reservations/__fixtures__/reservations'
import { elementAt } from '@/test/fixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ReservationTable } from './ReservationTable'

function renderTable(reservations = ALL_RESERVATIONS): void {
  renderWithProviders(<ReservationTable reservations={reservations} />, { route: '/reservas' })
}

// As linhas de dado, sem o cabecalho.
function dataRows() {
  return within(screen.getByRole('table', { name: 'Reservas' }))
    .getAllByRole('row')
    .slice(1)
}

describe('ReservationTable', () => {
  it('mostra quarto, estadia, status e pessoas de cada reserva', () => {
    renderTable([BRUNO_CHECKED_IN])
    const row = elementAt(dataRows(), 0)

    expect(within(row).getByText('#2')).toBeInTheDocument()
    expect(within(row).getByText('102')).toBeInTheDocument()
    expect(within(row).getByText('03/09/2026 → 05/09/2026')).toBeInTheDocument()
    expect(within(row).getByText('No hotel')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
  })

  // Sem checkout nao ha conta: o total e o pagamento sao travessoes, e nao
  // "R$ 0,00" ou "em aberto", que sugeririam cobranca.
  it('nao inventa conta para reserva que ainda nao fechou', () => {
    renderTable(ALL_RESERVATIONS)
    const pending = elementAt(dataRows(), 0)

    expect(within(pending).getAllByText('—')).toHaveLength(2)
  })

  it('mostra o total congelado e o estado da conta fechada', () => {
    renderTable([CARLA_CHECKED_OUT])
    const row = elementAt(dataRows(), 0)

    expect(within(row).getByText('R$ 425,00')).toBeInTheDocument()
    expect(within(row).getByText('Em aberto')).toBeInTheDocument()
  })

  it('leva ao detalhe por um link com nome acessivel proprio', () => {
    renderTable([CARLA_CHECKED_OUT])

    expect(screen.getByRole('link', { name: 'Detalhes da reserva #3' })).toHaveAttribute(
      'href',
      '/reservas/3',
    )
  })
})

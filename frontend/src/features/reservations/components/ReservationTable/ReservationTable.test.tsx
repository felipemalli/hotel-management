import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  ALL_RESERVATIONS,
  BRUNO_CHECKED_IN,
  CARLA_CHECKED_OUT,
} from '@/features/reservations/__fixtures__/reservations'
import type { CheckoutClock } from '@/features/reservations/status'
import { elementAt } from '@/test/fixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

import type { ReservationTableProps } from './ReservationTable'
import { ReservationTable } from './ReservationTable'

// Bruno sai em 05/09/2026, e o limite da politica de demonstracao e 12:00.
function clockAt(time: string): CheckoutClock {
  return { today: BRUNO_CHECKED_IN.checkout_date, time, checkoutLimit: '12:00' }
}

function renderTable(props: Partial<ReservationTableProps> = {}): void {
  renderWithProviders(<ReservationTable reservations={ALL_RESERVATIONS} {...props} />, {
    route: '/reservas',
  })
}

function dataRows() {
  return within(screen.getByRole('table', { name: 'Reservas' }))
    .getAllByRole('row')
    .slice(1)
}

describe('ReservationTable', () => {
  it('mostra quarto, entrada, saida, status e pessoas de cada reserva', () => {
    renderTable({ reservations: [BRUNO_CHECKED_IN] })
    const row = elementAt(dataRows(), 0)

    expect(within(row).getByText('#2')).toBeInTheDocument()
    expect(within(row).getByText('102')).toBeInTheDocument()
    expect(within(row).getByText('03/09/2026')).toBeInTheDocument()
    expect(within(row).getByText('05/09/2026')).toBeInTheDocument()
    expect(within(row).getByText('No hotel')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
  })

  // Sem checkout não há conta: "—" e não "R$ 0,00"/"em aberto", que sugeririam cobrança.
  it('nao inventa conta para reserva que ainda nao fechou', () => {
    renderTable()
    const pending = elementAt(dataRows(), 0)

    expect(within(pending).getAllByText('—')).toHaveLength(2)
  })

  it('mostra o total congelado e o estado da conta fechada', () => {
    renderTable({ reservations: [CARLA_CHECKED_OUT] })
    const row = elementAt(dataRows(), 0)

    expect(within(row).getByText('R$ 425,00')).toBeInTheDocument()
    expect(within(row).getByText('Em aberto')).toBeInTheDocument()
  })

  it('leva ao detalhe por um link com nome acessivel proprio', () => {
    renderTable({ reservations: [CARLA_CHECKED_OUT] })

    expect(screen.getByRole('link', { name: 'Detalhes da reserva #3' })).toHaveAttribute(
      'href',
      '/reservas/3',
    )
  })

  it('pede ao servidor a proxima ordenacao da coluna clicada', async () => {
    const user = userEvent.setup()
    const onOrderingChange = vi.fn()
    renderTable({ ordering: 'checkout_date', onOrderingChange })

    await user.click(screen.getByRole('button', { name: /^Saída/ }))

    expect(onOrderingChange).toHaveBeenCalledWith('-checkout_date')
  })

  it('anuncia no cabecalho qual coluna esta ordenando', () => {
    renderTable({ ordering: '-checkin_date' })
    const table = screen.getByRole('table', { name: 'Reservas' })

    expect(within(table).getByRole('columnheader', { name: /^Entrada/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(within(table).getByRole('columnheader', { name: /^Saída/ })).toHaveAttribute(
      'aria-sort',
      'none',
    )
  })

  it('avisa quem sai hoje, e acusa o atraso depois do limite de checkout', () => {
    renderTable({ reservations: [BRUNO_CHECKED_IN], clock: clockAt('09:00:00') })
    expect(screen.getByText('Sai hoje')).toBeInTheDocument()

    renderTable({ reservations: [BRUNO_CHECKED_IN], clock: clockAt('12:30:00') })
    expect(screen.getByText('Saída atrasada')).toBeInTheDocument()
  })

  it('nao avisa nada sem relogio nem politica vigente', () => {
    renderTable({ reservations: [BRUNO_CHECKED_IN] })

    expect(screen.queryByText('Sai hoje')).not.toBeInTheDocument()
    expect(screen.queryByText('Saída atrasada')).not.toBeInTheDocument()
  })
})

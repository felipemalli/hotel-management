import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import {
  ALL_RESERVATIONS,
  CARLA_CHECKED_OUT,
} from '@/features/reservations/__fixtures__/reservations'
import { fetchReservations } from '@/features/reservations/api'
import { ApiError } from '@/lib/errors/errors'
import { ROUTES } from '@/lib/routing/routes'
import { page } from '@/test/fixtures'
import { renderPage } from '@/test/renderPage'
import { signInForTest } from '@/test/renderWithProviders'

import { ReservationsPage } from './ReservationsPage'

vi.mock('@/features/reservations/api')
vi.mock('@/features/auth/api')

function renderReservations(route: string = ROUTES.reservations) {
  signInForTest()
  return renderPage(<ReservationsPage />, { route, path: ROUTES.reservations })
}

describe('ReservationsPage', () => {
  beforeEach(() => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(ATTENDANT)
    vi.mocked(fetchReservations).mockResolvedValue(page(ALL_RESERVATIONS))
  })

  it('lista as reservas e anuncia a contagem', async () => {
    renderReservations()

    expect(await screen.findByRole('table', { name: 'Reservas' })).toBeInTheDocument()
    expect(fetchReservations).toHaveBeenCalledWith({})
    expect(screen.getByText('4 reservas encontradas')).toBeInTheDocument()
  })

  // A URL é a fonte: recarregar e compartilhar preservam a consulta.
  it('le os filtros da URL e os manda ao servidor', async () => {
    renderReservations(`${ROUTES.reservations}?status=CHECKED_OUT&paid=false`)

    await waitFor(() =>
      expect(fetchReservations).toHaveBeenCalledWith({ status: 'CHECKED_OUT', paid: false }),
    )
    expect(screen.getByLabelText('Status')).toHaveValue('CHECKED_OUT')
    expect(screen.getByLabelText('Pagamento')).toHaveValue('false')
  })

  // Fora de uma conta fechada o filtro de pagamento mentiria: no servidor
  // `paid=false` casa toda reserva que ainda não pagou porque nem fechou.
  it('so oferece o filtro de pagamento sobre conta fechada, e o descarta ao sair', async () => {
    const user = userEvent.setup()
    renderReservations(`${ROUTES.reservations}?status=CHECKED_OUT&paid=true`)
    await screen.findByLabelText('Pagamento')

    await user.selectOptions(screen.getByLabelText('Status'), 'PENDING')

    await waitFor(() => expect(screen.queryByLabelText('Pagamento')).not.toBeInTheDocument())
    expect(vi.mocked(fetchReservations).mock.lastCall?.[0]).toEqual({ status: 'PENDING' })
  })

  it('avanca de pagina pelo que o servidor disse existir', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchReservations).mockResolvedValue({
      count: 25,
      next: 'http://localhost/api/reservations/?page=2',
      previous: null,
      results: ALL_RESERVATIONS,
    })
    renderReservations()
    await screen.findByRole('table', { name: 'Reservas' })

    await user.click(screen.getByRole('button', { name: 'Próxima' }))

    await waitFor(() => expect(fetchReservations).toHaveBeenLastCalledWith({ page: 2 }))
  })

  it('mostra o vazio quando o filtro nao acha nada', async () => {
    vi.mocked(fetchReservations).mockResolvedValue(page([]))
    renderReservations()

    expect(await screen.findByText('Nenhuma reserva encontrada')).toBeInTheDocument()
  })

  // Página fora do intervalo responde 404: insistir nela daria o mesmo 404, e
  // por isso o retry volta à primeira.
  it('volta a primeira pagina quando a atual nao existe mais', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchReservations).mockRejectedValueOnce(
      new ApiError({ code: 'NOT_FOUND', detail: 'Página inválida.', status: 404 }),
    )
    renderReservations(`${ROUTES.reservations}?page=9`)

    await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }))

    await waitFor(() => expect(fetchReservations).toHaveBeenLastCalledWith({}))
  })

  it('destaca a conta em aberto da estadia encerrada', async () => {
    vi.mocked(fetchReservations).mockResolvedValue(page([CARLA_CHECKED_OUT]))
    renderReservations()

    const table = await screen.findByRole('table', { name: 'Reservas' })
    expect(within(table).getByText('R$ 425,00')).toBeInTheDocument()
    expect(within(table).getByText('Em aberto')).toBeInTheDocument()
  })
})

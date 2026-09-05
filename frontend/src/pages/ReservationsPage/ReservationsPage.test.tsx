import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import {
  ALL_RESERVATIONS,
  CARLA_CHECKED_OUT,
} from '@/features/reservations/__fixtures__/reservations'
import { fetchReservations } from '@/features/reservations/api'
import { RESERVATION_STATUS_LABELS } from '@/features/reservations/status'
import { ApiError } from '@/lib/errors/errors'
import { SEARCH_DEBOUNCE_MS } from '@/lib/hooks/useDebouncedValue'
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

  // Select do Base UI não abre em jsdom (floating-ui); ver src/test/setup.ts.
  it('le os filtros da URL e os manda ao servidor', async () => {
    renderReservations(`${ROUTES.reservations}?status=CHECKED_OUT&paid=false`)

    await waitFor(() =>
      expect(fetchReservations).toHaveBeenCalledWith({ status: 'CHECKED_OUT', paid: false }),
    )
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent(
      RESERVATION_STATUS_LABELS.CHECKED_OUT,
    )
    expect(screen.getByRole('combobox', { name: 'Pagamento' })).toHaveTextContent('Em aberto')
  })

  it('mostra o filtro de pagamento sobre conta fechada', async () => {
    renderReservations(`${ROUTES.reservations}?status=CHECKED_OUT&paid=true`)
    expect(await screen.findByRole('combobox', { name: 'Pagamento' })).toBeInTheDocument()
  })

  it('omite o filtro de pagamento fora de conta fechada', async () => {
    renderReservations(`${ROUTES.reservations}?status=PENDING`)
    await waitFor(() => expect(fetchReservations).toHaveBeenLastCalledWith({ status: 'PENDING' }))
    expect(screen.queryByRole('combobox', { name: 'Pagamento' })).not.toBeInTheDocument()
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

  it('busca por reserva, hospede ou quarto no servidor, com debounce', async () => {
    vi.useFakeTimers()
    try {
      renderReservations()
      await advanceTimersAndFlush(0)
      expect(fetchReservations).toHaveBeenLastCalledWith({})

      fireEvent.change(screen.getByLabelText('Buscar reserva'), { target: { value: '#8' } })
      await advanceTimersAndFlush(SEARCH_DEBOUNCE_MS - 1)
      expect(fetchReservations).toHaveBeenCalledTimes(1)

      await advanceTimersAndFlush(1)
      expect(fetchReservations).toHaveBeenLastCalledWith({ search: '#8' })
    } finally {
      vi.useRealTimers()
    }
  })
})

// `waitFor` do RTL não reconhece fake timers do vitest (procura o global `jest`).
// `advanceTimersByTimeAsync` resolve o `queryFn`; `act` entrega o re-render.
async function advanceTimersAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

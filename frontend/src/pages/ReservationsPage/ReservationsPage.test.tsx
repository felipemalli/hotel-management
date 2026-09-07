import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import { BOOTSTRAP_POLICY } from '@/features/pricing/__fixtures__/policies'
import { fetchCurrentPolicy } from '@/features/pricing/api'
import {
  ALL_RESERVATIONS,
  BRUNO_CHECKED_IN,
  CARLA_CHECKED_OUT,
  reservation,
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
vi.mock('@/features/pricing/api')
vi.mock('@/features/auth/api')

// 05/09/2026 10:00 em São Paulo. Só o Date é falso: os timers do userEvent
// continuam reais.
const MORNING = '2026-09-05T13:00:00Z'
const AFTER_LIMIT = '2026-09-05T15:30:00Z'

function freezeHotelClock(instant: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(instant))
}

function renderReservations(route: string = ROUTES.reservations) {
  signInForTest()
  return renderPage(<ReservationsPage />, { route, path: ROUTES.reservations })
}

describe('ReservationsPage', () => {
  beforeEach(() => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(ATTENDANT)
    vi.mocked(fetchReservations).mockResolvedValue(page(ALL_RESERVATIONS))
    vi.mocked(fetchCurrentPolicy).mockResolvedValue(BOOTSTRAP_POLICY)
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('resolve o preset hoje na data do hotel antes de consultar', async () => {
    freezeHotelClock(MORNING)
    renderReservations(`${ROUTES.reservations}?checkout=today`)

    await waitFor(() =>
      expect(fetchReservations).toHaveBeenCalledWith({ checkout_date: '2026-09-05' }),
    )
  })

  it('manda ao servidor a data escolhida e a ordenacao lidas da URL', async () => {
    renderReservations(`${ROUTES.reservations}?checkin=2026-09-10&ordering=-checkout_date`)

    await waitFor(() =>
      expect(fetchReservations).toHaveBeenCalledWith({
        checkin_date: '2026-09-10',
        ordering: '-checkout_date',
      }),
    )
  })

  it('filtra pela saida de hoje pelo botao do proprio campo', async () => {
    freezeHotelClock(MORNING)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderReservations()
    await screen.findByRole('table', { name: 'Reservas' })

    await user.click(screen.getByRole('button', { name: 'Hoje em saída' }))

    await waitFor(() =>
      expect(fetchReservations).toHaveBeenLastCalledWith({ checkout_date: '2026-09-05' }),
    )
  })

  it('ordena no servidor ao clicar no cabecalho da coluna', async () => {
    const user = userEvent.setup()
    renderReservations()
    await screen.findByRole('table', { name: 'Reservas' })

    await user.click(screen.getByRole('button', { name: /^Saída/ }))

    await waitFor(() =>
      expect(fetchReservations).toHaveBeenLastCalledWith({ ordering: 'checkout_date' }),
    )
  })

  it('alerta a saida de hoje e a acusa de atrasada depois do limite da politica', async () => {
    const leavingToday = reservation({ ...BRUNO_CHECKED_IN, checkout_date: '2026-09-05' })
    vi.mocked(fetchReservations).mockResolvedValue(page([leavingToday]))

    freezeHotelClock(MORNING)
    const { unmount } = renderReservations()
    expect(await screen.findByText('Sai hoje')).toBeInTheDocument()
    unmount()

    freezeHotelClock(AFTER_LIMIT)
    renderReservations()
    expect(await screen.findByText('Saída atrasada')).toBeInTheDocument()
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

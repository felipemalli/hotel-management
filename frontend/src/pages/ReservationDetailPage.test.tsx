import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import { BRUNO, CARLA } from '@/features/guests/__fixtures__/guests'
import { fetchGuest } from '@/features/guests/api'
import { T7_STATEMENT } from '@/features/reservations/__fixtures__/bills'
import {
  ANA_CANCELLED,
  ANA_PENDING,
  BRUNO_CHECKED_IN,
  CARLA_CHECKED_OUT,
  CARLA_PAID,
} from '@/features/reservations/__fixtures__/reservations'
import {
  cancelReservation,
  checkOut,
  fetchReservation,
  fetchReservationStatement,
} from '@/features/reservations/api'
import type { Reservation } from '@/features/reservations/types'
import { ApiError } from '@/lib/errors/errors'
import { toastStore } from '@/lib/notify/toast'
import { renderPage } from '@/test/renderPage'
import { signInForTest } from '@/test/renderWithProviders'

import { ReservationDetailPage } from './ReservationDetailPage'

vi.mock('@/features/reservations/api')
vi.mock('@/features/guests/api')
vi.mock('@/features/auth/api')

function renderDetail(reservation: Reservation, id = reservation.id) {
  vi.mocked(fetchReservation).mockResolvedValue(reservation)
  signInForTest()
  return renderPage(<ReservationDetailPage />, {
    route: `/reservas/${String(id)}`,
    path: '/reservas/:id',
  })
}

describe('ReservationDetailPage', () => {
  beforeEach(() => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(ATTENDANT)
    vi.mocked(fetchGuest).mockResolvedValue(BRUNO)
    vi.mocked(fetchReservationStatement).mockResolvedValue(T7_STATEMENT)
  })

  it('mostra hospedagem, pessoas e historico da estadia', async () => {
    renderDetail(BRUNO_CHECKED_IN)

    expect(await screen.findByRole('heading', { name: 'Reserva #2' })).toBeInTheDocument()
    expect(screen.getByText('No hotel')).toBeInTheDocument()

    const stay = screen.getByRole('region', { name: 'Hospedagem' })
    expect(within(stay).getByText('102')).toBeInTheDocument()
    expect(within(stay).getByText('Política #1')).toBeInTheDocument()

    const people = screen.getByRole('region', { name: 'Pessoas' })
    expect(await within(people).findByText(/Bruno Lima/)).toBeInTheDocument()
    expect(within(people).getByText('Eva Lima')).toBeInTheDocument()

    const history = screen.getByRole('region', { name: 'Histórico' })
    expect(
      within(history).getByText(/Check-in em 03\/09\/2026 15:00 por atendente/),
    ).toBeInTheDocument()
  })

  it('diz quando a reserva nao tem acompanhante', async () => {
    renderDetail(ANA_PENDING)

    const people = await screen.findByRole('region', { name: 'Pessoas' })
    expect(within(people).getByText('Sem acompanhantes')).toBeInTheDocument()
  })

  // Id que nao e numero nem chega a virar requisicao.
  it('nao consulta a API para um id que nao e reserva', async () => {
    signInForTest()
    renderPage(<ReservationDetailPage />, { route: '/reservas/abc', path: '/reservas/:id' })

    expect(await screen.findByText('Reserva não encontrada')).toBeInTheDocument()
    expect(fetchReservation).not.toHaveBeenCalled()
  })

  it('mostra o mesmo estado quando o servidor responde 404', async () => {
    vi.mocked(fetchReservation).mockRejectedValue(
      new ApiError({ code: 'NOT_FOUND', detail: 'Não encontrada.', status: 404 }),
    )
    signInForTest()
    renderPage(<ReservationDetailPage />, { route: '/reservas/99', path: '/reservas/:id' })

    expect(await screen.findByText('Reserva não encontrada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar às reservas' })).toBeInTheDocument()
  })

  it('mostra a conta congelada e a 2a via da estadia encerrada', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchGuest).mockResolvedValue(CARLA)
    renderDetail(CARLA_CHECKED_OUT)

    const account = await screen.findByRole('region', { name: 'Conta' })
    expect(within(account).getByText('R$ 425,00')).toBeInTheDocument()
    expect(within(account).getByText('R$ 90,00 (base R$ 180,00)')).toBeInTheDocument()
    expect(within(account).getByText('Em aberto')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ver extrato' }))

    expect(await screen.findByRole('dialog', { name: 'Extrato de checkout' })).toBeInTheDocument()
    expect(fetchReservationStatement).toHaveBeenCalledWith(CARLA_CHECKED_OUT.id)
  })

  it('mostra a forma e o ator do pagamento da conta paga', async () => {
    vi.mocked(fetchGuest).mockResolvedValue(CARLA)
    renderDetail(CARLA_PAID)

    const account = await screen.findByRole('region', { name: 'Conta' })
    expect(within(account).getByText('Pix · por atendente')).toBeInTheDocument()
  })

  it('cancela a reserva pendente e devolve o foco ao conteudo', async () => {
    const user = userEvent.setup()
    vi.mocked(cancelReservation).mockResolvedValue(ANA_CANCELLED)
    renderDetail(ANA_PENDING)

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Cancelar reserva' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar reserva' }))

    await waitFor(() => expect(cancelReservation).toHaveBeenCalledWith(ANA_PENDING.id))
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
    expect(toastStore.getSnapshot()).toEqual([expect.objectContaining({ tone: 'success' })])
  })

  // O POST do checkout ja devolveu o extrato: a 2a via abre do cache.
  it('abre o extrato do checkout sem buscar de novo', async () => {
    const user = userEvent.setup()
    // O servidor devolve o extrato DESTA reserva: é o `reservation_id` dele que
    // semeia a chave que a 2ª via lê.
    vi.mocked(checkOut).mockResolvedValue({
      ...T7_STATEMENT,
      reservation_id: BRUNO_CHECKED_IN.id,
    })
    renderDetail(BRUNO_CHECKED_IN)

    await user.click(await screen.findByRole('button', { name: 'Checkout' }))

    expect(await screen.findByRole('dialog', { name: 'Extrato de checkout' })).toBeInTheDocument()
    expect(fetchReservationStatement).not.toHaveBeenCalled()
  })

  it('nao oferece acao para a reserva cancelada', async () => {
    renderDetail(ANA_CANCELLED)

    expect(
      await screen.findByText('Reserva cancelada — nenhuma ação disponível.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check-in' })).not.toBeInTheDocument()
  })

  it('mostra a falha do titular so na secao Pessoas', async () => {
    vi.mocked(fetchGuest).mockRejectedValue(
      new ApiError({ code: 'NETWORK_ERROR', detail: 'sem rede', status: 0 }),
    )
    renderDetail(BRUNO_CHECKED_IN)

    const people = await screen.findByRole('region', { name: 'Pessoas' })
    expect(
      await within(people).findByText('Não foi possível falar com o servidor.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Hospedagem' })).toBeInTheDocument()
  })
})

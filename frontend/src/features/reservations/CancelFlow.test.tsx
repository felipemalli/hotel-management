import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ANA, pendingCheckin } from '@/features/guests/__fixtures__/guests'
import { fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from '@/features/guests/api'
import { cancelReservation } from '@/features/reservations/api'
import { toastStore } from '@/lib/toast'
import { DashboardPage } from '@/pages/DashboardPage'
import { page } from '@/test/fixtures'
import { renderPage, signInForTest } from '@/test/renderWithProviders'

import { reservation } from './__fixtures__/reservations'
import type { Reservation } from './types'

vi.mock('@/features/guests/api')
vi.mock('@/features/reservations/api')

const RESERVATION_ID = ANA.id
const GUEST_NAME = ANA.full_name
const EMPTY_PENDING = 'Nenhuma reserva aguardando check-in'

function cancelledReservation(): Reservation {
  return reservation({
    id: RESERVATION_ID,
    guest_id: ANA.id,
    status: 'CANCELLED',
    cancelled_at: '2026-09-02T09:00:00-03:00',
  })
}

function arrangeDashboard(stillPending: () => boolean) {
  const anaPending = pendingCheckin(ANA)

  vi.mocked(fetchGuests).mockResolvedValue(page([anaPending]))
  vi.mocked(fetchGuestsInHotel).mockResolvedValue(page([]))
  vi.mocked(fetchGuestsPendingCheckin).mockImplementation(async () =>
    page(stillPending() ? [anaPending] : []),
  )
}

async function openConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: /Check-in pendente/ }))
  await screen.findByText(GUEST_NAME)

  await user.click(screen.getByRole('button', { name: 'Cancelar' }))
  return screen.findByRole('alertdialog', { name: 'Cancelar reserva' })
}

describe('CancelFlow', () => {
  it('cancela uma vez e devolve o foco ao conteudo quando a linha sai da listagem', async () => {
    const user = userEvent.setup()
    signInForTest()

    let cancelled = false
    arrangeDashboard(() => !cancelled)
    vi.mocked(cancelReservation).mockImplementation(async () => {
      cancelled = true
      return cancelledReservation()
    })

    renderPage(<DashboardPage />, { route: '/' })

    const confirmation = await openConfirmation(user)
    expect(confirmation).toHaveTextContent(GUEST_NAME)

    await user.click(within(confirmation).getByRole('button', { name: 'Cancelar reserva' }))

    await waitFor(() => expect(cancelReservation).toHaveBeenCalledWith(RESERVATION_ID))
    expect(cancelReservation).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByText(EMPTY_PENDING)).toBeInTheDocument()

    expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({
        tone: 'success',
        message: `Reserva de ${GUEST_NAME} cancelada.`,
      }),
    ])

    // O botao que abriu a confirmacao desmontou com a linha cancelada: sem um
    // alvo vivo o foco cairia no `<body>`.
    expect(screen.getByRole('main')).toHaveFocus()
    expect(document.body).not.toHaveFocus()
  })

  it('mantem a confirmacao na tela quando a listagem perde a linha no meio da mutation', async () => {
    const user = userEvent.setup()
    signInForTest()

    let cancelled = false
    let release = (): void => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    arrangeDashboard(() => !cancelled)
    vi.mocked(cancelReservation).mockImplementation(async () => {
      cancelled = true
      await held
      return cancelledReservation()
    })

    const { queryClient } = renderPage(<DashboardPage />, { route: '/' })

    const confirmation = await openConfirmation(user)
    await user.click(within(confirmation).getByRole('button', { name: 'Cancelar reserva' }))
    expect(await screen.findByRole('button', { name: 'Cancelando…' })).toBeDisabled()

    // A listagem se atualiza com a mutation ainda em voo e a linha sai da tela.
    void queryClient.invalidateQueries()
    expect(await screen.findByText(EMPTY_PENDING)).toBeInTheDocument()

    // A confirmacao sobrevive porque pertence a pagina: dentro da linha, ela
    // desmontaria aqui, no meio do cancelamento.
    expect(screen.getByRole('alertdialog', { name: 'Cancelar reserva' })).toBeInTheDocument()

    release()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(cancelReservation).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('nao chama a api quando o atendente volta', async () => {
    const user = userEvent.setup()
    signInForTest()

    arrangeDashboard(() => true)

    renderPage(<DashboardPage />, { route: '/' })

    const confirmation = await openConfirmation(user)
    await user.click(within(confirmation).getByRole('button', { name: 'Voltar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(cancelReservation).not.toHaveBeenCalled()
    expect(toastStore.getSnapshot()).toEqual([])
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })
})

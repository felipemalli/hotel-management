import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ANA, inHotel, pendingCheckin } from '@/features/guests/__fixtures__/guests'
import { fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from '@/features/guests/api'
import { checkIn } from '@/features/reservations/api'
import { ApiError } from '@/lib/errors'
import { toastStore } from '@/lib/toast'
import { DashboardPage } from '@/pages/DashboardPage'
import { elementAt, page } from '@/test/fixtures'
import { renderPage, renderWithProviders, signInForTest } from '@/test/renderWithProviders'

import { reservation } from './__fixtures__/reservations'
import { ReservationActions } from './ReservationActions'
import type { Reservation } from './types'

vi.mock('@/features/guests/api')
vi.mock('@/features/reservations/api')

const RESERVATION_ID = ANA.id
const GUEST_NAME = ANA.full_name
const SERVER_TIME = '13:45'
const OPENS_AT = '14:00'

function earlyCheckinError(): ApiError {
  return new ApiError({
    code: 'EARLY_CHECKIN',
    detail: 'Check-in permitido a partir das 14:00.',
    status: 409,
    extra: { server_time: SERVER_TIME, opens_at: OPENS_AT },
  })
}

function checkedInReservation(): Reservation {
  return reservation({
    id: RESERVATION_ID,
    status: 'CHECKED_IN',
    checked_in_at: '2026-09-01T13:46:00-03:00',
  })
}

describe('EarlyCheckinFlow', () => {
  it('test_409_opens_dialog_and_retry_allow_early', async () => {
    const user = userEvent.setup()

    vi.mocked(checkIn).mockImplementation(async ({ allow_early }) => {
      if (!allow_early) throw earlyCheckinError()
      return checkedInReservation()
    })

    renderWithProviders(
      <ReservationActions
        reservationId={RESERVATION_ID}
        guestName={GUEST_NAME}
        state="PENDING"
        onCheckedOut={vi.fn()}
        onRequestCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Check-in' }))
    expect(checkIn).toHaveBeenNthCalledWith(1, {
      id: RESERVATION_ID,
      allow_early: false,
    })

    const alert = await screen.findByRole('alertdialog', {
      name: 'Check-in antes das 14:00',
    })
    expect(alert).toHaveTextContent(
      `São ${SERVER_TIME} — o check-in abre às 14:00. Confirmar mesmo assim?`,
    )
    expect(alert).toHaveTextContent(GUEST_NAME)

    await user.click(within(alert).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(checkIn).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Check-in' }))
    const reopened = await screen.findByRole('alertdialog', {
      name: 'Check-in antes das 14:00',
    })
    expect(checkIn).toHaveBeenNthCalledWith(2, {
      id: RESERVATION_ID,
      allow_early: false,
    })

    await user.click(within(reopened).getByRole('button', { name: 'Confirmar mesmo assim' }))

    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(3))
    expect(checkIn).toHaveBeenNthCalledWith(3, {
      id: RESERVATION_ID,
      allow_early: true,
    })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('test_checkin_success_updates_row', async () => {
    const user = userEvent.setup()
    signInForTest()

    let checkedIn = false

    const anaPending = pendingCheckin(ANA)
    const anaInHotel = inHotel(ANA)

    vi.mocked(fetchGuests).mockResolvedValue(page([anaPending]))
    vi.mocked(fetchGuestsPendingCheckin).mockImplementation(async () =>
      page(checkedIn ? [] : [anaPending]),
    )
    vi.mocked(fetchGuestsInHotel).mockImplementation(async () =>
      page(checkedIn ? [anaInHotel] : []),
    )
    vi.mocked(checkIn).mockImplementation(async () => {
      checkedIn = true
      return checkedInReservation()
    })

    renderPage(<DashboardPage />, { route: '/' })

    await user.click(screen.getByRole('tab', { name: /Check-in pendente/ }))
    await screen.findByText(GUEST_NAME)

    await user.click(screen.getByRole('button', { name: 'Check-in' }))

    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await waitFor(() =>
      expect(vi.mocked(fetchGuestsPendingCheckin).mock.calls.length).toBeGreaterThan(1),
    )
    expect(await screen.findByText('Nenhuma reserva aguardando check-in')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /No hotel/ }))
    const table = await screen.findByRole('table', { name: 'Hóspedes no hotel' })
    const row = elementAt(within(table).getAllByRole('row'), 1)
    expect(within(row).getByText(GUEST_NAME)).toBeInTheDocument()
    expect(within(row).getByText('01/09/2026 14:02')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Checkout' })).toBeInTheDocument()
  })

  it('nao abre o alerta quando o 409 nao e EARLY_CHECKIN', async () => {
    const user = userEvent.setup()
    vi.mocked(checkIn).mockRejectedValue(
      new ApiError({
        code: 'INVALID_STATUS',
        detail: 'Transição inválida: CHECKED_OUT -> CHECKED_IN.',
        status: 409,
        extra: { status: 'CHECKED_OUT' },
      }),
    )

    renderWithProviders(
      <ReservationActions
        reservationId={RESERVATION_ID}
        guestName={GUEST_NAME}
        state="PENDING"
        onCheckedOut={vi.fn()}
        onRequestCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Check-in' }))

    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  // O horario de abertura vem da politica vigente: publicar outra abertura tem
  // de mudar o texto, e por isso ele nao pode estar escrito no componente.
  it('usa o horario de abertura da politica no titulo e na pergunta', async () => {
    const user = userEvent.setup()
    vi.mocked(checkIn).mockRejectedValue(
      new ApiError({
        code: 'EARLY_CHECKIN',
        detail: 'Check-in permitido a partir das 15:00.',
        status: 409,
        extra: { server_time: '14:30', opens_at: '15:00' },
      }),
    )

    renderWithProviders(
      <ReservationActions
        reservationId={RESERVATION_ID}
        guestName={GUEST_NAME}
        state="PENDING"
        onCheckedOut={vi.fn()}
        onRequestCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Check-in' }))

    const alert = await screen.findByRole('alertdialog', { name: 'Check-in antes das 15:00' })
    expect(alert).toHaveTextContent('São 14:30 — o check-in abre às 15:00. Confirmar mesmo assim?')
  })

  it('avisa por toast quando o quarto ainda esta ocupado, sem abrir o alerta', async () => {
    const user = userEvent.setup()
    vi.mocked(checkIn).mockRejectedValue(
      new ApiError({
        code: 'ROOM_UNAVAILABLE',
        detail: 'Quarto ainda ocupado por outra estadia.',
        status: 409,
        extra: { room_id: 1 },
      }),
    )

    renderWithProviders(
      <ReservationActions
        reservationId={RESERVATION_ID}
        guestName={GUEST_NAME}
        state="PENDING"
        onCheckedOut={vi.fn()}
        onRequestCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Check-in' }))

    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({
          tone: 'error',
          message: 'Quarto ainda ocupado por outra estadia.',
        }),
      ]),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  // Sem os horarios no `extra` nao ha dialogo a abrir, e o codigo esta na lista
  // dos apresentados localmente: sem o aviso, o 409 sumiria da tela.
  it('avisa por toast o EARLY_CHECKIN que nao trouxe os horarios', async () => {
    const user = userEvent.setup()
    vi.mocked(checkIn).mockRejectedValue(
      new ApiError({
        code: 'EARLY_CHECKIN',
        detail: 'Check-in permitido a partir das 14:00.',
        status: 409,
      }),
    )

    renderWithProviders(
      <ReservationActions
        reservationId={RESERVATION_ID}
        guestName={GUEST_NAME}
        state="PENDING"
        onCheckedOut={vi.fn()}
        onRequestCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Check-in' }))

    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({ message: 'Check-in permitido a partir das 14:00.' }),
      ]),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardPage } from '@/app/DashboardPage'
import { fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from '@/features/guests/api'
import type { GuestInHotel, GuestPendingCheckin } from '@/features/guests/types'
import { checkIn } from '@/features/reservations/api'
import type { Paginated } from '@/lib/apiClient'
import { ApiError } from '@/lib/errors'
import { elementAt } from '@/test/fixtures'
import { renderWithProviders, resetGlobalStores, signInForTest } from '@/test/renderWithProviders'

import { ReservationActions } from './ReservationActions'
import type { Reservation } from './types'

vi.mock('@/features/guests/api')
vi.mock('@/features/reservations/api')

/**
 * SPEC 6.2 — `features/reservations/EarlyCheckinFlow.test.tsx`.
 *
 * A unidade que a SPEC 6.2 chama de "EarlyCheckinFlow" e o `ReservationActions`
 * conduzindo o protocolo de D4 com o `EarlyCheckinDialog`. Provas de RN4 e RF6
 * na matriz SPEC 6.3 — e a RN4 e o unico requisito cuja **prova primaria e a
 * do frontend**: o "alerta" que o briefing pede e este componente.
 */

const RESERVATION_ID = 1
const GUEST_NAME = 'Ana Souza'
const SERVER_TIME = '13:45'

/** Envelope literal da SPEC 4.4 (409 EARLY_CHECKIN). */
function earlyCheckinError(): ApiError {
  return new ApiError({
    code: 'EARLY_CHECKIN',
    detail: 'Check-in permitido a partir das 14:00.',
    status: 409,
    extra: { server_time: SERVER_TIME },
  })
}

function checkedInReservation(): Reservation {
  return {
    id: RESERVATION_ID,
    guest_id: 1,
    checkin_date: '2026-09-01',
    checkout_date: '2026-09-03',
    has_vehicle: true,
    status: 'CHECKED_IN',
    checked_in_at: '2026-09-01T13:46:00-03:00',
    checked_out_at: null,
    total_daily: null,
    total_parking: null,
    late_fee: null,
    total_amount: null,
    created_at: '2026-09-01T08:00:00-03:00',
  }
}

function page<T>(results: T[]): Paginated<T> {
  return { count: results.length, next: null, previous: null, results }
}

describe('EarlyCheckinFlow', () => {
  beforeEach(() => {
    resetGlobalStores()
    vi.mocked(checkIn).mockReset()
    vi.mocked(fetchGuests).mockReset()
    vi.mocked(fetchGuestsInHotel).mockReset()
    vi.mocked(fetchGuestsPendingCheckin).mockReset()
  })

  it('test_409_opens_dialog_and_retry_allow_early', async () => {
    const user = userEvent.setup()

    // O servidor so aceita com o override: e isso que D4 descreve.
    vi.mocked(checkIn).mockImplementation(async ({ allow_early }) => {
      if (!allow_early) throw earlyCheckinError()
      return checkedInReservation()
    })

    renderWithProviders(
      <ReservationActions reservationId={RESERVATION_ID} guestName={GUEST_NAME} state="PENDING" />,
    )

    // 1. Primeira tentativa sai sem override, como manda o fluxo F2.
    await user.click(screen.getByRole('button', { name: 'Check-in' }))
    expect(checkIn).toHaveBeenNthCalledWith(1, {
      id: RESERVATION_ID,
      allow_early: false,
    })

    // 2. O 409 abre o alerta da RN4 exibindo `extra.server_time`.
    const alert = await screen.findByRole('alertdialog', {
      name: 'Check-in antes das 14:00',
    })
    expect(alert).toHaveTextContent(
      `São ${SERVER_TIME} — o check-in abre às 14:00. Confirmar mesmo assim?`,
    )
    expect(alert).toHaveTextContent(GUEST_NAME)

    // 3. Cancelar fecha o alerta sem efeito nenhum: nenhuma segunda chamada.
    await user.click(within(alert).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(checkIn).toHaveBeenCalledTimes(1)

    // 4. Nova tentativa, novo 409, novo alerta.
    await user.click(screen.getByRole('button', { name: 'Check-in' }))
    const reopened = await screen.findByRole('alertdialog', {
      name: 'Check-in antes das 14:00',
    })
    expect(checkIn).toHaveBeenNthCalledWith(2, {
      id: RESERVATION_ID,
      allow_early: false,
    })

    // 5. Confirmar reenvia com `allow_early: true` e o alerta sai de cena.
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

    // O servidor muda de estado com o check-in: a reserva sai de "pendente" e
    // o hospede aparece em "no hotel". As listagens da SPEC 4.3 seguem esse
    // fato, e e a invalidacao da SPEC 5.2 que traz a nova verdade para a tela.
    let checkedIn = false

    const anaPending: GuestPendingCheckin = {
      id: 1,
      full_name: GUEST_NAME,
      document: '12345678901',
      phone: '21988887777',
      created_at: '2026-09-01T08:00:00-03:00',
      pending_reservations: [
        {
          id: RESERVATION_ID,
          checkin_date: '2026-09-01',
          checkout_date: '2026-09-03',
          has_vehicle: true,
          checked_in_at: null,
        },
      ],
    }

    const anaInHotel: GuestInHotel = {
      id: 1,
      full_name: GUEST_NAME,
      document: '12345678901',
      phone: '21988887777',
      created_at: '2026-09-01T08:00:00-03:00',
      active_reservation: {
        id: RESERVATION_ID,
        checkin_date: '2026-09-01',
        checkout_date: '2026-09-03',
        has_vehicle: true,
        checked_in_at: '2026-09-01T14:02:00-03:00',
      },
    }

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

    renderWithProviders(<DashboardPage />)

    // Aba de pendentes (RF5): a linha traz o botao de check-in (RF6).
    await user.click(screen.getByRole('tab', { name: /Check-in pendente/ }))
    await screen.findByText(GUEST_NAME)

    await user.click(screen.getByRole('button', { name: 'Check-in' }))

    // Depois das 14h nao ha alerta: o caminho comum e 200 direto (D4).
    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    // A invalidacao da SPEC 5.2 refaz as tres listagens de hospedes: a reserva
    // deixa de estar pendente na tela, sem recarregar a pagina.
    await waitFor(() =>
      expect(vi.mocked(fetchGuestsPendingCheckin).mock.calls.length).toBeGreaterThan(1),
    )
    expect(await screen.findByText('Nenhuma reserva aguardando check-in')).toBeInTheDocument()

    // E o novo status aparece: o hospede agora esta na aba "No hotel", com o
    // `checked_in_at` que o contrato devolveu.
    await user.click(screen.getByRole('tab', { name: /No hotel/ }))
    const table = await screen.findByRole('table', { name: 'Hóspedes no hotel' })
    const row = elementAt(within(table).getAllByRole('row'), 1)
    expect(within(row).getByText(GUEST_NAME)).toBeInTheDocument()
    expect(within(row).getByText('01/09/2026 14:02')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Checkout' })).toBeInTheDocument()
  })

  it('nao abre o alerta quando o erro nao e o 409 de D4', async () => {
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
      <ReservationActions reservationId={RESERVATION_ID} guestName={GUEST_NAME} state="PENDING" />,
    )

    await user.click(screen.getByRole('button', { name: 'Check-in' }))

    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(1))
    // Segue para o handler global (toast), nunca para o alerta da RN4.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createReservation } from '@/features/reservations/api'
import { addDaysISO, todayISO } from '@/lib/dates'
import { renderWithProviders, resetGlobalStores } from '@/test/renderWithProviders'

import { ReservationForm } from './ReservationForm'
import type { Reservation } from './types'

vi.mock('@/features/reservations/api')

/**
 * SPEC 6.2 — `features/reservations/ReservationForm.test.tsx`.
 * Prova de RF2 na matriz SPEC 6.3: o formulario produz exatamente o payload
 * que o endpoint da SPEC 4.4 persiste.
 *
 * As datas sao derivadas de `todayISO()` em vez de literais porque D11 exige
 * `checkin_date >= hoje`: literal de data vira teste que apodrece. O formato
 * ISO — que **e** parte do contrato — e verificado por regex.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const GUEST = { id: 1, full_name: 'Ana Souza' }

function createdReservation(checkin: string, checkout: string): Reservation {
  return {
    id: 7,
    guest_id: GUEST.id,
    checkin_date: checkin,
    checkout_date: checkout,
    has_vehicle: true,
    status: 'PENDING',
    checked_in_at: null,
    checked_out_at: null,
    total_daily: null,
    total_parking: null,
    late_fee: null,
    total_amount: null,
    created_at: '2026-09-01T10:00:00-03:00',
  }
}

/** `type="date"` nao se digita tecla a tecla: o browser entrega o valor inteiro. */
function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('ReservationForm', () => {
  beforeEach(() => {
    resetGlobalStores()
    vi.mocked(createReservation).mockReset()
  })

  it('test_submits_dates_and_vehicle_flag', async () => {
    const user = userEvent.setup()
    const checkin = addDaysISO(todayISO(), 4)
    const checkout = addDaysISO(todayISO(), 7)
    vi.mocked(createReservation).mockResolvedValue(createdReservation(checkin, checkout))

    const onSuccess = vi.fn()
    renderWithProviders(<ReservationForm guest={GUEST} onSuccess={onSuccess} />)

    setDate('Entrada', checkin)
    setDate('Saída', checkout)
    await user.click(screen.getByLabelText('Utilizará vaga de estacionamento'))
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).toHaveBeenCalledTimes(1)
    expect(createReservation).toHaveBeenCalledWith({
      guest_id: 1,
      checkin_date: checkin,
      checkout_date: checkout,
      has_vehicle: true,
    })

    // Formato do contrato SPEC 4.1: datas `YYYY-MM-DD`, nunca `Date` serializado.
    const payload = vi.mocked(createReservation).mock.lastCall?.[0]
    expect(payload?.checkin_date).toMatch(ISO_DATE)
    expect(payload?.checkout_date).toMatch(ISO_DATE)
    expect(typeof payload?.has_vehicle).toBe('boolean')

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(createdReservation(checkin, checkout)),
    )
  })

  it('envia has_vehicle: false quando a vaga nao e marcada', async () => {
    const user = userEvent.setup()
    const checkin = todayISO()
    const checkout = addDaysISO(checkin, 1)
    vi.mocked(createReservation).mockResolvedValue(createdReservation(checkin, checkout))

    renderWithProviders(<ReservationForm guest={GUEST} />)
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).toHaveBeenCalledWith({
      guest_id: 1,
      checkin_date: checkin,
      checkout_date: checkout,
      has_vehicle: false,
    })
  })

  it('barra o agendamento de menos de uma noite (D13) antes de chamar a API', async () => {
    const user = userEvent.setup()
    const sameDay = addDaysISO(todayISO(), 2)

    renderWithProviders(<ReservationForm guest={GUEST} />)
    setDate('Entrada', sameDay)
    setDate('Saída', sameDay)
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).not.toHaveBeenCalled()
    expect(
      screen.getByText('A saída deve ser depois da entrada (mínimo de 1 noite).'),
    ).toBeInTheDocument()
  })

  it('barra entrada no passado (D11) antes de chamar a API', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ReservationForm guest={GUEST} />)
    setDate('Entrada', addDaysISO(todayISO(), -1))
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).not.toHaveBeenCalled()
    expect(screen.getByText('A reserva não pode começar no passado.')).toBeInTheDocument()
  })
})

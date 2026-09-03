import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createReservation } from '@/features/reservations/api'
import { addDaysISO, todayISO } from '@/lib/dates'
import { ApiError } from '@/lib/errors'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ReservationForm } from './ReservationForm'
import type { Reservation } from './types'

vi.mock('@/features/reservations/api')

// As datas saem de `todayISO()` e nao de literais: a regra do servidor exige
// entrada a partir de hoje, e literal de data vira teste que apodrece.
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

// `type="date"` nao se digita tecla a tecla: o browser entrega o valor inteiro.
function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('ReservationForm', () => {
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

  it('barra o agendamento de menos de uma noite antes de chamar a API', async () => {
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

  it('barra entrada no passado antes de chamar a API', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ReservationForm guest={GUEST} />)
    setDate('Entrada', addDaysISO(todayISO(), -1))
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).not.toHaveBeenCalled()
    expect(screen.getByText('A reserva não pode começar no passado.')).toBeInTheDocument()
  })

  it('devolve o VALIDATION_ERROR do servidor ao campo de data culpado', async () => {
    const user = userEvent.setup()
    vi.mocked(createReservation).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: { checkout_date: ['Não há vaga para todo o período.'] },
      }),
    )

    renderWithProviders(<ReservationForm guest={GUEST} />)
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(await screen.findByText('Não há vaga para todo o período.')).toBeInTheDocument()
    expect(screen.getByLabelText('Saída')).toHaveAttribute('aria-invalid', 'true')

    setDate('Saída', addDaysISO(todayISO(), 3))

    await waitFor(() =>
      expect(screen.queryByText('Não há vaga para todo o período.')).not.toBeInTheDocument(),
    )
  })

  it('mostra no alerta do topo o erro que não pertence a nenhum campo da tela', async () => {
    const user = userEvent.setup()
    vi.mocked(createReservation).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: { guest_id: ['Hóspede já possui reserva ativa.'] },
      }),
    )

    renderWithProviders(<ReservationForm guest={GUEST} />)
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Hóspede já possui reserva ativa.')
  })
})

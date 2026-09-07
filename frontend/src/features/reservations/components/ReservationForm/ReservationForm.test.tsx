import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EVA } from '@/features/guests/__fixtures__/guests'
import { fetchGuests } from '@/features/guests/api'
import { WEEKDAY_NIGHT_QUOTE } from '@/features/pricing/__fixtures__/quotes'
import { fetchStayQuote } from '@/features/pricing/api'
import { reservation } from '@/features/reservations/__fixtures__/reservations'
import { createReservation } from '@/features/reservations/api'
import { COMPANION_UNRESOLVED_MESSAGE } from '@/features/reservations/schemas'
import { ROOM_101, ROOM_201 } from '@/features/rooms/__fixtures__/rooms'
import { fetchAvailableRooms } from '@/features/rooms/api'
import { ApiError } from '@/lib/errors/errors'
import { addDaysISO, todayISO } from '@/lib/format/dates'
import { formatBRL } from '@/lib/format/money'
import { SEARCH_DEBOUNCE_MS } from '@/lib/hooks/useDebouncedValue'
import { page } from '@/test/fixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ReservationForm } from './ReservationForm'

vi.mock('@/features/reservations/api')
vi.mock('@/features/rooms/api')
vi.mock('@/features/guests/api')
vi.mock('@/features/pricing/api')

const GUEST = { id: 1, full_name: 'Ana Souza' }

function roomTrigger() {
  return screen.getByRole('combobox', { name: 'Quarto' })
}

// `type="date"` não se digita tecla a tecla: o browser entrega o valor inteiro.
function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('ReservationForm · RF2', () => {
  beforeEach(() => {
    vi.mocked(fetchAvailableRooms).mockResolvedValue(page([ROOM_101, ROOM_201]))
    vi.mocked(fetchGuests).mockResolvedValue(page([]))
    vi.mocked(fetchStayQuote).mockResolvedValue(WEEKDAY_NIGHT_QUOTE)
  })

  it('test_submits_dates_and_vehicle_flag', async () => {
    const user = userEvent.setup()
    const checkin = addDaysISO(todayISO(), 4)
    const checkout = addDaysISO(todayISO(), 7)

    renderWithProviders(<ReservationForm guest={GUEST} />)

    setDate('Entrada', checkin)
    setDate('Saída', checkout)

    await waitFor(() =>
      expect(fetchAvailableRooms).toHaveBeenLastCalledWith({
        checkin_date: checkin,
        checkout_date: checkout,
        people: 1,
      }),
    )
    await waitFor(() => expect(roomTrigger()).toBeEnabled())

    const vehicle = screen.getByRole('checkbox', { name: 'Utilizará vaga de estacionamento' })
    expect(vehicle).not.toBeChecked()
    await user.click(vehicle)
    expect(vehicle).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))
    expect(createReservation).not.toHaveBeenCalled()
    expect(roomTrigger()).toHaveAttribute('aria-invalid', 'true')
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
})

describe('ReservationForm · escolha do quarto', () => {
  beforeEach(() => {
    vi.mocked(fetchAvailableRooms).mockResolvedValue(page([ROOM_101, ROOM_201]))
    vi.mocked(fetchGuests).mockResolvedValue(page([]))
    vi.mocked(createReservation).mockResolvedValue(reservation())
    vi.mocked(fetchStayQuote).mockResolvedValue(WEEKDAY_NIGHT_QUOTE)
  })

  it('exige a escolha do quarto antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await waitFor(() => expect(roomTrigger()).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).not.toHaveBeenCalled()
    expect(await screen.findByText('Escolha um quarto.')).toBeInTheDocument()
    expect(roomTrigger()).toHaveAttribute('aria-invalid', 'true')
  })

  it('desabilita o quarto e nao consulta a disponibilidade com datas invalidas', async () => {
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await waitFor(() => expect(roomTrigger()).toBeEnabled())
    const callsBefore = vi.mocked(fetchAvailableRooms).mock.calls.length

    const sameDay = addDaysISO(todayISO(), 2)
    setDate('Entrada', sameDay)
    setDate('Saída', sameDay)

    await waitFor(() => expect(roomTrigger()).toBeDisabled())
    expect(
      screen.getByText('Informe entrada e saída válidas para ver os quartos livres.'),
    ).toBeInTheDocument()
    expect(vi.mocked(fetchAvailableRooms).mock.calls.length).toBe(callsBefore)
  })

  it('avisa quando nenhum quarto esta livre no periodo', async () => {
    vi.mocked(fetchAvailableRooms).mockResolvedValue(page([]))
    renderWithProviders(<ReservationForm guest={GUEST} />)

    expect(await screen.findByText('Nenhum quarto disponível para o período.')).toBeInTheDocument()
  })

  it('anuncia a busca de quartos enquanto ela dura', async () => {
    vi.mocked(fetchAvailableRooms).mockReturnValue(new Promise(() => undefined))
    renderWithProviders(<ReservationForm guest={GUEST} />)

    expect(await screen.findByText('Buscando quartos livres…')).toBeInTheDocument()
    expect(roomTrigger()).toBeDisabled()
  })

  it('mostra no proprio campo a falha da consulta de quartos', async () => {
    vi.mocked(fetchAvailableRooms).mockRejectedValue(
      new ApiError({ code: 'NETWORK_ERROR', detail: 'sem rede', status: 0 }),
    )
    renderWithProviders(<ReservationForm guest={GUEST} />)

    expect(await screen.findByText('Não foi possível falar com o servidor.')).toBeInTheDocument()
  })

  it('conta o acompanhante no numero de pessoas e atualiza a consulta de disponibilidade', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchGuests).mockResolvedValue(page([EVA]))
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await waitFor(() => expect(roomTrigger()).toBeEnabled())

    await user.type(screen.getByLabelText('Acompanhantes'), 'eva')
    await waitFor(() => expect(fetchGuests).toHaveBeenCalled(), { timeout: SEARCH_DEBOUNCE_MS * 4 })
    await user.click(await screen.findByRole('option', { name: /Eva Lima/ }))

    await waitFor(() => expect(vi.mocked(fetchAvailableRooms).mock.lastCall?.[0].people).toBe(2))
    expect(screen.getByRole('button', { name: 'Remover Eva Lima' })).toBeInTheDocument()
  })

  it('nao cria a reserva se a busca de acompanhante nao corresponde a um hospede', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchGuests).mockResolvedValue(page([]))
    renderWithProviders(<ReservationForm guest={GUEST} />)

    await user.type(screen.getByLabelText('Acompanhantes'), 'zzz')
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).not.toHaveBeenCalled()
    expect(await screen.findByText(COMPANION_UNRESOLVED_MESSAGE)).toBeInTheDocument()
  })
})

describe('ReservationForm · valor estimado', () => {
  beforeEach(() => {
    vi.mocked(fetchAvailableRooms).mockResolvedValue(page([ROOM_101, ROOM_201]))
    vi.mocked(fetchGuests).mockResolvedValue(page([]))
    vi.mocked(fetchStayQuote).mockResolvedValue(WEEKDAY_NIGHT_QUOTE)
  })

  it('consulta a estimativa com as datas padrao e a vaga desmarcada', async () => {
    renderWithProviders(<ReservationForm guest={GUEST} />)

    await waitFor(() =>
      expect(fetchStayQuote).toHaveBeenCalledWith({
        checkin_date: todayISO(),
        checkout_date: addDaysISO(todayISO(), 1),
        has_vehicle: false,
      }),
    )
    expect(
      await screen.findByLabelText(`Total estimado ${formatBRL(WEEKDAY_NIGHT_QUOTE.total)}`),
    ).toBeInTheDocument()
  })

  it('reconsulta a estimativa quando o atendente marca a vaga', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await waitFor(() => expect(fetchStayQuote).toHaveBeenCalled())

    await user.click(screen.getByRole('checkbox', { name: 'Utilizará vaga de estacionamento' }))

    await waitFor(() =>
      expect(fetchStayQuote).toHaveBeenCalledWith({
        checkin_date: todayISO(),
        checkout_date: addDaysISO(todayISO(), 1),
        has_vehicle: true,
      }),
    )
  })

  it('nao consulta a estimativa com datas invalidas', async () => {
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await waitFor(() => expect(fetchStayQuote).toHaveBeenCalled())
    const callsBefore = vi.mocked(fetchStayQuote).mock.calls.length

    const sameDay = addDaysISO(todayISO(), 2)
    setDate('Entrada', sameDay)
    setDate('Saída', sameDay)

    expect(
      screen.getByText('Informe entrada e saída válidas para ver o valor estimado.'),
    ).toBeInTheDocument()
    expect(vi.mocked(fetchStayQuote).mock.calls.length).toBe(callsBefore)
  })
})

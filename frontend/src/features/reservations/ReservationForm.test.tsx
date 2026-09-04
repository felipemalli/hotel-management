import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EVA } from '@/features/guests/__fixtures__/guests'
import { fetchGuests } from '@/features/guests/api'
import { DEBOUNCE_MS } from '@/features/guests/tabs'
import { createReservation } from '@/features/reservations/api'
import { ROOM_101, ROOM_201 } from '@/features/rooms/__fixtures__/rooms'
import { fetchAvailableRooms } from '@/features/rooms/api'
import { addDaysISO, todayISO } from '@/lib/dates'
import { ApiError } from '@/lib/errors'
import { page } from '@/test/fixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

import { reservation } from './__fixtures__/reservations'
import { ReservationForm } from './ReservationForm'
import type { Reservation } from './types'

vi.mock('@/features/reservations/api')
vi.mock('@/features/rooms/api')
// O seletor de acompanhantes busca hóspedes; dublado para nenhum teste tocar a
// rede, mesmo quando o caso não abre a busca.
vi.mock('@/features/guests/api')

// As datas saem de `todayISO()` e nao de literais: a regra do servidor exige
// entrada a partir de hoje, e literal de data vira teste que apodrece.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const GUEST = { id: 1, full_name: 'Ana Souza' }
const ROOM_LABEL = `${ROOM_101.number} · capacidade ${ROOM_101.capacity}`

async function chooseRoom(room = ROOM_101) {
  const select = await screen.findByRole('option', {
    name: `${room.number} · capacidade ${room.capacity}`,
  })
  fireEvent.change(screen.getByLabelText('Quarto'), { target: { value: String(room.id) } })
  return select
}

function createdReservation(checkin: string, checkout: string): Reservation {
  return reservation({
    id: 7,
    guest_id: GUEST.id,
    room: { id: ROOM_101.id, number: ROOM_101.number },
    checkin_date: checkin,
    checkout_date: checkout,
    has_vehicle: true,
  })
}

// `type="date"` nao se digita tecla a tecla: o browser entrega o valor inteiro.
function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('ReservationForm', () => {
  beforeEach(() => {
    vi.mocked(fetchAvailableRooms).mockResolvedValue(page([ROOM_101, ROOM_201]))
    vi.mocked(fetchGuests).mockResolvedValue(page([]))
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

    await waitFor(() =>
      expect(fetchAvailableRooms).toHaveBeenLastCalledWith({
        checkin_date: checkin,
        checkout_date: checkout,
        people: 1,
      }),
    )
    await chooseRoom()

    await user.click(screen.getByLabelText('Utilizará vaga de estacionamento'))
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).toHaveBeenCalledTimes(1)
    expect(createReservation).toHaveBeenCalledWith({
      guest_id: 1,
      room_id: ROOM_101.id,
      companion_ids: [],
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
    await chooseRoom()
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).toHaveBeenCalledWith({
      guest_id: 1,
      room_id: ROOM_101.id,
      companion_ids: [],
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
    await chooseRoom()
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
    await chooseRoom()
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Hóspede já possui reserva ativa.')
  })
})

describe('ReservationForm · escolha do quarto', () => {
  beforeEach(() => {
    vi.mocked(fetchAvailableRooms).mockResolvedValue(page([ROOM_101, ROOM_201]))
    vi.mocked(fetchGuests).mockResolvedValue(page([]))
    vi.mocked(createReservation).mockResolvedValue(reservation())
  })

  it('exige a escolha do quarto antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await screen.findByRole('option', { name: ROOM_LABEL })

    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(createReservation).not.toHaveBeenCalled()
    expect(await screen.findByText('Escolha um quarto.')).toBeInTheDocument()
    expect(screen.getByLabelText('Quarto')).toHaveAttribute('aria-invalid', 'true')
  })

  // Datas invalidas dariam 400 do servidor: sem consulta, e o campo diz por que
  // esta desabilitado em vez de mostrar uma lista vazia sem explicacao.
  it('desabilita o quarto e nao consulta a disponibilidade com datas invalidas', async () => {
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await screen.findByRole('option', { name: ROOM_LABEL })
    const callsBefore = vi.mocked(fetchAvailableRooms).mock.calls.length

    const sameDay = addDaysISO(todayISO(), 2)
    setDate('Entrada', sameDay)
    setDate('Saída', sameDay)

    await waitFor(() => expect(screen.getByLabelText('Quarto')).toBeDisabled())
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
    expect(screen.getByLabelText('Quarto')).toBeDisabled()
  })

  it('mostra no proprio campo a falha da consulta de quartos', async () => {
    vi.mocked(fetchAvailableRooms).mockRejectedValue(
      new ApiError({ code: 'NETWORK_ERROR', detail: 'sem rede', status: 0 }),
    )
    renderWithProviders(<ReservationForm guest={GUEST} />)

    expect(await screen.findByText('Não foi possível falar com o servidor.')).toBeInTheDocument()
  })

  it('limpa o quarto escolhido quando ele sai da lista', async () => {
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await screen.findByRole('option', { name: ROOM_LABEL })
    fireEvent.change(screen.getByLabelText('Quarto'), { target: { value: String(ROOM_101.id) } })
    expect(screen.getByLabelText('Quarto')).toHaveValue(String(ROOM_101.id))

    vi.mocked(fetchAvailableRooms).mockResolvedValue(page([ROOM_201]))
    setDate('Saída', addDaysISO(todayISO(), 5))

    await waitFor(() => expect(screen.getByLabelText('Quarto')).toHaveValue(''))
    expect(screen.queryByRole('option', { name: ROOM_LABEL })).not.toBeInTheDocument()
  })

  it('conta o acompanhante no numero de pessoas e o envia na reserva', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchGuests).mockResolvedValue(page([EVA]))
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await screen.findByRole('option', { name: ROOM_LABEL })

    await user.type(screen.getByLabelText('Buscar acompanhante'), 'eva')
    await waitFor(() => expect(fetchGuests).toHaveBeenCalled(), { timeout: DEBOUNCE_MS * 4 })
    await user.click(await screen.findByRole('button', { name: 'Adicionar Eva Lima' }))

    await waitFor(() => expect(vi.mocked(fetchAvailableRooms).mock.lastCall?.[0].people).toBe(2))

    fireEvent.change(screen.getByLabelText('Quarto'), { target: { value: String(ROOM_201.id) } })
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    await waitFor(() => expect(createReservation).toHaveBeenCalled())
    expect(vi.mocked(createReservation).mock.lastCall?.[0]).toMatchObject({
      room_id: ROOM_201.id,
      companion_ids: [EVA.id],
    })
  })

  it('apresenta o ROOM_UNAVAILABLE no alerta do topo, com a data do conflito', async () => {
    const user = userEvent.setup()
    vi.mocked(createReservation).mockRejectedValue(
      new ApiError({
        code: 'ROOM_UNAVAILABLE',
        detail: 'Quarto 101 indisponível no período solicitado.',
        status: 409,
        extra: { room_id: ROOM_101.id, conflicting_checkin_date: '2026-09-10' },
      }),
    )
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await chooseRoom()
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Quarto 101 indisponível no período solicitado.')
    expect(alert).toHaveTextContent('Conflito com uma reserva a partir de 10/09/2026.')
  })

  it('apresenta o ROOM_UNAVAILABLE da corrida, que so traz o quarto', async () => {
    const user = userEvent.setup()
    vi.mocked(createReservation).mockRejectedValue(
      new ApiError({
        code: 'ROOM_UNAVAILABLE',
        detail: 'Quarto indisponível para o período.',
        status: 409,
        extra: { room_id: ROOM_101.id },
      }),
    )
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await chooseRoom()
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Quarto indisponível para o período.')
    expect(alert).not.toHaveTextContent('Conflito')
  })

  it('devolve ao campo o VALIDATION_ERROR de quarto e o de acompanhantes', async () => {
    const user = userEvent.setup()
    vi.mocked(createReservation).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: {
          room_id: ['Quarto 101 está desativado.'],
          companion_ids: ['Quarto 101 comporta 2 pessoas.'],
        },
      }),
    )
    renderWithProviders(<ReservationForm guest={GUEST} />)
    await chooseRoom()
    await user.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(await screen.findByText('Quarto 101 está desativado.')).toBeInTheDocument()
    expect(screen.getByText('Quarto 101 comporta 2 pessoas.')).toBeInTheDocument()
  })
})

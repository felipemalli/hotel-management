import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EVA } from '@/features/guests/__fixtures__/guests'
import { fetchGuests } from '@/features/guests/api'
import { reservation } from '@/features/reservations/__fixtures__/reservations'
import { createReservation } from '@/features/reservations/api'
import { ROOM_101, ROOM_201 } from '@/features/rooms/__fixtures__/rooms'
import { fetchAvailableRooms } from '@/features/rooms/api'
import { ApiError } from '@/lib/errors/errors'
import { addDaysISO, todayISO } from '@/lib/format/dates'
import { SEARCH_DEBOUNCE_MS } from '@/lib/hooks/useDebouncedValue'
import { page } from '@/test/fixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ReservationForm } from './ReservationForm'

vi.mock('@/features/reservations/api')
vi.mock('@/features/rooms/api')
// O seletor de acompanhantes busca hóspedes; dublado para nenhum teste tocar a
// rede, mesmo quando o caso não abre a busca.
vi.mock('@/features/guests/api')

const GUEST = { id: 1, full_name: 'Ana Souza' }

function roomTrigger() {
  return screen.getByRole('combobox', { name: 'Quarto' })
}

// A escolha do quarto usa o Select do Base UI, cujo popup não resolve em jsdom
// (measure/posicionamento via floating-ui nunca assenta — ver
// src/components/ui/select.tsx e a nota em src/test/setup.ts). Sem um quarto
// escolhido o zod nunca deixa `handleSubmit` chamar `createReservation`, então
// o envio completo (payload, sucesso, VALIDATION_ERROR/ROOM_UNAVAILABLE do
// servidor) fica provado em `e2e/reception.spec.ts` ("Nova reserva"), não
// aqui. `roomUnavailableInfo` (lib/errors/errors.test.ts) e o roteamento
// genérico de `applyServerErrors` (lib/forms/forms.test.ts) já provam a parte
// pura desses casos. Esta suíte prova o que RTL consegue: a exigência do
// quarto, a consulta de disponibilidade guiada pelas datas/pessoas, os
// estados do campo (desabilitado, vazio, com erro) e a marcação da vaga.

// `type="date"` nao se digita tecla a tecla: o browser entrega o valor inteiro.
function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('ReservationForm · RF2', () => {
  beforeEach(() => {
    vi.mocked(fetchAvailableRooms).mockResolvedValue(page([ROOM_101, ROOM_201]))
    vi.mocked(fetchGuests).mockResolvedValue(page([]))
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

    // Datas válidas e vaga marcada não bastam: sem quarto escolhido o zod
    // ainda bloqueia o envio (a escolha em si é provada no e2e).
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

  // Datas invalidas dariam 400 do servidor: sem consulta, e o campo diz por que
  // esta desabilitado em vez de mostrar uma lista vazia sem explicacao.
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

    await user.type(screen.getByLabelText('Buscar acompanhante'), 'eva')
    await waitFor(() => expect(fetchGuests).toHaveBeenCalled(), { timeout: SEARCH_DEBOUNCE_MS * 4 })
    await user.click(await screen.findByRole('button', { name: 'Adicionar Eva Lima' }))

    await waitFor(() => expect(vi.mocked(fetchAvailableRooms).mock.lastCall?.[0].people).toBe(2))
    expect(screen.getByRole('button', { name: 'Remover Eva Lima' })).toBeInTheDocument()
  })
})

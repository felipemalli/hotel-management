import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ANA,
  BRUNO,
  DAVI,
  EVA,
  inHotel,
  pendingCheckin,
} from '@/features/guests/__fixtures__/guests'
import { fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from '@/features/guests/api'
import type { Guest } from '@/features/guests/types'
import type { Paginated } from '@/lib/api/apiClient'
import { ApiError } from '@/lib/errors/errors'
import { SEARCH_DEBOUNCE_MS } from '@/lib/hooks/useDebouncedValue'
import { elementAt, page } from '@/test/fixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

import { GuestTable } from './GuestTable'

vi.mock('@/features/guests/api')

const BRUNO_IN_HOTEL = inHotel(BRUNO, {
  room: { id: 2, number: '102' },
  checkin_date: '2026-08-31',
  checkout_date: '2026-09-02',
  has_vehicle: false,
  checked_in_at: '2026-08-31T15:00:00-03:00',
})

const ANA_PENDING = pendingCheckin(ANA)

// Eva acompanha Bruno: mesma reserva, `guest_id` do titular. É a linha que
// prova que a aba lista quem não reservou.
const EVA_AS_COMPANION = inHotel(EVA, {
  id: BRUNO_IN_HOTEL.active_reservation.id,
  guest_id: BRUNO.id,
  room: { id: 2, number: '102' },
  checkin_date: '2026-08-31',
  checkout_date: '2026-09-02',
  has_vehicle: false,
  checked_in_at: '2026-08-31T15:00:00-03:00',
})

describe('GuestTable · RF3 · RF4 · RF5', () => {
  beforeEach(() => {
    vi.mocked(fetchGuests).mockResolvedValue(page([ANA, DAVI]))
    vi.mocked(fetchGuestsInHotel).mockResolvedValue(page([BRUNO_IN_HOTEL]))
    vi.mocked(fetchGuestsPendingCheckin).mockResolvedValue(page([ANA_PENDING]))
  })

  it('test_search_input_debounces_and_queries', async () => {
    // Tripwire: o teste avanca a mesma constante que a tabela usa, e o
    // contrato de busca fixa 300 ms — divergencia entre as duas quebra aqui.
    expect(SEARCH_DEBOUNCE_MS).toBe(300)

    vi.useFakeTimers()
    try {
      vi.mocked(fetchGuests).mockImplementation(async (search: string) =>
        page(search ? [ANA] : [ANA, DAVI]),
      )

      renderWithProviders(<GuestTable />)
      await advanceTimersAndFlush(0)

      expect(fetchGuests).toHaveBeenCalledTimes(1)
      expect(fetchGuests).toHaveBeenLastCalledWith('', 1)
      expect(screen.getByText('Davi Rocha')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Buscar hóspede'), { target: { value: 'ana' } })
      await advanceTimersAndFlush(0)

      await advanceTimersAndFlush(SEARCH_DEBOUNCE_MS - 1)
      expect(fetchGuests).toHaveBeenCalledTimes(1)

      await advanceTimersAndFlush(1)
      expect(fetchGuests).toHaveBeenCalledTimes(2)
      expect(fetchGuests).toHaveBeenLastCalledWith('ana', 1)

      await advanceTimersAndFlush(0)
      expect(screen.getByText('Ana Souza')).toBeInTheDocument()
      expect(screen.queryByText('Davi Rocha')).not.toBeInTheDocument()
      expect(screen.getByText('123.456.789-01')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('test_tab_in_hotel_switches_dataset', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GuestTable />)
    await screen.findByText('Ana Souza')

    expect(fetchGuestsInHotel).not.toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: /No hotel/ }))

    await waitFor(() => expect(fetchGuestsInHotel).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Bruno Lima')).toBeInTheDocument()
    expect(screen.queryByText('Davi Rocha')).not.toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Hóspedes no hotel' })
    const row = elementAt(within(table).getAllByRole('row'), 1)
    expect(within(row).getByText('31/08/2026 → 02/09/2026')).toBeInTheDocument()
    expect(within(row).getByText('31/08/2026 15:00')).toBeInTheDocument()

    expect(screen.queryByLabelText('Buscar hóspede')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /No hotel/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('mostra o quarto e marca a acompanhante na aba do hotel', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchGuestsInHotel).mockResolvedValue(page([BRUNO_IN_HOTEL, EVA_AS_COMPANION]))
    renderWithProviders(<GuestTable />)
    await screen.findByText('Ana Souza')

    await user.click(screen.getByRole('tab', { name: /No hotel/ }))
    await screen.findByText('Bruno Lima')

    const table = screen.getByRole('table', { name: 'Hóspedes no hotel' })
    const holder = elementAt(within(table).getAllByRole('row'), 1)
    const companion = elementAt(within(table).getAllByRole('row'), 2)

    expect(within(holder).getByText('102')).toBeInTheDocument()
    expect(within(holder).queryByText('Acompanhante')).not.toBeInTheDocument()

    expect(within(companion).getByText('Eva Lima')).toBeInTheDocument()
    expect(within(companion).getByText('Acompanhante')).toBeInTheDocument()
    expect(within(companion).getByText('102')).toBeInTheDocument()
  })

  it('exibe nacionalidade e telefone com o codigo do pais na aba de todos', async () => {
    renderWithProviders(<GuestTable />)
    await screen.findByText('Ana Souza')

    const table = screen.getByRole('table', { name: 'Todos os hóspedes cadastrados' })
    const row = elementAt(within(table).getAllByRole('row'), 1)

    expect(within(row).getByText('BR')).toHaveAttribute('title', 'Brasil')
    expect(within(row).getByText('+55 (21) 98888-7777')).toBeInTheDocument()
  })

  // Normativo: a coluna "Reserva" (o número da reserva, `#1`) é nova nesta
  // aba; "Estadia" é o antigo cabeçalho "Reserva" renomeado — só ele já
  // mostrava as datas de entrada/saída.
  it('test_tab_pending_switches_dataset', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GuestTable />)
    await screen.findByText('Ana Souza')

    expect(fetchGuestsPendingCheckin).not.toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: /Check-in pendente/ }))

    await waitFor(() => expect(fetchGuestsPendingCheckin).toHaveBeenCalledTimes(1))

    const table = await screen.findByRole('table', {
      name: 'Hóspedes com reserva pendente de check-in',
    })
    expect(within(table).getByRole('columnheader', { name: 'Reserva' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Estadia' })).toBeInTheDocument()

    const row = elementAt(within(table).getAllByRole('row'), 1)
    expect(within(row).getByText('Ana Souza')).toBeInTheDocument()
    expect(within(row).getByText('#1')).toBeInTheDocument()
    expect(within(row).getByText('01/09/2026 → 03/09/2026')).toBeInTheDocument()
    expect(within(row).getByText('Sim')).toBeInTheDocument()
    expect(screen.queryByText('Bruno Lima')).not.toBeInTheDocument()
  })

  it('mostra o estado vazio quando a busca nao acha ninguem', async () => {
    vi.mocked(fetchGuests).mockResolvedValue(page<Guest>([]))
    renderWithProviders(<GuestTable />)

    expect(await screen.findByText('Nenhum hóspede encontrado')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('mostra o estado de erro com retry e refaz a leitura ao clicar', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchGuests).mockRejectedValueOnce(
      new ApiError({
        code: 'NETWORK_ERROR',
        detail: 'Não foi possível falar com o servidor.',
        status: 0,
      }),
    )
    renderWithProviders(<GuestTable />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível falar com o servidor.')

    vi.mocked(fetchGuests).mockResolvedValue(page([ANA]))
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('anuncia o carregamento antes da primeira resposta', async () => {
    let resolve: (value: Paginated<Guest>) => void = vi.fn()
    vi.mocked(fetchGuests).mockReturnValue(
      new Promise<Paginated<Guest>>((r) => {
        resolve = r
      }),
    )
    renderWithProviders(<GuestTable />)

    expect(screen.getByRole('status')).toHaveTextContent('Carregando…')

    await act(async () => {
      resolve(page([ANA]))
    })
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('mantem a listagem na tela enquanto a busca seguinte esta em voo', async () => {
    vi.useFakeTimers()
    try {
      let releaseSearch: (value: Paginated<Guest>) => void = vi.fn()
      vi.mocked(fetchGuests).mockImplementation((search: string) =>
        search === ''
          ? Promise.resolve(page([ANA, DAVI]))
          : new Promise<Paginated<Guest>>((resolve) => {
              releaseSearch = resolve
            }),
      )

      renderWithProviders(<GuestTable />)
      await advanceTimersAndFlush(0)
      expect(screen.getByText('Davi Rocha')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Buscar hóspede'), { target: { value: 'ana' } })
      await advanceTimersAndFlush(SEARCH_DEBOUNCE_MS)

      expect(fetchGuests).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.getByText('Davi Rocha')).toBeInTheDocument()
      expect(screen.getByText('Atualizando…')).toBeInTheDocument()

      releaseSearch(page([ANA]))
      await advanceTimersAndFlush(0)

      expect(screen.queryByText('Davi Rocha')).not.toBeInTheDocument()
      expect(screen.queryByText('Atualizando…')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('anuncia a contagem de resultados sem criar uma segunda regiao de status', async () => {
    renderWithProviders(<GuestTable />)

    const announcement = await screen.findByText('2 resultados encontrados')
    expect(announcement).toHaveAttribute('aria-live', 'polite')
    expect(announcement).toHaveClass('sr-only')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('pagina a listagem e volta a primeira pagina ao trocar de aba', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchGuests).mockResolvedValue({
      count: 25,
      next: 'http://localhost/api/guests/?page=2',
      previous: null,
      results: [ANA, DAVI],
    })
    renderWithProviders(<GuestTable />)
    await screen.findByText('Ana Souza')

    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    await waitFor(() => expect(fetchGuests).toHaveBeenLastCalledWith('', 2))

    // Recorte novo, primeira pagina: a pagina 2 de "Todos" nao significa nada
    // na aba do hotel.
    await user.click(screen.getByRole('tab', { name: /No hotel/ }))
    await waitFor(() => expect(fetchGuestsInHotel).toHaveBeenLastCalledWith(1))
  })
})

// `waitFor` do RTL nao reconhece os fake timers do vitest (ele procura o global
// `jest`), entao tempo e microtasks sao avancados a mao: `advanceTimersByTimeAsync`
// deixa a promise do `queryFn` resolver e o `act` entrega o re-render.
async function advanceTimersAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

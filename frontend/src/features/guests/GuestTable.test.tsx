import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from '@/features/guests/api'
import type { Paginated } from '@/lib/apiClient'
import { ApiError } from '@/lib/errors'
import { elementAt, page } from '@/test/fixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ANA, BRUNO, DAVI, inHotel, pendingCheckin } from './__fixtures__/guests'
import { DEBOUNCE_MS, GuestTable } from './GuestTable'
import type { Guest } from './types'

vi.mock('@/features/guests/api')

const BRUNO_IN_HOTEL = inHotel(BRUNO, {
  checkin_date: '2026-08-31',
  checkout_date: '2026-09-02',
  has_vehicle: false,
  checked_in_at: '2026-08-31T15:00:00-03:00',
})

const ANA_PENDING = pendingCheckin(ANA)

describe('GuestTable', () => {
  beforeEach(() => {
    vi.mocked(fetchGuests).mockResolvedValue(page([ANA, DAVI]))
    vi.mocked(fetchGuestsInHotel).mockResolvedValue(page([BRUNO_IN_HOTEL]))
    vi.mocked(fetchGuestsPendingCheckin).mockResolvedValue(page([ANA_PENDING]))
  })

  it('test_search_input_debounces_and_queries', async () => {
    // Tripwire: o componente exporta a constante que o teste avanca, e o
    // contrato de busca fixa 300 ms — divergencia entre as duas quebra aqui.
    expect(DEBOUNCE_MS).toBe(300)

    vi.useFakeTimers()
    try {
      vi.mocked(fetchGuests).mockImplementation(async (search: string) =>
        page(search ? [ANA] : [ANA, DAVI]),
      )

      renderWithProviders(<GuestTable />)
      await advanceTimersAndFlush(0)

      expect(fetchGuests).toHaveBeenCalledTimes(1)
      expect(fetchGuests).toHaveBeenLastCalledWith('')
      expect(screen.getByText('Davi Rocha')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Buscar hóspede'), { target: { value: 'ana' } })
      await advanceTimersAndFlush(0)

      await advanceTimersAndFlush(DEBOUNCE_MS - 1)
      expect(fetchGuests).toHaveBeenCalledTimes(1)

      await advanceTimersAndFlush(1)
      expect(fetchGuests).toHaveBeenCalledTimes(2)
      expect(fetchGuests).toHaveBeenLastCalledWith('ana')

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
    const row = elementAt(within(table).getAllByRole('row'), 1)
    expect(within(row).getByText('Ana Souza')).toBeInTheDocument()
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
})

// `waitFor` do RTL nao reconhece os fake timers do vitest (ele procura o global
// `jest`), entao tempo e microtasks sao avancados a mao: `advanceTimersByTimeAsync`
// deixa a promise do `queryFn` resolver e o `act` entrega o re-render.
async function advanceTimersAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

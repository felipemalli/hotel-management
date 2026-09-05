import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ADMIN, ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import type { UserRole } from '@/features/auth/types'
import { ROOM_201, ROOM_301_INACTIVE, SEED_ROOMS } from '@/features/rooms/__fixtures__/rooms'
import { fetchRooms } from '@/features/rooms/api'
import { ApiError } from '@/lib/errors/errors'
import { SEARCH_DEBOUNCE_MS } from '@/lib/hooks/useDebouncedValue'
import { ROUTES } from '@/lib/routing/routes'
import { page } from '@/test/fixtures'
import { renderPage } from '@/test/renderPage'
import { signInForTest } from '@/test/renderWithProviders'

import { RoomsPage } from './RoomsPage'

vi.mock('@/features/rooms/api')
vi.mock('@/features/auth/api')

function renderRooms(role: UserRole = 'ATTENDANT', route: string = ROUTES.rooms) {
  vi.mocked(fetchCurrentUser).mockResolvedValue(role === 'ADMIN' ? ADMIN : ATTENDANT)
  signInForTest()
  return renderPage(<RoomsPage />, { route, path: ROUTES.rooms })
}

describe('RoomsPage', () => {
  beforeEach(() => {
    vi.mocked(fetchRooms).mockResolvedValue(page(SEED_ROOMS))
  })

  it('mostra o inventario ao atendente, sem controle de escrita', async () => {
    renderRooms()

    const table = await screen.findByRole('table', { name: 'Quartos do hotel' })
    expect(within(table).getByText('101')).toBeInTheDocument()
    expect(within(table).getAllByText('Ativo')).toHaveLength(SEED_ROOMS.length)
    expect(within(table).getByText('3 pessoas')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Novo quarto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument()
  })

  it('oferece ao admin o cadastro e as acoes por linha', async () => {
    const user = userEvent.setup()
    renderRooms('ADMIN')

    await screen.findByRole('table', { name: 'Quartos do hotel' })
    expect(screen.getByRole('button', { name: 'Ações do quarto 101' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Novo quarto' }))

    expect(screen.getByRole('dialog', { name: 'Novo quarto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cadastrar quarto' })).toBeInTheDocument()
  })

  // Select do Base UI não abre em jsdom (floating-ui); ver src/test/setup.ts.
  it('test_toggle_inactive_widens_the_list', async () => {
    const user = userEvent.setup()
    renderRooms('ADMIN')
    await screen.findByRole('table', { name: 'Quartos do hotel' })

    vi.mocked(fetchRooms).mockResolvedValue(page([...SEED_ROOMS, ROOM_301_INACTIVE]))
    await user.click(screen.getByRole('checkbox', { name: 'Mostrar desativados' }))

    await waitFor(() =>
      expect(fetchRooms).toHaveBeenLastCalledWith({
        includeInactive: true,
        page: 1,
        search: '',
      }),
    )
    expect(await screen.findByText('Desativado')).toBeInTheDocument()
    expect(screen.getByText('1 pessoa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ações do quarto 301' })).toBeInTheDocument()
  })

  it('mostra o erro de leitura com retry', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchRooms).mockRejectedValueOnce(
      new ApiError({ code: 'NETWORK_ERROR', detail: 'sem rede', status: 0 }),
    )
    renderRooms()

    await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('table', { name: 'Quartos do hotel' })).toBeInTheDocument()
  })

  it('avisa quando nao ha quarto em operacao', async () => {
    vi.mocked(fetchRooms).mockResolvedValue(page([]))
    renderRooms()

    expect(await screen.findByText('Nenhum quarto em operação')).toBeInTheDocument()
  })

  it('busca pelo numero do quarto no servidor, com debounce', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(fetchRooms).mockImplementation(async ({ search } = {}) =>
        page(search ? [ROOM_201] : SEED_ROOMS),
      )

      renderRooms()
      await advanceTimersAndFlush(0)
      expect(within(screen.getByRole('table')).getByText('101')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Buscar quarto'), { target: { value: '201' } })
      await advanceTimersAndFlush(SEARCH_DEBOUNCE_MS - 1)
      expect(fetchRooms).toHaveBeenCalledTimes(1)

      await advanceTimersAndFlush(1)
      expect(fetchRooms).toHaveBeenLastCalledWith({
        includeInactive: false,
        page: 1,
        search: '201',
      })

      await advanceTimersAndFlush(0)
      expect(screen.queryByText('101')).not.toBeInTheDocument()
      expect(screen.getByText('201')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('avisa quando a busca nao encontra o quarto', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchRooms).mockImplementation(async ({ search } = {}) =>
      page(search ? [] : SEED_ROOMS),
    )
    renderRooms()

    await screen.findByRole('table', { name: 'Quartos do hotel' })
    await user.type(screen.getByLabelText('Buscar quarto'), '999')

    expect(await screen.findByText('Nenhum quarto encontrado.')).toBeInTheDocument()
  })

  it('pagina pelo que o servidor disse existir', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchRooms).mockResolvedValue({
      count: 25,
      next: 'http://localhost/api/rooms/?page=2',
      previous: null,
      results: SEED_ROOMS,
    })
    renderRooms()
    await screen.findByRole('table', { name: 'Quartos do hotel' })

    await user.click(screen.getByRole('button', { name: 'Próxima' }))

    await waitFor(() =>
      expect(fetchRooms).toHaveBeenLastCalledWith({
        includeInactive: false,
        page: 2,
        search: '',
      }),
    )
  })
})

// `waitFor` do RTL não reconhece fake timers do vitest (procura o global `jest`).
// `advanceTimersByTimeAsync` resolve o `queryFn`; `act` entrega o re-render.
async function advanceTimersAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

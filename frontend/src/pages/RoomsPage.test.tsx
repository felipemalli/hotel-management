import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ADMIN, ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import type { UserRole } from '@/features/auth/types'
import { ROOM_301_INACTIVE, SEED_ROOMS } from '@/features/rooms/__fixtures__/rooms'
import { fetchRooms } from '@/features/rooms/api'
import { ApiError } from '@/lib/errors/errors'
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

  // O popup do menu de ações (`Menu` do Base UI) não resolve em jsdom (mesma
  // limitação já documentada para o `Select`): a prova de que o quarto
  // desativado ganha a opção "Reativar" fica para o e2e (RoomDeactivateDialog
  // e RoomCapacityDialog cobrem a regra de negócio de cada ação, montados
  // direto e sem depender do menu).
  it('test_toggle_inactive_widens_the_list', async () => {
    const user = userEvent.setup()
    renderRooms('ADMIN')
    await screen.findByRole('table', { name: 'Quartos do hotel' })

    vi.mocked(fetchRooms).mockResolvedValue(page([...SEED_ROOMS, ROOM_301_INACTIVE]))
    await user.click(screen.getByRole('checkbox', { name: 'Mostrar desativados' }))

    await waitFor(() =>
      expect(fetchRooms).toHaveBeenLastCalledWith({ includeInactive: true, page: 1 }),
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
      expect(fetchRooms).toHaveBeenLastCalledWith({ includeInactive: false, page: 2 }),
    )
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ADMIN, ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import type { UserRole } from '@/features/auth/types'
import { ROOM_101, ROOM_301_INACTIVE, SEED_ROOMS } from '@/features/rooms/__fixtures__/rooms'
import { fetchRooms, updateRoom } from '@/features/rooms/api'
import { ApiError } from '@/lib/errors/errors'
import { toastStore } from '@/lib/notify/toast'
import { ROUTES } from '@/lib/routing/routes'
import { elementAt, page } from '@/test/fixtures'
import { renderPage } from '@/test/renderPage'
import { signInForTest } from '@/test/renderWithProviders'

import { RoomsPage } from './RoomsPage'

vi.mock('@/features/rooms/api')
vi.mock('@/features/auth/api')

// A primeira linha de dado da tabela, sem o cabecalho.
function firstDataRow(): HTMLElement {
  const table = screen.getByRole('table', { name: 'Quartos do hotel' })
  return elementAt(within(table).getAllByRole('row'), 1)
}

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

    await user.click(await screen.findByRole('button', { name: 'Novo quarto' }))

    expect(screen.getByRole('dialog', { name: 'Novo quarto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cadastrar quarto' })).toBeInTheDocument()
  })

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
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeInTheDocument()
  })

  it('desativa apos confirmar e avisa por toast', async () => {
    const user = userEvent.setup()
    vi.mocked(updateRoom).mockResolvedValue({ ...ROOM_101, is_active: false })
    renderRooms('ADMIN')
    await screen.findByRole('table', { name: 'Quartos do hotel' })

    const row = firstDataRow()
    await user.click(within(row).getByRole('button', { name: 'Desativar' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Desativar quarto' })
    expect(dialog).toHaveTextContent('101')
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }))

    await waitFor(() => expect(updateRoom).toHaveBeenCalledWith(ROOM_101.id, { is_active: false }))
    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({ tone: 'success', message: 'Quarto 101 desativado.' }),
      ]),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  // O 409 é recusa do servidor, não do preenchimento: o diálogo fica aberto e o
  // toast diz o porquê.
  it('mantem a confirmacao aberta quando o quarto tem reserva ativa', async () => {
    const user = userEvent.setup()
    vi.mocked(updateRoom).mockRejectedValue(
      new ApiError({
        code: 'INVALID_STATUS',
        detail: 'Quarto com reserva ativa não pode ser desativado.',
        status: 409,
      }),
    )
    renderRooms('ADMIN')
    await screen.findByRole('table', { name: 'Quartos do hotel' })

    const row = firstDataRow()
    await user.click(within(row).getByRole('button', { name: 'Desativar' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Desativar quarto' })
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }))

    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({
          tone: 'error',
          message: 'Quarto com reserva ativa não pode ser desativado.',
        }),
      ]),
    )
    expect(screen.getByRole('alertdialog', { name: 'Desativar quarto' })).toBeInTheDocument()
  })

  it('edita a capacidade e devolve o 400 do servidor ao campo', async () => {
    const user = userEvent.setup()
    vi.mocked(updateRoom).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: { capacity: ['O quarto 101 tem reserva ativa para 2 pessoas.'] },
      }),
    )
    renderRooms('ADMIN')
    await screen.findByRole('table', { name: 'Quartos do hotel' })

    const row = firstDataRow()
    await user.click(within(row).getByRole('button', { name: 'Editar capacidade' }))

    const dialog = await screen.findByRole('dialog', { name: /Editar capacidade/ })
    expect(within(dialog).getByLabelText('Capacidade')).toHaveValue(ROOM_101.capacity)

    await user.clear(within(dialog).getByLabelText('Capacidade'))
    await user.type(within(dialog).getByLabelText('Capacidade'), '1')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(
      await screen.findByText('O quarto 101 tem reserva ativa para 2 pessoas.'),
    ).toBeInTheDocument()
  })

  it('reativa o quarto na propria linha', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchRooms).mockResolvedValue(page([ROOM_301_INACTIVE]))
    vi.mocked(updateRoom).mockResolvedValue({ ...ROOM_301_INACTIVE, is_active: true })
    renderRooms('ADMIN', `${ROUTES.rooms}?is_active=false`)

    await user.click(await screen.findByRole('button', { name: 'Reativar' }))

    await waitFor(() =>
      expect(updateRoom).toHaveBeenCalledWith(ROOM_301_INACTIVE.id, { is_active: true }),
    )
    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({ tone: 'success', message: 'Quarto 301 reativado.' }),
      ]),
    )
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

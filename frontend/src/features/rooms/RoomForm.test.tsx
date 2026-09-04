import { screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRoom } from '@/features/rooms/api'
import { ApiError } from '@/lib/errors/errors'
import { toastStore } from '@/lib/notify/toast'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ROOM_101 } from './__fixtures__/rooms'
import { RoomForm } from './RoomForm'

vi.mock('@/features/rooms/api')

async function fillRoom(user: UserEvent, number = '301', capacity = '3') {
  await user.type(screen.getByLabelText('Número'), number)
  await user.clear(screen.getByLabelText('Capacidade'))
  await user.type(screen.getByLabelText('Capacidade'), capacity)
}

describe('RoomForm', () => {
  beforeEach(() => {
    vi.mocked(createRoom).mockResolvedValue(ROOM_101)
  })

  it('exige o numero e recusa capacidade abaixo de 1 antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RoomForm />)

    await user.clear(screen.getByLabelText('Capacidade'))
    await user.type(screen.getByLabelText('Capacidade'), '0')
    await user.click(screen.getByRole('button', { name: 'Cadastrar quarto' }))

    expect(createRoom).not.toHaveBeenCalled()
    expect(await screen.findByText('Campo obrigatório.')).toBeInTheDocument()
    expect(screen.getByText('A capacidade mínima é 1 pessoa.')).toBeInTheDocument()
  })

  it('avisa quando a capacidade fica vazia', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RoomForm />)

    await user.type(screen.getByLabelText('Número'), '301')
    await user.clear(screen.getByLabelText('Capacidade'))
    await user.click(screen.getByRole('button', { name: 'Cadastrar quarto' }))

    expect(await screen.findByText('Informe a capacidade.')).toBeInTheDocument()
  })

  it('envia a capacidade como inteiro e entrega o quarto criado', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderWithProviders(<RoomForm onSuccess={onSuccess} />)

    await fillRoom(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar quarto' }))

    expect(createRoom).toHaveBeenCalledWith({ number: '301', capacity: 3 })
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ROOM_101))
  })

  it('devolve o numero duplicado ao campo culpado', async () => {
    const user = userEvent.setup()
    vi.mocked(createRoom).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: { number: ['Já existe um quarto com este número.'] },
      }),
    )
    renderWithProviders(<RoomForm />)

    await fillRoom(user, '101')
    await user.click(screen.getByRole('button', { name: 'Cadastrar quarto' }))

    expect(await screen.findByText('Já existe um quarto com este número.')).toBeInTheDocument()
    expect(screen.getByLabelText('Número')).toHaveAttribute('aria-invalid', 'true')
  })

  it('deixa o 403 para o toast global, sem alerta no formulario', async () => {
    const user = userEvent.setup()
    vi.mocked(createRoom).mockRejectedValue(
      new ApiError({
        code: 'PERMISSION_DENIED',
        detail: 'Ação restrita ao administrador do hotel.',
        status: 403,
      }),
    )
    renderWithProviders(<RoomForm />)

    await fillRoom(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar quarto' }))

    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({
          tone: 'error',
          message: 'Ação restrita ao administrador do hotel.',
        }),
      ]),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Cancelar volta sem tocar a API', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderWithProviders(<RoomForm onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(createRoom).not.toHaveBeenCalled()
  })
})

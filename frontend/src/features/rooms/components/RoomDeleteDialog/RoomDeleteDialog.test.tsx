import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ROOM_101 } from '@/features/rooms/__fixtures__/rooms'
import { deleteRoom } from '@/features/rooms/api'
import type { Room } from '@/features/rooms/types'
import { ApiError } from '@/lib/errors/errors'
import { notifySuccess, toastStore } from '@/lib/notify/toast'
import { renderWithProviders } from '@/test/renderWithProviders'

import { RoomDeleteDialog } from './RoomDeleteDialog'

vi.mock('@/features/rooms/api')

function renderDialog(onDeleted: (room: Room) => void = vi.fn()) {
  return renderWithProviders(
    <RoomDeleteDialog room={ROOM_101} onClose={vi.fn()} onDeleted={onDeleted} />,
  )
}

describe('RoomDeleteDialog', () => {
  it('exclui apos confirmar e avisa por toast', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteRoom).mockResolvedValue()
    renderDialog((room) => notifySuccess(`Quarto ${room.number} excluído.`))

    const dialog = screen.getByRole('alertdialog', { name: 'Excluir quarto' })
    expect(dialog).toHaveTextContent('101')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(deleteRoom).toHaveBeenCalledWith(ROOM_101.id))
    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({ tone: 'success', message: 'Quarto 101 excluído.' }),
      ]),
    )
  })

  it('mantem a confirmacao aberta quando o quarto tem historico', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteRoom).mockRejectedValue(
      new ApiError({
        code: 'INVALID_STATUS',
        detail: 'Quarto com histórico de reserva não pode ser excluído.',
        status: 409,
      }),
    )
    renderDialog()

    const dialog = screen.getByRole('alertdialog', { name: 'Excluir quarto' })
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({
          tone: 'error',
          message: 'Quarto com histórico de reserva não pode ser excluído.',
        }),
      ]),
    )
    expect(screen.getByRole('alertdialog', { name: 'Excluir quarto' })).toBeInTheDocument()
  })
})

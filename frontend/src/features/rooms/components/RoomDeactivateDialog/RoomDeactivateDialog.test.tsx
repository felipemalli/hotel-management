import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ROOM_101 } from '@/features/rooms/__fixtures__/rooms'
import { updateRoom } from '@/features/rooms/api'
import type { Room } from '@/features/rooms/types'
import { ApiError } from '@/lib/errors/errors'
import { notifySuccess, toastStore } from '@/lib/notify/toast'
import { renderWithProviders } from '@/test/renderWithProviders'

import { RoomDeactivateDialog } from './RoomDeactivateDialog'

vi.mock('@/features/rooms/api')

// Select do Base UI não abre em jsdom (floating-ui); ver src/test/setup.ts.
function renderDialog(onDeactivated: (room: Room) => void = vi.fn()) {
  return renderWithProviders(
    <RoomDeactivateDialog room={ROOM_101} onClose={vi.fn()} onDeactivated={onDeactivated} />,
  )
}

describe('RoomDeactivateDialog', () => {
  it('desativa apos confirmar e avisa por toast', async () => {
    const user = userEvent.setup()
    vi.mocked(updateRoom).mockResolvedValue({ ...ROOM_101, is_active: false })
    renderDialog((room) => notifySuccess(`Quarto ${room.number} desativado.`))

    const dialog = screen.getByRole('alertdialog', { name: 'Desativar quarto' })
    expect(dialog).toHaveTextContent('101')
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }))

    await waitFor(() => expect(updateRoom).toHaveBeenCalledWith(ROOM_101.id, { is_active: false }))
    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({ tone: 'success', message: 'Quarto 101 desativado.' }),
      ]),
    )
  })

  it('mantem a confirmacao aberta quando o quarto tem reserva ativa', async () => {
    const user = userEvent.setup()
    vi.mocked(updateRoom).mockRejectedValue(
      new ApiError({
        code: 'INVALID_STATUS',
        detail: 'Quarto com reserva ativa não pode ser desativado.',
        status: 409,
      }),
    )
    renderDialog()

    const dialog = screen.getByRole('alertdialog', { name: 'Desativar quarto' })
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
})

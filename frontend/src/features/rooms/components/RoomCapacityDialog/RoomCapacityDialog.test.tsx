import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ROOM_101 } from '@/features/rooms/__fixtures__/rooms'
import { updateRoom } from '@/features/rooms/api'
import { ApiError } from '@/lib/errors/errors'
import { renderWithProviders } from '@/test/renderWithProviders'

import { RoomCapacityDialog } from './RoomCapacityDialog'

vi.mock('@/features/rooms/api')

// Select do Base UI não abre em jsdom (floating-ui); ver src/test/setup.ts.
function renderDialog() {
  return renderWithProviders(
    <RoomCapacityDialog room={ROOM_101} onClose={vi.fn()} onUpdated={vi.fn()} />,
  )
}

describe('RoomCapacityDialog', () => {
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
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: /Editar capacidade/ })
    expect(within(dialog).getByLabelText('Capacidade')).toHaveValue(ROOM_101.capacity)

    await user.clear(within(dialog).getByLabelText('Capacidade'))
    await user.type(within(dialog).getByLabelText('Capacidade'), '1')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(
      await screen.findByText('O quarto 101 tem reserva ativa para 2 pessoas.'),
    ).toBeInTheDocument()
  })
})

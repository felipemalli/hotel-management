import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/app/providers'
import { checkIn, checkOut } from '@/features/reservations/api'
import { ReservationActions } from '@/features/reservations/ReservationActions'
import { ApiError } from '@/lib/errors'

vi.mock('@/features/reservations/api')

function renderActions() {
  return render(
    <AppProviders>
      <ReservationActions reservationId={1} guestName="Ana Souza" state="CHECKED_IN" />
    </AppProviders>,
  )
}

describe('handler global de erros', () => {
  it('exibe em toast a falha inesperada de uma mutation', async () => {
    const user = userEvent.setup()
    vi.mocked(checkOut).mockRejectedValue(
      new ApiError({
        code: 'INVALID_STATUS',
        detail: 'Transição inválida: CHECKED_OUT -> CHECKED_OUT.',
        status: 409,
        extra: { status: 'CHECKED_OUT' },
      }),
    )

    renderActions()
    await user.click(screen.getByRole('button', { name: 'Checkout' }))

    const region = await screen.findByRole('status')
    expect(region).toHaveTextContent('Transição inválida: CHECKED_OUT -> CHECKED_OUT.')

    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).not.toHaveTextContent('Transição inválida'),
    )
  })

  it('exibe a falha de rede em linguagem de balcao', async () => {
    const user = userEvent.setup()
    vi.mocked(checkOut).mockRejectedValue(
      new ApiError({
        code: 'NETWORK_ERROR',
        detail: 'Não foi possível falar com o servidor.',
        status: 0,
      }),
    )

    renderActions()
    await user.click(screen.getByRole('button', { name: 'Checkout' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Não foi possível falar com o servidor.',
    )
  })

  it('nao transforma o 409 EARLY_CHECKIN em toast: ele abre o alertdialog', async () => {
    const user = userEvent.setup()
    vi.mocked(checkIn).mockRejectedValue(
      new ApiError({
        code: 'EARLY_CHECKIN',
        detail: 'Check-in permitido a partir das 14:00.',
        status: 409,
        extra: { server_time: '13:45' },
      }),
    )

    render(
      <AppProviders>
        <ReservationActions reservationId={1} guestName="Ana Souza" state="PENDING" />
      </AppProviders>,
    )
    await user.click(screen.getByRole('button', { name: 'Check-in' }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/app/providers'
import { checkIn, checkOut } from '@/features/reservations/api'
import { ReservationActions } from '@/features/reservations/ReservationActions'
import { ApiError } from '@/lib/errors/errors'
import { toastStore } from '@/lib/notify/toast'

import { Toaster } from './Toaster'

vi.mock('@/features/reservations/api')

function renderActions() {
  return render(
    <AppProviders>
      <ReservationActions
        reservationId={1}
        guestName="Ana Souza"
        state="CHECKED_IN"
        onCheckedOut={vi.fn()}
        onRequestCancel={vi.fn()}
      />
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
        extra: { server_time: '13:45', opens_at: '14:00' },
      }),
    )

    render(
      <AppProviders>
        <ReservationActions
          reservationId={1}
          guestName="Ana Souza"
          state="PENDING"
          onCheckedOut={vi.fn()}
          onRequestCancel={vi.fn()}
        />
      </AppProviders>,
    )
    await user.click(screen.getByRole('button', { name: 'Check-in' }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('Toaster', () => {
  it('pausa o descarte automatico enquanto o ponteiro esta sobre o aviso', async () => {
    vi.useFakeTimers()
    try {
      render(<Toaster />)
      act(() => {
        toastStore.push('error', 'Falha ao registrar o check-in.')
      })

      const card = cardOf('Falha ao registrar o check-in.')
      fireEvent.mouseOver(card)
      await advanceTimers(30_000)
      expect(screen.getByText('Falha ao registrar o check-in.')).toBeInTheDocument()

      fireEvent.mouseOut(card)
      await advanceTimers(8_000)
      expect(screen.queryByText('Falha ao registrar o check-in.')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('anuncia so o aviso novo: a regiao live nao e atomica', () => {
    render(<Toaster />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'false')
  })
})

function cardOf(message: string): HTMLElement {
  // eslint-disable-next-line testing-library/no-node-access -- o cartao nao tem nome acessivel proprio: quem carrega o hover e o container da mensagem.
  const card = screen.getByText(message).parentElement
  if (!card) throw new Error('aviso sem cartao')
  return card
}

async function advanceTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

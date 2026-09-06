import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { askCopilot, fetchAiStatus } from '@/features/ai/api'
import { PAID_T7_STATEMENT } from '@/features/reservations/__fixtures__/bills'
import { reservation } from '@/features/reservations/__fixtures__/reservations'
import { checkIn, checkOut } from '@/features/reservations/api'
import { ApiError } from '@/lib/errors/errors'
import { toastStore } from '@/lib/notify/toast'
import { ROUTES } from '@/lib/routing/routes'
import { IrisPage } from '@/pages/IrisPage'
import { renderPage } from '@/test/renderPage'
import { signInForTest } from '@/test/renderWithProviders'

vi.mock('@/features/ai/api')
vi.mock('@/features/reservations/api')
vi.mock('@/features/auth/api')

const RESERVATION_ID = 4
const GUEST_NAME = 'Ana Souza'
const CHECKED_IN_AT = '2026-09-01T13:46:00-03:00'

function render() {
  return renderPage(<IrisPage />, { route: ROUTES.iris })
}

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
  const input = await screen.findByLabelText('Pergunte à Íris')
  await user.type(input, `${question}{Enter}`)
}

describe('IrisPage', () => {
  beforeEach(() => {
    signInForTest()
    vi.mocked(fetchAiStatus).mockResolvedValue({ enabled: true })
  })

  it('mostra que a Íris está desligada quando o servidor não tem chave', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue({ enabled: false })

    render()

    expect(
      await screen.findByText(/A Íris está desligada neste servidor/, { exact: false }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Pergunte à Íris')).not.toBeInTheDocument()
  })

  it('envia a pergunta com Enter e mostra a resposta sem propor ação', async () => {
    const user = userEvent.setup()
    vi.mocked(askCopilot).mockResolvedValue({
      reply: 'No hotel agora: Bruno Lima no 102, desde ontem às 15:00.',
      proposed_action: null,
    })

    render()
    await ask(user, 'Quem está no 102?')

    await waitFor(() => expect(askCopilot).toHaveBeenCalledWith('Quem está no 102?'))
    expect(
      await screen.findByText('No hotel agora: Bruno Lima no 102, desde ontem às 15:00.'),
    ).toBeInTheDocument()
    expect(screen.getByText('VOCÊ')).toBeInTheDocument()
    expect(screen.getByText('Quem está no 102?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Confirmar/ })).not.toBeInTheDocument()
    expect(checkIn).not.toHaveBeenCalled()
    expect(checkOut).not.toHaveBeenCalled()
  })

  it('sugestão clicada vira pergunta', async () => {
    const user = userEvent.setup()
    vi.mocked(askCopilot).mockResolvedValue({ reply: 'Ninguém no hotel.', proposed_action: null })

    render()
    await user.click(await screen.findByRole('button', { name: 'Quem ainda está no hotel?' }))

    await waitFor(() => expect(askCopilot).toHaveBeenCalledWith('Quem ainda está no hotel?'))
    expect(await screen.findByText('Ninguém no hotel.')).toBeInTheDocument()
  })

  it('o check-in sugerido passa pelo mesmo protocolo e mostra o rodapé concluído', async () => {
    const user = userEvent.setup()
    vi.mocked(askCopilot).mockResolvedValue({
      reply: 'A Ana Souza tem a reserva 4 no quarto 101. O check-in abre às 14:00.',
      proposed_action: {
        type: 'check_in',
        reservation_id: RESERVATION_ID,
        guest_name: GUEST_NAME,
      },
    })
    vi.mocked(checkIn).mockImplementation(async ({ allow_early }) => {
      if (!allow_early) {
        throw new ApiError({
          code: 'EARLY_CHECKIN',
          detail: 'Check-in permitido a partir das 14:00.',
          status: 409,
          extra: { server_time: '13:45', opens_at: '14:00' },
        })
      }
      return reservation({
        id: RESERVATION_ID,
        status: 'CHECKED_IN',
        checked_in_at: CHECKED_IN_AT,
      })
    })

    render()
    await ask(user, 'A Ana chegou.')

    await user.click(await screen.findByRole('button', { name: 'Confirmar check-in' }))

    const alert = await screen.findByRole('alertdialog', { name: 'Check-in antes das 14:00' })
    expect(checkIn).toHaveBeenNthCalledWith(1, { id: RESERVATION_ID, allow_early: false })

    await user.click(within(alert).getByRole('button', { name: 'Confirmar mesmo assim' }))

    await waitFor(() =>
      expect(checkIn).toHaveBeenNthCalledWith(2, {
        id: RESERVATION_ID,
        allow_early: true,
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Confirmar check-in' })).not.toBeInTheDocument(),
    )
    expect(
      screen.getByText(`Check-in de ${GUEST_NAME} registrado em 01/09/2026 13:46`),
    ).toBeInTheDocument()
    expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({ message: `Check-in de ${GUEST_NAME} registrado.` }),
    ])
  })

  it('o checkout sugerido fecha a conta, abre o extrato e mostra o rodapé concluído', async () => {
    const user = userEvent.setup()
    const closing = PAID_T7_STATEMENT
    vi.mocked(askCopilot).mockResolvedValue({
      reply: 'O total é R$ 425,00, com multa de R$ 90,00.',
      proposed_action: {
        type: 'checkout',
        reservation_id: closing.reservation_id,
        guest_name: closing.guest.full_name,
      },
    })
    vi.mocked(checkOut).mockResolvedValue(closing)

    render()
    await ask(user, 'Ela quer sair agora.')

    await user.click(await screen.findByRole('button', { name: 'Confirmar checkout' }))

    await waitFor(() => expect(checkOut).toHaveBeenCalledWith(closing.reservation_id))
    const dialog = await screen.findByRole('dialog', { name: 'Extrato de checkout' })
    expect(dialog).toHaveTextContent('R$ 425,00')
    expect(
      screen.getByText(`Checkout de ${closing.guest.full_name} concluído · conta fechada`),
    ).toBeInTheDocument()
  })

  it('avisa o erro do provedor por toast e deixa perguntar de novo', async () => {
    const user = userEvent.setup()
    vi.mocked(askCopilot).mockRejectedValue(
      new ApiError({
        code: 'AI_UPSTREAM_ERROR',
        detail: 'O provedor de IA não devolveu uma resposta utilizável.',
        status: 502,
      }),
    )

    render()
    await ask(user, 'Quem está no 102?')

    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({
          tone: 'error',
          message: 'O provedor de IA não devolveu uma resposta utilizável.',
        }),
      ]),
    )
    expect(screen.getByRole('button', { name: 'Perguntar' })).toBeInTheDocument()
    expect(screen.getByText(/A Íris lê reservas/, { exact: false })).toBeInTheDocument()
  })
})

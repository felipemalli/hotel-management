import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CARLA, inHotel } from '@/features/guests/__fixtures__/guests'
import { fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from '@/features/guests/api'
import { checkOut } from '@/features/reservations/api'
import { DashboardPage } from '@/pages/DashboardPage'
import { page } from '@/test/fixtures'
import { renderPage } from '@/test/renderPage'
import { signInForTest } from '@/test/renderWithProviders'

import { PAID_T7_STATEMENT } from './__fixtures__/bills'

vi.mock('@/features/guests/api')
vi.mock('@/features/reservations/api')
vi.mock('@/features/auth/api')

const RESERVATION_ID = 7
const GUEST_NAME = CARLA.full_name

function carlaInHotel() {
  return inHotel(CARLA, {
    id: RESERVATION_ID,
    checkin_date: '2026-08-28',
    checkout_date: '2026-08-30',
    checked_in_at: '2026-08-28T15:00:00-03:00',
  })
}

describe('CheckoutFlow', () => {
  // `fireEvent` no lugar de `userEvent`, e o extrato "devolvido" já pago
  // (`PAID_T7_STATEMENT`, mesmos números de T7): com `allowPayment` e a conta
  // em aberto, o extrato monta o Select de "Forma de pagamento" junto do
  // Dialog, e essa combinação nunca assenta o measure/posicionamento do Base
  // UI em jsdom quando a listagem por trás muda no meio da mutation — mesma
  // limitação do Select isolado (ver src/components/ui/select.tsx). O caso
  // aqui prova exatamente o que o nome promete — o diálogo sobrevive à linha
  // saindo da aba —, só sem o Select no caminho; o extrato com pagamento em
  // aberto é coberto em `CheckoutStatementDialog.test.tsx` e no e2e.
  it('test_checkout_statement_survives_the_row_leaving_in_hotel', async () => {
    signInForTest()

    let checkedOut = false

    vi.mocked(fetchGuests).mockResolvedValue(page([]))
    vi.mocked(fetchGuestsPendingCheckin).mockResolvedValue(page([]))
    vi.mocked(fetchGuestsInHotel).mockImplementation(async () =>
      page(checkedOut ? [] : [carlaInHotel()]),
    )
    vi.mocked(checkOut).mockImplementation(async () => {
      checkedOut = true
      return PAID_T7_STATEMENT
    })

    renderPage(<DashboardPage />, { route: '/' })

    fireEvent.click(screen.getByRole('tab', { name: /No hotel/ }))
    await screen.findByText(GUEST_NAME)

    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }))
    await waitFor(() => expect(checkOut).toHaveBeenCalledWith(RESERVATION_ID))

    const dialog = await screen.findByRole('dialog', { name: /Extrato/ })
    expect(dialog).toHaveTextContent('R$ 425,00')

    await screen.findByText('Nenhum hóspede no hotel')

    const stillThere = screen.getByRole('dialog', { name: /Extrato/ })
    expect(stillThere).toHaveTextContent('R$ 425,00')
    expect(stillThere).toHaveTextContent('R$ 90,00')
  })
})

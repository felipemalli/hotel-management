import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CARLA, inHotel } from '@/features/guests/__fixtures__/guests'
import { fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from '@/features/guests/api'
import { PAID_T7_STATEMENT } from '@/features/reservations/__fixtures__/bills'
import { checkOut } from '@/features/reservations/api'
import { GuestsPage } from '@/pages/GuestsPage'
import { page } from '@/test/fixtures'
import { renderPage } from '@/test/renderPage'
import { signInForTest } from '@/test/renderWithProviders'

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
  // Select do Base UI não abre em jsdom (floating-ui); ver src/test/setup.ts.
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

    renderPage(<GuestsPage />, { route: '/' })

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

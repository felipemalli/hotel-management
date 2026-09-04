import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CARLA, inHotel } from '@/features/guests/__fixtures__/guests'
import { fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from '@/features/guests/api'
import { checkOut } from '@/features/reservations/api'
import { DashboardPage } from '@/pages/DashboardPage'
import { page } from '@/test/fixtures'
import { renderPage } from '@/test/renderPage'
import { signInForTest } from '@/test/renderWithProviders'

import { T7_STATEMENT } from './__fixtures__/bills'

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
  it('test_checkout_statement_survives_the_row_leaving_in_hotel', async () => {
    const user = userEvent.setup()
    signInForTest()

    let checkedOut = false

    vi.mocked(fetchGuests).mockResolvedValue(page([]))
    vi.mocked(fetchGuestsPendingCheckin).mockResolvedValue(page([]))
    vi.mocked(fetchGuestsInHotel).mockImplementation(async () =>
      page(checkedOut ? [] : [carlaInHotel()]),
    )
    vi.mocked(checkOut).mockImplementation(async () => {
      checkedOut = true
      return T7_STATEMENT
    })

    renderPage(<DashboardPage />, { route: '/' })

    await user.click(screen.getByRole('tab', { name: /No hotel/ }))
    await screen.findByText(GUEST_NAME)

    await user.click(screen.getByRole('button', { name: 'Checkout' }))
    await waitFor(() => expect(checkOut).toHaveBeenCalledWith(RESERVATION_ID))

    const dialog = await screen.findByRole('dialog', { name: /Extrato/ })
    expect(dialog).toHaveTextContent('R$ 425,00')

    await screen.findByText('Nenhum hóspede no hotel')

    const stillThere = screen.getByRole('dialog', { name: /Extrato/ })
    expect(stillThere).toHaveTextContent('R$ 425,00')
    expect(stillThere).toHaveTextContent('R$ 90,00')
  })
})

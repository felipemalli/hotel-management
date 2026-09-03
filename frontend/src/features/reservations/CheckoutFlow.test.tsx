import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DashboardPage } from '@/app/DashboardPage'
import { fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from '@/features/guests/api'
import type { GuestInHotel } from '@/features/guests/types'
import { checkOut } from '@/features/reservations/api'
import { page } from '@/test/fixtures'
import { renderWithProviders, signInForTest } from '@/test/renderWithProviders'

import { T7_STATEMENT } from './__fixtures__/bills'

vi.mock('@/features/guests/api')
vi.mock('@/features/reservations/api')

const RESERVATION_ID = 7
const GUEST_NAME = 'Carla Nunes'

function carlaInHotel(): GuestInHotel {
  return {
    id: 3,
    full_name: GUEST_NAME,
    document: 'AB123456',
    phone: '21988885555',
    created_at: '2026-08-28T08:00:00-03:00',
    active_reservation: {
      id: RESERVATION_ID,
      checkin_date: '2026-08-28',
      checkout_date: '2026-08-30',
      has_vehicle: true,
      checked_in_at: '2026-08-28T15:00:00-03:00',
    },
  }
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

    renderWithProviders(<DashboardPage />)

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

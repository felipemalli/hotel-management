import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DashboardPage } from '@/app/DashboardPage'
import {
  fetchGuests,
  fetchGuestsInHotel,
  fetchGuestsPendingCheckin,
} from '@/features/guests/api'
import type { GuestInHotel } from '@/features/guests/types'
import { checkOut } from '@/features/reservations/api'
import type { Paginated } from '@/lib/apiClient'
import { renderWithProviders, resetGlobalStores, signInForTest } from '@/test/renderWithProviders'

import { T7_STATEMENT } from './__fixtures__/bills'

vi.mock('@/features/guests/api')
vi.mock('@/features/reservations/api')

/**
 * O checkout ponta a ponta — prova de RF7 e RN6 no fluxo, nao no render.
 *
 * `CheckoutStatementDialog.test.tsx` monta o dialogo com `open` fixo: prova que
 * ele desenha o extrato certo, nao que o atendente consegue ler o extrato na
 * aplicacao. Sao coisas diferentes, e a diferenca era um defeito real: o
 * extrato morava em `useState` dentro do `ReservationActions`, que e renderizado
 * DENTRO da linha da tabela. O checkout tira o hospede da aba "No hotel", a
 * invalidacao da SPEC 5.2 refaz a listagem, a linha desmonta e levava o dialogo
 * com ela. O total piscava e desaparecia — RN6, requisito literal do briefing,
 * reprovado na aplicacao real enquanto a suite ficava verde.
 *
 * Este teste falha se o estado do extrato voltar para dentro da linha.
 */

const RESERVATION_ID = 7
const GUEST_NAME = 'Carla Nunes'

function page<T>(results: T[]): Paginated<T> {
  return { count: results.length, next: null, previous: null, results }
}

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
  beforeEach(() => {
    resetGlobalStores()
    vi.mocked(checkOut).mockReset()
    vi.mocked(fetchGuests).mockReset()
    vi.mocked(fetchGuestsInHotel).mockReset()
    vi.mocked(fetchGuestsPendingCheckin).mockReset()
  })

  it('test_checkout_statement_survives_the_row_leaving_in_hotel', async () => {
    const user = userEvent.setup()
    signInForTest()

    // O servidor segue o fato: apos o checkout o hospede sai de "no hotel".
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

    // 1. O extrato abre com os numeros do T7 (SPEC 3.3).
    const dialog = await screen.findByRole('dialog', { name: /Extrato/ })
    expect(dialog).toHaveTextContent('R$ 425,00')

    // 2. A linha sai da aba: e exatamente isso que desmontava o dialogo antes.
    await screen.findByText('Nenhum hóspede no hotel')

    // 3. E o extrato CONTINUA na tela, legivel, com o total.
    const stillThere = screen.getByRole('dialog', { name: /Extrato/ })
    expect(stillThere).toHaveTextContent('R$ 425,00')
    expect(stillThere).toHaveTextContent('R$ 90,00')
  })
})

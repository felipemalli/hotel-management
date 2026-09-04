import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ADMIN, ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import type { UserRole } from '@/features/auth/types'
import { BOOTSTRAP_POLICY, HIGH_SEASON_POLICY } from '@/features/pricing/__fixtures__/policies'
import { createPolicy, fetchCurrentPolicy, fetchPolicies } from '@/features/pricing/api'
import { ApiError } from '@/lib/errors/errors'
import { ROUTES } from '@/lib/routing/routes'
import { elementAt, page } from '@/test/fixtures'
import { renderPage } from '@/test/renderPage'
import { signInForTest } from '@/test/renderWithProviders'

import { PricingPage } from './PricingPage'

vi.mock('@/features/pricing/api')
vi.mock('@/features/auth/api')

function renderPricing(role: UserRole = 'ATTENDANT') {
  vi.mocked(fetchCurrentUser).mockResolvedValue(role === 'ADMIN' ? ADMIN : ATTENDANT)
  signInForTest()
  return renderPage(<PricingPage />, { route: ROUTES.pricing })
}

describe('PricingPage', () => {
  beforeEach(() => {
    vi.mocked(fetchCurrentPolicy).mockResolvedValue(BOOTSTRAP_POLICY)
    vi.mocked(fetchPolicies).mockResolvedValue(page([BOOTSTRAP_POLICY]))
    vi.mocked(createPolicy).mockResolvedValue(HIGH_SEASON_POLICY)
  })

  it('mostra a tarifa vigente com os valores do briefing', async () => {
    renderPricing()

    expect(await screen.findByText('R$ 120,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 180,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 15,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 20,00')).toBeInTheDocument()
    expect(screen.getByText('0,5000 × a diária do dia da saída')).toBeInTheDocument()
    expect(screen.getByText('tarifa do briefing (bootstrap)')).toBeInTheDocument()
  })

  it('nomeia a implantacao em vez de mostrar a data-sentinela do bootstrap', async () => {
    renderPricing()

    expect(await screen.findByText('a implantação (tarifa do briefing)')).toBeInTheDocument()
    expect(screen.queryByText(/1999|2000/)).not.toBeInTheDocument()
    // "sistema" no cartão e na linha do histórico: implantação sem ator.
    expect(screen.getAllByText('sistema')).toHaveLength(2)
  })

  it('lista o historico e marca a vigente', async () => {
    vi.mocked(fetchCurrentPolicy).mockResolvedValue(HIGH_SEASON_POLICY)
    vi.mocked(fetchPolicies).mockResolvedValue(page([HIGH_SEASON_POLICY, BOOTSTRAP_POLICY]))
    renderPricing()

    const table = await screen.findByRole('table', { name: 'Histórico de tarifas' })
    const rows = within(table).getAllByRole('row').slice(1)

    expect(rows).toHaveLength(2)
    expect(within(elementAt(rows, 0)).getByText('Vigente')).toBeInTheDocument()
    expect(within(elementAt(rows, 0)).getByText('admin')).toBeInTheDocument()
    expect(within(elementAt(rows, 1)).getByText(/implantação/)).toBeInTheDocument()
    // Nota vazia da alta temporada vira travessão.
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('esconde do atendente o botao de publicar', async () => {
    renderPricing()

    await screen.findByText('R$ 120,00')
    expect(screen.queryByRole('button', { name: 'Publicar nova tarifa' })).not.toBeInTheDocument()
  })

  it('publica a partir do dialogo e mostra a tarifa nova', async () => {
    const user = userEvent.setup()
    renderPricing('ADMIN')

    await user.click(await screen.findByRole('button', { name: 'Publicar nova tarifa' }))

    const dialog = await screen.findByRole('dialog', { name: 'Publicar nova tarifa' })
    vi.mocked(fetchCurrentPolicy).mockResolvedValue(HIGH_SEASON_POLICY)
    await user.click(within(dialog).getByRole('button', { name: 'Publicar tarifa' }))

    await waitFor(() => expect(createPolicy).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Publicar nova tarifa' }),
      ).not.toBeInTheDocument(),
    )
    expect(await screen.findByText('R$ 150,00')).toBeInTheDocument()
  })

  it('mostra o erro com retry quando a vigente nao carrega', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCurrentPolicy).mockRejectedValueOnce(
      new ApiError({ code: 'NETWORK_ERROR', detail: 'sem rede', status: 0 }),
    )
    renderPricing()

    await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('R$ 120,00')).toBeInTheDocument()
  })

  it('avisa quando nao ha tarifa publicada no historico', async () => {
    vi.mocked(fetchPolicies).mockResolvedValue(page([]))
    renderPricing()

    expect(await screen.findByText('Nenhuma tarifa publicada')).toBeInTheDocument()
  })

  it('pagina o historico pelo que o servidor disse existir', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchPolicies).mockResolvedValue({
      count: 25,
      next: 'http://localhost/api/pricing-policies/?page=2',
      previous: null,
      results: [BOOTSTRAP_POLICY],
    })
    renderPricing()
    await screen.findByRole('table', { name: 'Histórico de tarifas' })

    await user.click(screen.getByRole('button', { name: 'Próxima' }))

    await waitFor(() => expect(fetchPolicies).toHaveBeenLastCalledWith(2))
  })
})

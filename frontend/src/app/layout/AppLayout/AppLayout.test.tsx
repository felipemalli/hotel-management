import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ADMIN, ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import { session } from '@/lib/auth/session'
import { ROUTES } from '@/lib/routing/routes'
import { renderWithProviders, signInForTest } from '@/test/renderWithProviders'

import { AppLayout } from './AppLayout'

vi.mock('@/features/auth/api')

function renderLayout(route: string = ROUTES.home, page = <p>conteúdo</p>) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={ROUTES.home} element={page} />
        <Route path={ROUTES.reservations} element={page} />
        <Route path={`${ROUTES.reservations}/:id`} element={page} />
      </Route>
    </Routes>,
    { route },
  )
}

function Explodes(): never {
  throw new Error('quebrou a página')
}

describe('AppLayout', () => {
  it('nao mostra o chip de admin enquanto o papel nao chegou', () => {
    vi.mocked(fetchCurrentUser).mockReturnValue(new Promise(() => undefined))
    signInForTest()
    renderLayout()

    expect(screen.queryByText('admin')).not.toBeInTheDocument()
  })

  it('nao mostra o chip para o atendente', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(ATTENDANT)
    signInForTest()
    renderLayout()

    await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalled())
    expect(screen.queryByText('admin')).not.toBeInTheDocument()
  })

  it('mostra o chip quando o servidor diz que o usuario e admin', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(ADMIN)
    signInForTest()
    renderLayout()

    expect(await screen.findByText('admin', { selector: 'span' })).toBeInTheDocument()
  })

  it('lista o menu principal e marca a rota corrente', () => {
    renderLayout()

    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(screen.getByRole('link', { name: 'Hóspedes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Reservas' })).not.toHaveAttribute('aria-current')
    expect(nav).toBeInTheDocument()
  })

  // `end` só na Hóspedes: `/reservas/7` ainda é "Reservas".
  it('mantem Reservas ativo no detalhe e desmarca a recepcao', () => {
    renderLayout(ROUTES.reservation(7))

    expect(screen.getByRole('link', { name: 'Reservas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Hóspedes' })).not.toHaveAttribute('aria-current')
  })

  it('mostra o atendente que o servidor identificou e oferece o menu para encerrar', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue({ ...ATTENDANT, username: 'gerencia' })
    signInForTest()
    renderLayout()

    expect(await screen.findByText('gerencia')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu da sessão' })).toBeInTheDocument()
  })

  it('cai no rotulo generico enquanto a identidade nao chegou', () => {
    vi.mocked(fetchCurrentUser).mockReturnValue(new Promise(() => undefined))
    signInForTest()
    renderLayout()

    expect(screen.getByText('atendente')).toBeInTheDocument()
  })

  // Select do Base UI não abre em jsdom (floating-ui); ver src/test/setup.ts.
  it('encerra a sessao', () => {
    signInForTest()
    renderLayout()

    session.clear()

    expect(session.getAccessToken()).toBeNull()
  })

  it('mantem cabecalho e menu de pe quando a pagina quebra', () => {
    renderLayout(ROUTES.home, <Explodes />)

    expect(screen.getByRole('alert')).toHaveTextContent('quebrou a página')
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aurelia' })).toBeInTheDocument()
  })

  it('oferece o atalho para o conteudo, que e o alvo do foco apos os dialogos', () => {
    renderLayout()

    expect(screen.getByRole('link', { name: 'Ir para o conteúdo' })).toHaveAttribute(
      'href',
      '#main',
    )
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})

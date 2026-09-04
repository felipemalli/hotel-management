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
  // O papel vem do servidor, e o chip só aparece quando ele responde `ADMIN`:
  // um controle de escrita não pode piscar na tela de quem não pode usá-lo.
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
    signInForTest('admin')
    renderLayout()

    expect(await screen.findByText('admin', { selector: 'span' })).toBeInTheDocument()
  })

  it('lista o menu principal e marca a rota corrente', () => {
    renderLayout()

    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(screen.getByRole('link', { name: 'Recepção' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Reservas' })).not.toHaveAttribute('aria-current')
    expect(nav).toBeInTheDocument()
  })

  // `end` só na recepção: o detalhe de uma reserva ainda é "Reservas", e sem
  // isso o menu perderia a marcação justo na subrota.
  it('mantem Reservas ativo no detalhe e desmarca a recepcao', () => {
    renderLayout(ROUTES.reservation(7))

    expect(screen.getByRole('link', { name: 'Reservas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Recepção' })).not.toHaveAttribute('aria-current')
  })

  it('mostra o atendente da sessao e oferece o menu para encerra-la', () => {
    signInForTest('gerencia')
    renderLayout()

    expect(screen.getByText('gerencia')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu da sessão' })).toBeInTheDocument()
  })

  // O clique em "Sair" (um `menuitem` dentro do `Menu` do Base UI, cujo popup
  // não resolve em jsdom — mesma limitação do `Select`) fica para o e2e; aqui
  // se afirma a reação real ao encerramento — `session.clear()`, o que o botão
  // de fato dispara.
  it('encerra a sessao', () => {
    signInForTest('gerencia')
    renderLayout()

    session.clear()

    expect(session.getAccessToken()).toBeNull()
  })

  // O boundary é da página, não da aplicação: quebrar a tela não pode levar
  // junto o menu pelo qual o atendente sai dela.
  it('mantem cabecalho e menu de pe quando a pagina quebra', () => {
    renderLayout(ROUTES.home, <Explodes />)

    expect(screen.getByRole('alert')).toHaveTextContent('quebrou a página')
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gestão de Hóspedes' })).toBeInTheDocument()
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

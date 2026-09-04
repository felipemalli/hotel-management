import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ROUTES } from '@/lib/routes'
import { session } from '@/lib/session'
import { renderWithProviders, signInForTest } from '@/test/renderWithProviders'

import { AppLayout } from './AppLayout'

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

  it('mostra o atendente da sessao e o encerra pelo botao', async () => {
    const user = userEvent.setup()
    signInForTest('gerencia')
    renderLayout()

    expect(screen.getByText('gerencia')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sair' }))

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

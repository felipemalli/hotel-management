import { screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { login } from '@/features/auth/api'
import { session, type TokenPair } from '@/lib/auth/session'
import { ApiError } from '@/lib/errors/errors'
import { toastStore } from '@/lib/notify/toast'
import { renderWithProviders } from '@/test/renderWithProviders'

import { LoginPage } from './LoginPage'

vi.mock('@/features/auth/api')

const TOKENS: TokenPair = { access: 'access-do-atendente', refresh: 'refresh-do-atendente' }

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<h1>Painel da recepção</h1>} />
    </Routes>,
    { route: '/login' },
  )
}

async function fillCredentials(user: UserEvent) {
  await user.type(screen.getByLabelText('Usuário'), 'atendente')
  await user.type(screen.getByLabelText('Senha'), 'senha-secreta')
}

describe('LoginPage', () => {
  it('exige usuário e senha antes de tocar a API', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(login).not.toHaveBeenCalled()
    expect(await screen.findAllByText('Campo obrigatório.')).toHaveLength(2)
    expect(screen.getByLabelText('Usuário')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true')
  })

  it('apresenta a credencial inválida no alerta do formulário, sem toast', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockRejectedValue(
      new ApiError({
        code: 'NOT_AUTHENTICATED',
        detail: 'No active account found with the given credentials',
        status: 401,
      }),
    )
    renderLogin()

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.')
    expect(toastStore.getSnapshot()).toHaveLength(0)
    expect(session.getAccessToken()).toBeNull()
  })

  it('grava a sessão e leva ao painel quando as credenciais valem', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockResolvedValue(TOKENS)
    renderLogin()

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(login).toHaveBeenCalledWith({ username: 'atendente', password: 'senha-secreta' })
    expect(await screen.findByRole('heading', { name: 'Painel da recepção' })).toBeInTheDocument()
    expect(session.getAccessToken()).toBe(TOKENS.access)
    expect(session.getUsername()).toBe('atendente')
  })

  it('anuncia o pedido em voo no próprio botão', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockReturnValue(new Promise<TokenPair>(() => undefined))
    renderLogin()

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    const pending = await screen.findByRole('button', { name: 'Entrando…' })
    await waitFor(() => expect(pending).toBeDisabled())
  })
})

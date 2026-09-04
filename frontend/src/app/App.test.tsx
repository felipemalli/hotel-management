import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchGuests } from '@/features/guests/api'
import { session } from '@/lib/auth/session'
import { signInForTest } from '@/test/renderWithProviders'

import { App } from './App'

vi.mock('@/features/guests/api')
vi.mock('@/features/auth/api')

describe('App', () => {
  beforeEach(() => {
    vi.mocked(fetchGuests).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
  })

  it('cai no login sem sessao', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Gestão de Hóspedes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('abre o dashboard com sessao valida', async () => {
    signInForTest()
    render(<App />)

    expect(
      await screen.findByRole('tablist', { name: 'Listagens de hóspedes' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo hóspede' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu da sessão' })).toBeInTheDocument()
  })

  // "Sair" é um `menuitem` dentro do `Menu` do Base UI, cujo popup não resolve
  // em jsdom (mesma limitação já documentada para o `Select`): o clique em si
  // fica para o e2e, e aqui se afirma a reação real ao encerramento da sessão
  // — `session.clear()`, o que o botão de fato dispara — que é o comportamento
  // sob teste.
  it('nao entrega ao proximo atendente a listagem do anterior', async () => {
    signInForTest('recepcao')
    render(<App />)

    await screen.findByRole('tablist', { name: 'Listagens de hóspedes' })
    expect(fetchGuests).toHaveBeenCalledTimes(1)

    session.clear()
    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument()

    signInForTest('gerencia')

    // Sem a purga do cache o dado ainda estaria fresco (`staleTime`) e a
    // listagem do atendente anterior voltaria para a tela sem uma leitura nova.
    await waitFor(() => expect(fetchGuests).toHaveBeenCalledTimes(2))
  })
})

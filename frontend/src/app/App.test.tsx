import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ATTENDANT } from '@/features/auth/__fixtures__/users'
import { fetchCurrentUser } from '@/features/auth/api'
import { fetchGuests } from '@/features/guests/api'
import { session } from '@/lib/auth/session'
import { signInForTest } from '@/test/renderWithProviders'

import { App } from './App'

vi.mock('@/features/guests/api')
vi.mock('@/features/auth/api')

describe('App', () => {
  beforeEach(() => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(ATTENDANT)
    vi.mocked(fetchGuests).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
  })

  it('cai no login sem sessao', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Gestão de Hotel' })).toBeInTheDocument()
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('abre a listagem de hospedes com sessao valida', async () => {
    signInForTest()
    render(<App />)

    expect(
      await screen.findByRole('tablist', { name: 'Listagens de hóspedes' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo hóspede' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu da sessão' })).toBeInTheDocument()
  })

  // Select do Base UI não abre em jsdom (floating-ui); ver src/test/setup.ts.
  it('nao entrega ao proximo atendente a listagem do anterior', async () => {
    signInForTest()
    render(<App />)

    await screen.findByRole('tablist', { name: 'Listagens de hóspedes' })
    expect(fetchGuests).toHaveBeenCalledTimes(1)

    session.clear()
    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument()

    signInForTest()

    // Sem purgar o cache, `staleTime` devolveria a listagem do atendente anterior.
    await waitFor(() => expect(fetchGuests).toHaveBeenCalledTimes(2))
  })
})

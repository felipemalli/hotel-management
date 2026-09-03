import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchGuests } from '@/features/guests/api'
import { signInForTest } from '@/test/renderWithProviders'

import { App } from './App'

vi.mock('@/features/guests/api')

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
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })

  it('nao entrega ao proximo atendente a listagem do anterior', async () => {
    const user = userEvent.setup()
    signInForTest('recepcao')
    render(<App />)

    await screen.findByRole('tablist', { name: 'Listagens de hóspedes' })
    expect(fetchGuests).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument()

    signInForTest('gerencia')

    // Sem a purga do cache o dado ainda estaria fresco (`staleTime`) e a
    // listagem do atendente anterior voltaria para a tela sem uma leitura nova.
    await waitFor(() => expect(fetchGuests).toHaveBeenCalledTimes(2))
  })
})

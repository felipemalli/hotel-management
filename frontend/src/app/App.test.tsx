import { render, screen } from '@testing-library/react'
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
})

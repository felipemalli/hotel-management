import { render, screen } from '@testing-library/react'

import { fetchGuests } from '@/features/guests/api'
import { resetGlobalStores, signInForTest } from '@/test/renderWithProviders'

import { App } from './App'

vi.mock('@/features/guests/api')

/**
 * Fumaca de rota (SPEC 5.1: `/login` e `/`).
 *
 * Monta a app inteira — providers, router e o portao de sessao — e prova que a
 * arvore de cada estado esta ligada. O comportamento de cada peca tem teste
 * proprio na suite da SPEC 6.2; aqui o que se verifica e a montagem.
 */
describe('App', () => {
  beforeEach(() => {
    resetGlobalStores()
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

    // A regiao do handler global de erros (SPEC 8.2/E) vive nos providers.
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('abre o dashboard com sessao valida', async () => {
    signInForTest()
    render(<App />)

    expect(await screen.findByRole('tablist', { name: 'Listagens de hóspedes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo hóspede' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })
})

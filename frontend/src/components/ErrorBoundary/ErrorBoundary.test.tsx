import { useQuery } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { errorLogger, type ErrorSink } from '@/lib/errorLogger'
import { ApiError, errorMessage } from '@/lib/errors'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ErrorBoundary } from './ErrorBoundary'

function Boom({ broken }: { broken: boolean }) {
  if (broken) throw new Error('render quebrado')
  return <p>conteúdo vivo</p>
}

function Widget({ load }: { load: () => Promise<string> }) {
  const query = useQuery({ queryKey: ['widget'], queryFn: load })
  if (query.data !== undefined) return <p>{query.data}</p>
  if (query.isError) return <p>inline: {errorMessage(query.error)}</p>
  return <p>Carregando…</p>
}

function serverFault(): Promise<string> {
  return Promise.reject(
    new ApiError({ code: 'UNKNOWN_ERROR', detail: 'Erro inesperado do servidor.', status: 500 }),
  )
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // O React relata no console todo erro que um boundary captura; o teste já
    // afirma sobre o fallback, então o relato só polui a saída.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('troca a árvore quebrada pelo fallback e volta ao conteúdo no retry', async () => {
    const user = userEvent.setup()
    let broken = true

    const { rerender } = renderWithProviders(
      <ErrorBoundary scope="teste">
        <Boom broken={broken} />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado')
    expect(screen.getByText('Detalhes técnicos')).toBeInTheDocument()

    broken = false
    rerender(
      <ErrorBoundary scope="teste">
        <Boom broken={broken} />
      </ErrorBoundary>,
    )
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(screen.getByText('conteúdo vivo')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('registra o escopo e a rota no logger, sem o payload do erro', () => {
    const capture = vi.fn()
    const restore = errorLogger.use({ capture } satisfies ErrorSink)

    try {
      renderWithProviders(
        <ErrorBoundary scope="guest-table">
          <Boom broken />
        </ErrorBoundary>,
      )
    } finally {
      restore()
    }

    expect(capture).toHaveBeenCalledTimes(1)
    const [error, context] = capture.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(error).toBeInstanceOf(Error)
    expect(context.scope).toBe('guest-table')
    expect(context.path).toBe('/')
    expect(context.at).toEqual(expect.any(String))
    expect(context.componentStack).toContain('Boom')
    expect(context).not.toHaveProperty('extra')
  })

  it('usa o fallback recebido no lugar do padrão', () => {
    renderWithProviders(
      <ErrorBoundary scope="teste" fallback={() => <p role="alert">tabela indisponível</p>}>
        <Boom broken />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('tabela indisponível')
    expect(screen.queryByText('Algo deu errado')).not.toBeInTheDocument()
  })
})

describe('roteamento de erro de query', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('manda o 500 da primeira carga ao boundary e refaz a leitura no retry', async () => {
    const user = userEvent.setup()
    const load = vi.fn(serverFault)

    renderWithProviders(
      <ErrorBoundary scope="teste">
        <Widget load={load} />
      </ErrorBoundary>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado')

    load.mockImplementation(() => Promise.resolve('4 hóspedes'))
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('4 hóspedes')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('mantem a falha de rede inline: derrubar a tela nao traz o servidor de volta', async () => {
    const load = vi.fn(() =>
      Promise.reject(
        new ApiError({
          code: 'NETWORK_ERROR',
          detail: 'Não foi possível falar com o servidor.',
          status: 0,
        }),
      ),
    )

    renderWithProviders(
      <ErrorBoundary scope="teste">
        <Widget load={load} />
      </ErrorBoundary>,
    )

    expect(await screen.findByText(/inline:/)).toHaveTextContent(
      'Não foi possível falar com o servidor.',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('preserva o dado na tela quando o refetch falha com 500', async () => {
    const load = vi.fn(() => Promise.resolve('4 hóspedes'))

    const { queryClient } = renderWithProviders(
      <ErrorBoundary scope="teste">
        <Widget load={load} />
      </ErrorBoundary>,
    )

    expect(await screen.findByText('4 hóspedes')).toBeInTheDocument()

    load.mockImplementation(serverFault)
    await queryClient.refetchQueries({ queryKey: ['widget'] })

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(screen.getByText('4 hóspedes')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

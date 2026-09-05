import { render, screen } from '@testing-library/react'
import axios, {
  type AxiosAdapter,
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { session as SessionValue } from '@/lib/auth/session'

import type { SessionGate as SessionGateValue } from './SessionGate'

const REFRESH = '/auth/token/refresh/'

let reply: (config: InternalAxiosRequestConfig) => AxiosResponse | AxiosError

const adapter: AxiosAdapter = (config) => {
  const result = reply(config)
  return result instanceof AxiosError ? Promise.reject(result) : Promise.resolve(result)
}

const originalAdapter = axios.defaults.adapter

let SessionGate: typeof SessionGateValue
let session: typeof SessionValue

function responded(data: unknown, status: number) {
  return (config: InternalAxiosRequestConfig): AxiosResponse => ({
    status,
    statusText: 'OK',
    data,
    headers: {},
    config,
  })
}

function refused(status: number) {
  return (config: InternalAxiosRequestConfig): AxiosError =>
    new AxiosError('recusado', String(status), config, {}, responded(null, status)(config))
}

// O estado inicial `restoring` e de modulo: sem recarregar, o teste anterior o gastaria.
beforeEach(async () => {
  vi.resetModules()
  axios.defaults.adapter = adapter
  reply = () => {
    throw new Error(`nenhuma resposta configurada para ${REFRESH}`)
  }

  const gateModule = await import('./SessionGate')
  const sessionModule = await import('@/lib/auth/session')
  const clientModule = await import('@/lib/api/apiClient')
  clientModule.apiClient.defaults.adapter = adapter
  const loggerModule = await import('@/lib/errors/errorLogger')
  loggerModule.errorLogger.use({ capture: () => undefined })

  SessionGate = gateModule.SessionGate
  session = sessionModule.session
  document.cookie = 'csrftoken=csrf-do-teste'
})

afterEach(() => {
  axios.defaults.adapter = originalAdapter
  document.cookie = 'csrftoken=; max-age=0'
})

describe('SessionGate', () => {
  it('segura a arvore enquanto pergunta ao cookie', () => {
    reply = responded({ access: 'access-do-cookie' }, 200)
    render(
      <SessionGate>
        <p>recepção</p>
      </SessionGate>,
    )

    expect(session.getStatus()).toBe('restoring')
    expect(screen.getByRole('status')).toHaveTextContent('Carregando')
    expect(screen.queryByText('recepção')).not.toBeInTheDocument()
  })

  it('entrega a aplicacao autenticada quando o cookie vale', async () => {
    reply = responded({ access: 'access-do-cookie' }, 200)
    render(
      <SessionGate>
        <p>recepção</p>
      </SessionGate>,
    )

    expect(await screen.findByText('recepção')).toBeInTheDocument()
    expect(session.getStatus()).toBe('authenticated')
  })

  it('entrega a aplicacao anonima quando nao ha cookie', async () => {
    reply = refused(401)
    render(
      <SessionGate>
        <p>recepção</p>
      </SessionGate>,
    )

    expect(await screen.findByText('recepção')).toBeInTheDocument()
    expect(session.getStatus()).toBe('anonymous')
  })

  it('nao segura nada quando o navegador nunca guardou o csrftoken', () => {
    document.cookie = 'csrftoken=; max-age=0'
    render(
      <SessionGate>
        <p>recepção</p>
      </SessionGate>,
    )

    expect(screen.getByText('recepção')).toBeInTheDocument()
    expect(session.getStatus()).toBe('anonymous')
  })
})

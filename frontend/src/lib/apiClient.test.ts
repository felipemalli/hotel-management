import axios, {
  type AxiosAdapter,
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { apiClient as ApiClientValue, parseResponse as ParseResponseValue } from './apiClient'
import type { ErrorContext } from './errorLogger'
import type { session as SessionValue } from './session'
import type { toastStore as ToastStoreValue } from './toast'

type Reply = (config: InternalAxiosRequestConfig) => AxiosResponse | AxiosError

interface RecordedRequest {
  url: string
  authorization: string | undefined
  body: string | undefined
}

const GUESTS = '/guests/'
const REFRESH = '/auth/token/refresh/'
const TOKEN = '/auth/token/'

function responseFor(
  config: InternalAxiosRequestConfig,
  data: unknown,
  status: number,
): AxiosResponse {
  return { status, statusText: 'OK', data, headers: {}, config }
}

function ok(data: unknown, status = 200): Reply {
  return (config) => responseFor(config, data, status)
}

function failure(status: number, data: unknown): Reply {
  return (config) =>
    new AxiosError('falha simulada', String(status), config, {}, responseFor(config, data, status))
}

function offline(): Reply {
  return (config) => new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {})
}

const unauthorized = () =>
  failure(401, { code: 'NOT_AUTHENTICATED', detail: 'Token inválido ou expirado.' })

const requests: RecordedRequest[] = []
const replies = new Map<string, Reply[]>()

function on(url: string, ...sequence: Reply[]): void {
  replies.set(url, sequence)
}

// A última resposta da fila fica valendo para as chamadas seguintes: "401 e
// depois 200 sempre" cabe em duas entradas.
function nextReply(url: string): Reply {
  const sequence = replies.get(url) ?? []
  const [first, ...rest] = sequence
  if (first === undefined) return ok(null)
  if (rest.length > 0) replies.set(url, rest)
  return first
}

function authorizationOf(config: InternalAxiosRequestConfig): string | undefined {
  const value = AxiosHeaders.from(config.headers).get('Authorization')
  return typeof value === 'string' ? value : undefined
}

// Nenhuma requisição sai daqui: o adapter é o transporte inteiro, e o resto da
// cadeia de interceptors é a de produção.
const adapter: AxiosAdapter = (config) => {
  const url = config.url ?? ''
  requests.push({
    url,
    authorization: authorizationOf(config),
    body: typeof config.data === 'string' ? config.data : undefined,
  })

  const result = nextReply(url)(config)
  return result instanceof AxiosError ? Promise.reject(result) : Promise.resolve(result)
}

const originalAdapter = axios.defaults.adapter

let apiClient: typeof ApiClientValue
let parseResponse: typeof ParseResponseValue
let session: typeof SessionValue
let toastStore: typeof ToastStoreValue
let capture: ReturnType<typeof vi.fn<(error: unknown, context: ErrorContext) => void>>

// A promise de renovação é estado de módulo: sem recarregar o módulo, um teste
// herdaria o refresh em voo do anterior.
beforeEach(async () => {
  vi.resetModules()
  axios.defaults.adapter = adapter

  const clientModule = await import('./apiClient')
  const sessionModule = await import('./session')
  const toastModule = await import('./toast')
  const loggerModule = await import('./errorLogger')

  apiClient = clientModule.apiClient
  apiClient.defaults.adapter = adapter
  parseResponse = clientModule.parseResponse
  session = sessionModule.session
  toastStore = toastModule.toastStore
  capture = vi.fn<(error: unknown, context: ErrorContext) => void>()
  loggerModule.errorLogger.use({ capture })

  session.set({ access: 'access-1', refresh: 'refresh-1', username: 'recepcao' })
})

afterEach(() => {
  axios.defaults.adapter = originalAdapter
  requests.length = 0
  replies.clear()
  window.localStorage.clear()
})

function callsTo(url: string): RecordedRequest[] {
  return requests.filter((request) => request.url === url)
}

describe('apiClient · injecao do token', () => {
  it('manda o Bearer nas rotas de negocio e isenta as de autenticacao', async () => {
    on(GUESTS, ok({ results: [] }))
    on(TOKEN, ok({ access: 'access-1', refresh: 'refresh-1' }))

    await apiClient.get(GUESTS)
    await apiClient.post(TOKEN, { username: 'recepcao', password: 'segredo' })

    expect(callsTo(GUESTS)[0]?.authorization).toBe('Bearer access-1')
    expect(callsTo(TOKEN)[0]?.authorization).toBeUndefined()
  })
})

describe('apiClient · refresh unico', () => {
  it('renova uma vez e repete a requisicao com o token novo', async () => {
    on(GUESTS, unauthorized(), ok({ results: ['ana'] }))
    on(REFRESH, ok({ access: 'access-2' }))

    const response = await apiClient.get<{ results: string[] }>(GUESTS)

    expect(response.data.results).toEqual(['ana'])
    expect(callsTo(REFRESH)).toHaveLength(1)
    expect(callsTo(REFRESH)[0]?.body).toContain('refresh-1')
    expect(callsTo(GUESTS).map((request) => request.authorization)).toEqual([
      'Bearer access-1',
      'Bearer access-2',
    ])
    expect(session.getAccessToken()).toBe('access-2')
  })

  it('atende tres 401 concorrentes com uma unica renovacao', async () => {
    on(GUESTS, unauthorized(), ok({ results: [] }))
    on('/guests/in-hotel/', unauthorized(), ok({ results: [] }))
    on('/guests/pending-checkin/', unauthorized(), ok({ results: [] }))
    on(REFRESH, ok({ access: 'access-2' }))

    await Promise.all([
      apiClient.get(GUESTS),
      apiClient.get('/guests/in-hotel/'),
      apiClient.get('/guests/pending-checkin/'),
    ])

    expect(callsTo(REFRESH)).toHaveLength(1)
    expect(callsTo(GUESTS)).toHaveLength(2)
    expect(callsTo('/guests/in-hotel/')).toHaveLength(2)
    expect(callsTo('/guests/pending-checkin/')).toHaveLength(2)
  })

  it('repete a requisicao uma vez so, mesmo com o token novo tambem recusado', async () => {
    on(GUESTS, unauthorized())
    on(REFRESH, ok({ access: 'access-2' }))

    await expect(apiClient.get(GUESTS)).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' })

    expect(callsTo(GUESTS)).toHaveLength(2)
    expect(callsTo(REFRESH)).toHaveLength(1)
    expect(session.getAccessToken()).toBeNull()
  })
})

describe('apiClient · sessao expirada', () => {
  it('limpa a sessao, avisa uma vez e registra o erro do refresh', async () => {
    on(GUESTS, unauthorized())
    on('/guests/in-hotel/', unauthorized())
    on(REFRESH, failure(401, { code: 'NOT_AUTHENTICATED', detail: 'Refresh expirado.' }))

    await Promise.all([
      expect(apiClient.get(GUESTS)).rejects.toBeInstanceOf(Error),
      expect(apiClient.get('/guests/in-hotel/')).rejects.toBeInstanceOf(Error),
    ])

    expect(session.getAccessToken()).toBeNull()
    expect(session.getRefreshToken()).toBeNull()
    const toasts = toastStore.getSnapshot()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      tone: 'info',
      message: 'Sua sessão expirou. Entre novamente.',
    })
    expect(capture.mock.calls.map(([error]) => (error as AxiosError).response?.status)).toContain(
      401,
    )
    expect(capture.mock.calls.map(([, context]) => context)).toContainEqual(
      expect.objectContaining({ scope: 'auth-refresh' }),
    )
  })

  it('nao derruba a sessao existente quando o 401 vem do proprio login', async () => {
    on(TOKEN, failure(401, { code: 'NOT_AUTHENTICATED', detail: 'Credenciais inválidas.' }))

    await expect(
      apiClient.post(TOKEN, { username: 'recepcao', password: 'errada' }),
    ).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED', status: 401 })

    expect(session.getAccessToken()).toBe('access-1')
    expect(callsTo(REFRESH)).toHaveLength(0)
    expect(toastStore.getSnapshot()).toEqual([])
  })
})

describe('apiClient · normalizacao do erro', () => {
  it('traduz servidor inalcancavel em NETWORK_ERROR com status 0', async () => {
    on(GUESTS, offline())

    await expect(apiClient.get(GUESTS)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
      message: 'Não foi possível falar com o servidor.',
    })
  })

  it('traduz 500 sem envelope em UNKNOWN_ERROR preservando o status', async () => {
    on(GUESTS, failure(500, '<html>Server Error</html>'))

    await expect(apiClient.get(GUESTS)).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
      status: 500,
      message: 'Erro inesperado do servidor (HTTP 500).',
    })
  })

  it('guarda o codigo desconhecido do envelope em extra.raw_code', async () => {
    on(GUESTS, failure(400, { code: 'QUOTA_EXCEEDED', detail: 'Cota do plano esgotada.' }))

    await expect(apiClient.get(GUESTS)).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
      status: 400,
      message: 'Cota do plano esgotada.',
      extra: { raw_code: 'QUOTA_EXCEEDED' },
    })
  })
})

describe('parseResponse', () => {
  const schema = z.object({ id: z.number(), total: z.string() })

  function thrownBy(run: () => unknown): unknown {
    try {
      run()
    } catch (cause) {
      return cause
    }
    throw new Error('a chamada devolveu em vez de lancar')
  }

  it('devolve o corpo tipado quando ele respeita o schema', () => {
    expect(parseResponse(schema, { status: 200, data: { id: 7, total: '425.00' } })).toEqual({
      id: 7,
      total: '425.00',
    })
  })

  it('vira CONTRACT_ERROR com o status da resposta e uma frase sem detalhe tecnico', () => {
    const error = thrownBy(() => parseResponse(schema, { status: 200, data: { id: '7' } }))

    expect(error).toMatchObject({
      code: 'CONTRACT_ERROR',
      status: 200,
      message: 'Resposta inesperada do servidor.',
    })
  })

  it('manda os problemas do zod ao logger, e nao a tela', () => {
    thrownBy(() => parseResponse(schema, { status: 500, data: null }))

    const [logged, context] = capture.mock.calls[0] ?? []
    expect(context).toEqual(expect.objectContaining({ scope: 'api-contract' }))
    expect(logged).toBeInstanceOf(z.ZodError)
    expect((logged as z.ZodError).issues).toEqual([
      expect.objectContaining({ code: 'invalid_type', path: [] }),
    ])
  })
})

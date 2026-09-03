import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorLogger, type ErrorSink } from './errorLogger'
import { ApiError } from './errors'

const restores: (() => void)[] = []

function useSink(): ReturnType<typeof vi.fn> {
  const capture = vi.fn()
  restores.push(errorLogger.use({ capture } satisfies ErrorSink))
  return capture
}

afterEach(() => {
  let restore = restores.pop()
  while (restore) {
    restore()
    restore = restores.pop()
  }
})

describe('errorLogger · forma do contexto', () => {
  it('monta escopo, rota e instante mesmo para um erro sem codigo', () => {
    const capture = useSink()

    errorLogger.capture(new Error('quebrou'), { scope: 'guest-table' })

    expect(capture).toHaveBeenCalledTimes(1)
    const [, context] = capture.mock.calls[0] as [unknown, Record<string, unknown>]
    const { at, ...rest } = context
    expect(rest).toEqual({ scope: 'guest-table', path: window.location.pathname })
    expect(typeof at).toBe('string')
    expect(Number.isNaN(new Date(at as string).getTime())).toBe(false)
  })

  it('inclui o componentStack so quando o chamador manda um', () => {
    const capture = useSink()

    errorLogger.capture(new Error('quebrou'), { scope: 'boundary', componentStack: '\n at Foo' })

    const [, withStack] = capture.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(withStack.componentStack).toBe('\n at Foo')

    capture.mockClear()
    errorLogger.capture(new Error('quebrou'), { scope: 'boundary' })

    const [, withoutStack] = capture.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(withoutStack).not.toHaveProperty('componentStack')
  })
})

describe('errorLogger · codigo e status', () => {
  it('le codigo e status de um ApiError e os poe no contexto', () => {
    const capture = useSink()
    const error = new ApiError({
      code: 'VALIDATION_ERROR',
      detail: 'Campo invalido.',
      status: 400,
      extra: { document: ['Documento invalido.'] },
    })

    errorLogger.capture(error, { scope: 'guest-form' })

    const [, context] = capture.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(context.code).toBe('VALIDATION_ERROR')
    expect(context.status).toBe(400)
  })

  it('nao inventa codigo nem status para um erro que nao e da API', () => {
    const capture = useSink()

    errorLogger.capture(new Error('erro de render'), { scope: 'boundary' })

    const [, context] = capture.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(context).not.toHaveProperty('code')
    expect(context).not.toHaveProperty('status')
  })
})

describe('errorLogger · nada de PII no log', () => {
  it('nunca manda o extra do ApiError nem qualquer payload de requisicao ao sink', () => {
    const capture = useSink()
    const error = new ApiError({
      code: 'DUPLICATE_DOCUMENT',
      detail: 'Documento ja cadastrado.',
      status: 409,
      extra: { document: '12345678901', phone: '21988887777' },
    })

    errorLogger.capture(error, { scope: 'guest-form' })

    const [reportedError, context] = capture.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(context).not.toHaveProperty('extra')
    expect(JSON.stringify(context)).not.toContain('12345678901')
    expect(JSON.stringify(context)).not.toContain('21988887777')
    // O objeto de erro em si segue disponivel para quem quiser inspecionar em
    // dev, mas o contexto — o que realmente vai para o sink estruturado — não
    // carrega o `extra`.
    expect(reportedError).toBe(error)
  })
})

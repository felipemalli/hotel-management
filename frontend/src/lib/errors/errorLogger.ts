import { isApiError } from './errors'

export interface ErrorContext {
  scope: string
  code?: string
  status?: number
  componentStack?: string
  path: string
  at: string
}

export interface ErrorSink {
  capture: (error: unknown, context: ErrorContext) => void
}

export interface CaptureOptions {
  scope: string
  componentStack?: string | null
}

// O contexto é montado aqui, e não pelo chamador: assim o log carrega código,
// status e rota, e nunca `extra` nem corpo de requisição — onde a PII mora.
function buildContext(error: unknown, options: CaptureOptions): ErrorContext {
  const context: ErrorContext = {
    scope: options.scope,
    path: window.location.pathname,
    at: new Date().toISOString(),
  }

  if (isApiError(error)) {
    context.code = error.code
    context.status = error.status
  }

  if (options.componentStack) context.componentStack = options.componentStack

  return context
}

function summarize(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  return 'valor lançado sem mensagem'
}

const consoleSink: ErrorSink = {
  capture: (error, context) => {
    console.group(`[${context.scope}] ${summarize(error)}`)
    console.error(error)
    console.info(context)
    console.groupEnd()
  },
}

const silentSink: ErrorSink = { capture: () => undefined }

const defaultSink: ErrorSink = import.meta.env.DEV ? consoleSink : silentSink

let sink: ErrorSink = defaultSink

export const errorLogger = {
  capture: (error: unknown, options: CaptureOptions): void => {
    sink.capture(error, buildContext(error, options))
  },

  // Ponto de extensão: um serviço de monitoramento entra por aqui sem que o
  // resto do código conheça o destino. Devolve a função que restaura o anterior.
  use: (next: ErrorSink): (() => void) => {
    const previous = sink
    sink = next
    return () => {
      sink = previous
    }
  },
}

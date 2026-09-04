import type { FallbackProps } from 'react-error-boundary'

import { AlertIcon, RefreshIcon } from '@/components/icons'
import { Button } from '@/components/ui'
import { isApiErrorCode } from '@/lib/errors/errors'

function describe(error: unknown): string {
  if (isApiErrorCode(error, 'NETWORK_ERROR')) {
    return 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.'
  }
  return 'A tela não pôde ser exibida. Tente novamente ou recarregue a página.'
}

function stackOf(error: unknown): string | null {
  if (error instanceof Error) return error.stack ?? error.message
  return null
}

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const stack = stackOf(error)

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-lg bg-white px-4 py-10 text-center text-sm text-red-900 ring-1 ring-red-200"
    >
      <AlertIcon className="text-2xl text-red-600" />
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">Algo deu errado</p>
        <p className="text-slate-600">{describe(error)}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={resetErrorBoundary}>
          <RefreshIcon />
          Tentar novamente
        </Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Recarregar a página
        </Button>
      </div>
      {import.meta.env.DEV && stack ? (
        <details className="w-full text-left">
          <summary className="cursor-pointer text-xs text-slate-500">Detalhes técnicos</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
            {stack}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

import { Button } from './Button'

/**
 * Estados de UI obrigatorios da SPEC 5.3/F1: loading (skeleton), vazio e erro
 * com retry. Componentes separados para que cada tabela declare so o que usa.
 */

export function TableSkeleton({ rows = 4, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="overflow-hidden rounded-lg ring-1 ring-slate-200"
    >
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-4 border-b border-slate-100 bg-white px-4 py-3 last:border-b-0"
        >
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <div key={columnIndex} className="h-4 grow animate-pulse rounded bg-slate-200" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-white px-4 py-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">
      {message}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg bg-white px-4 py-10 text-center text-sm text-red-800 ring-1 ring-red-200"
    >
      <span>{message}</span>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  )
}

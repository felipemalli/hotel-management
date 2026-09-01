import type { ReactNode } from 'react'

/**
 * Faixa de mensagem **ancorada no contexto** — dentro do formulario, ao lado do
 * que ela explica. Falha de mutation sem campo culpado nao vem por aqui: vai
 * para o toast global (`Toaster`, SPEC 8.2/E).
 */

export type AlertTone = 'error' | 'warning' | 'success' | 'info'

const TONES: Record<AlertTone, string> = {
  error: 'bg-red-50 text-red-800 ring-red-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  info: 'bg-slate-50 text-slate-700 ring-slate-200',
}

export interface AlertProps {
  tone?: AlertTone
  children: ReactNode
  onDismiss?: () => void
}

export function Alert({ tone = 'error', children, onDismiss }: AlertProps) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-md px-3 py-2 text-sm ring-1 ring-inset ${TONES[tone]}`}
    >
      <span className="grow">{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar aviso"
          className="shrink-0 font-bold opacity-60 hover:opacity-100"
        >
          &times;
        </button>
      ) : null}
    </div>
  )
}

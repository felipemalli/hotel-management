import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * Modal minimo (SPEC 5.1) usado pelos fluxos F2 (alerta de check-in) e F3
 * (extrato de checkout).
 *
 * Acessibilidade deliberada, nao decorativa: `role="dialog"` + `aria-modal`,
 * titulo ligado por `aria-labelledby`, Escape fecha, foco entra no painel ao
 * abrir e volta ao elemento anterior ao fechar. Sem portal: a arvore da app e
 * unica e o overlay e `fixed`, o que mantem o componente trivial de testar.
 */

export interface DialogProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  /** Alerta de check-in usa `alertdialog`: exige decisao antes de seguir. */
  role?: 'dialog' | 'alertdialog'
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  role = 'dialog',
  size = 'md',
}: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement
    panelRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const previous = previouslyFocused.current
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={[
          'relative w-full rounded-lg bg-white p-6 shadow-xl',
          'focus:outline-none',
          SIZES[size],
        ].join(' ')}
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-1 text-sm text-slate-600">
            {description}
          </p>
        ) : null}
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}

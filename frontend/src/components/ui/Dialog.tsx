import { type ReactNode, useEffect, useId, useRef } from 'react'

/**
 * Modal minimo (SPEC 5.1) usado pelos fluxos F2 (alerta de check-in) e F3
 * (extrato de checkout).
 *
 * Acessibilidade deliberada, nao decorativa: `role="dialog"` + `aria-modal`,
 * titulo ligado por `aria-labelledby`, Escape fecha, foco entra no painel ao
 * abrir e volta ao elemento anterior ao fechar. Sem portal: a arvore da app e
 * unica e o overlay e `fixed`, o que mantem o componente trivial de testar.
 *
 * O foco fica **preso** no painel enquanto o modal esta aberto. Sem isso,
 * `aria-modal="true"` mente: o leitor de tela anuncia um dialogo modal e a
 * tecla Tab sai dele para a tabela atras do overlay, onde o clique nem chega.
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

/** Ordem de foco do painel, ignorando o que esta desabilitado ou fora de fluxo. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
}

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

  // Foco: UMA vez por abertura. Nao pode depender de `onClose`, que na pratica
  // e uma arrow inline e troca de identidade a cada render do pai — o efeito
  // reexecutava e jogava o cursor de volta ao painel no meio da digitacao, e
  // `previouslyFocused` era sobrescrito com o proprio campo, de modo que ao
  // fechar o foco voltava para um no ja removido em vez do botao de origem.
  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement
    panelRef.current?.focus()

    return () => {
      const previous = previouslyFocused.current
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])

  // Teclado: este SIM depende de `onClose`, e reassinar o listener e barato.
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      const stops = focusableIn(panel)
      // Painel sem nada focavel: o proprio painel e o unico ponto de parada.
      if (stops.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = stops.at(0)
      const last = stops.at(-1)
      if (!first || !last) return

      const active = document.activeElement

      if (!event.shiftKey && (active === last || active === panel)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      {/*
        Clique no overlay fecha um `dialog`, mas nao um `alertdialog`: este
        ultimo existe para exigir uma decisao (F2), e clique fora e gesto
        ambiguo demais para valer como "cancelar". Escape e o botao Cancelar
        seguem disponiveis.
      */}
      <div
        className="absolute inset-0 bg-slate-900/50"
        aria-hidden="true"
        onClick={role === 'dialog' ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={[
          'relative my-auto w-full rounded-lg bg-white p-6 shadow-xl',
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

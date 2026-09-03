import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface DialogProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  role?: 'dialog' | 'alertdialog'
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const

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

  // O efeito de foco depende só de `open`. Depender de `onClose` — na prática
  // uma arrow inline, de identidade nova a cada render do pai — reexecutava o
  // efeito e roubava o cursor do campo em digitação.
  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    previouslyFocused.current = document.activeElement
    panel?.focus()

    return () => {
      const previous = previouslyFocused.current
      if (!(previous instanceof HTMLElement)) return

      // Quem fecha o dialog pode ter movido o foco de propósito — é o caso da
      // confirmação destrutiva, cuja origem desaparece da listagem junto com a
      // linha. O painel não desfaz essa escolha: só devolve o foco quando ele
      // ainda está no painel ou já caiu no `<body>` com o painel desmontado.
      const active = document.activeElement
      const movedElsewhere =
        active !== null && active !== document.body && !(panel?.contains(active) ?? false)
      if (movedElsewhere) return

      previous.focus()
    }
  }, [open])

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
      // Painel sem nada focável: o próprio painel é o único ponto de parada.
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

  // O portal existe porque a ação que abre o dialog mora numa célula da tabela,
  // dentro de um `overflow-x-auto`: renderizado ali, o painel era recortado. O
  // trap de foco não depende da posição na árvore, só do painel e do documento.
  return createPortal(
    <div className="fixed inset-0 z-dialog flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      {/*
        Clique no overlay fecha um `dialog`, mas não um `alertdialog`: este
        último existe para exigir uma decisão, e clique fora é gesto ambíguo
        demais para valer como "cancelar". Escape e o botão seguem disponíveis.
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
    </div>,
    document.body,
  )
}

import { useRef, type KeyboardEvent, type ReactNode } from 'react'

import { tabId, tabPanelId } from './tabIds'

/**
 * Abas acessiveis (SPEC 5.3/F1: Todos | No hotel | Check-in pendente).
 *
 * `role="tablist"` + `aria-selected`: a aba ativa e programaticamente
 * detectavel, nao apenas colorida. Navegacao pelo padrao ARIA de tabs, que e o
 * que o atendente de balcao encontra ao usar o teclado:
 *
 * - **roving tabindex** — um unico Tab entra e sai do grupo de abas, em vez de
 *   parar em cada uma delas antes de chegar na tabela;
 * - setas esquerda/direita trocam de aba, `Home`/`End` vao para as pontas.
 *
 * Os ids sao deterministicos (`tabId`/`tabPanelId`) para que o painel possa
 * declarar `aria-labelledby` sem que a tabela precise conhecer este componente.
 */

export interface TabItem<T extends string> {
  id: T
  label: string
  badge?: ReactNode
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[]
  value: T
  onChange: (id: T) => void
  label: string
}

export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  const buttons = useRef(new Map<T, HTMLButtonElement>())

  function move(to: T) {
    onChange(to)
    buttons.current.get(to)?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = items.findIndex((item) => item.id === value)
    if (current === -1) return

    const last = items.length - 1
    const next =
      event.key === 'ArrowRight'
        ? (current + 1) % items.length
        : event.key === 'ArrowLeft'
          ? (current - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1

    if (next === -1) return
    event.preventDefault()
    move(items[next].id)
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-1">
      {items.map((item) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) buttons.current.set(item.id, node)
              else buttons.current.delete(item.id)
            }}
            id={tabId(item.id)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={tabPanelId(item.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
              selected
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900',
            ].join(' ')}
          >
            {item.label}
            {item.badge !== undefined ? (
              // Contagem: contraste proprio em vez de opacidade sobre o fundo
              // da aba, que derrubava a leitura na aba nao selecionada.
              <span
                className={`ml-1.5 text-xs font-normal ${selected ? 'text-slate-300' : 'text-slate-500'}`}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

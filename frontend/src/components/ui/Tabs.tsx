import type { ReactNode } from 'react'

/**
 * Abas acessiveis (SPEC 5.3/F1: Todos | No hotel | Check-in pendente).
 * `role="tablist"` + `aria-selected` — a aba ativa e programaticamente
 * detectavel, nao apenas colorida.
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
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {items.map((item) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
              selected
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            ].join(' ')}
          >
            {item.label}
            {item.badge !== undefined ? (
              <span className="ml-1.5 text-xs opacity-70">{item.badge}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

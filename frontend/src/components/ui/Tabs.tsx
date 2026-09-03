import { type KeyboardEvent, useRef } from 'react'

import { tabId, tabPanelId } from './tabIds'

export interface TabItem<T extends string> {
  id: T
  label: string
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

    const target = items[next]
    if (!target) return

    event.preventDefault()
    move(target.id)
  }

  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- foco mora nos filhos
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
              'rounded-md px-3 py-1.5 text-sm font-medium transition motion-reduce:transition-none',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
              selected
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900',
            ].join(' ')}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

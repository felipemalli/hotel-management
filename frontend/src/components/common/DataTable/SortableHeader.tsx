import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type SortDirection = 'ascending' | 'descending' | 'none'

const ICONS = {
  ascending: ArrowUpIcon,
  descending: ArrowDownIcon,
  none: ArrowUpDownIcon,
}

// Anunciado no nome do botão: `aria-sort` no <th> diz o estado, não o próximo gesto.
const HINTS: Record<SortDirection, string> = {
  none: 'ordenar crescente',
  ascending: 'ordenado crescente, ordenar decrescente',
  descending: 'ordenado decrescente, remover ordenação',
}

export interface SortableHeaderProps {
  label: string
  sort: SortDirection
  onToggle: () => void
}

export function SortableHeader({ label, sort, onToggle }: SortableHeaderProps) {
  const Icon = ICONS[sort]

  return (
    <button
      type="button"
      onClick={onToggle}
      className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-medium transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {label}
      <Icon
        aria-hidden="true"
        className={cn('size-3.5', sort === 'none' ? 'opacity-40' : 'text-foreground')}
      />
      <span className="sr-only">, {HINTS[sort]}</span>
    </button>
  )
}

import type { ReactNode } from 'react'

import { Typography } from '@/components/ui'

export interface DescriptionListItem {
  label: string
  value: ReactNode
}

export interface DescriptionListProps {
  items: readonly DescriptionListItem[]
}

// `<dl>` e não uma tabela de duas colunas: são pares de rótulo e valor de um
// mesmo registro, e o leitor de tela anuncia `term`/`definition` sem precisar
// de cabeçalho de coluna.
export function DescriptionList({ items }: DescriptionListProps) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <Typography as="dt" variant="overline">
            {item.label}
          </Typography>
          <Typography as="dd" variant="body" className="mt-0.5">
            {item.value}
          </Typography>
        </div>
      ))}
    </dl>
  )
}

import type { ReactNode } from 'react'

import { Typography } from '@/components/ui'

export interface DescriptionListItem {
  label: string
  value: ReactNode
}

export interface DescriptionListProps {
  items: readonly DescriptionListItem[]
}

export function DescriptionList({ items }: DescriptionListProps) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-8 gap-y-4">
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

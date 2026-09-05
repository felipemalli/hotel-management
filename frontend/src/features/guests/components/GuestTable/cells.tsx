import type { ReactNode } from 'react'

import { Badge, Typography } from '@/components/ui'

function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
}

// Nome no próprio texto: o selo de acompanhante não entra na busca.
export function NameCell({ fullName, isCompanion }: { fullName: string; isCompanion: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-2.5">
      <span className="flex size-7 flex-none items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground">
        {initialsOf(fullName)}
      </span>
      <Typography as="span" variant="body" weight="medium">
        {fullName}
      </Typography>
      {isCompanion ? <Badge variant="info">Acompanhante</Badge> : null}
    </span>
  )
}

export function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <Typography as="span" variant="mono" title={title}>
      {children}
    </Typography>
  )
}

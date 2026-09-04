import type { ReactNode } from 'react'

import { Typography } from '@/components/ui'

export interface PageHeaderProps {
  title: string
  titleId?: string
  description?: string
  badge?: ReactNode
  actions?: ReactNode
  // Consulta em segundo plano não troca o conteúdo por esqueleto.
  updating?: boolean
  children?: ReactNode
}

export function PageHeader({
  title,
  titleId,
  description,
  badge,
  actions,
  updating = false,
  children,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Typography as="h2" id={titleId} variant="pageTitle">
            {title}
          </Typography>
          {badge}
          {updating ? (
            <Typography as="span" variant="caption">
              Atualizando…
            </Typography>
          ) : null}
        </div>
        {actions}
      </div>
      {description ? (
        <Typography as="p" variant="body" tone="muted">
          {description}
        </Typography>
      ) : null}
      {children}
    </header>
  )
}

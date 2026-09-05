import type { ReactNode } from 'react'

import { Typography } from '@/components/ui'

export interface PageHeaderProps {
  title: string
  titleId?: string
  // Trilha acima do título, ex. "Hotel Vila Marés"; opcional — nem toda página tem.
  breadcrumb?: ReactNode
  description?: string
  badge?: ReactNode
  actions?: ReactNode
  // Consulta em segundo plano não troca o conteúdo por esqueleto.
  updating?: boolean
}

// Só título/trilha/descrição/ação: filtros e abas ficam no corpo da página,
// logo abaixo — o cabeçalho não é onde a listagem vive.
export function PageHeader({
  title,
  titleId,
  breadcrumb,
  description,
  badge,
  actions,
  updating = false,
}: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-border bg-card/90 px-6 py-5 backdrop-blur sm:-mx-8 sm:-mt-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {breadcrumb ? (
            <Typography as="p" variant="caption" className="mb-1.5">
              {breadcrumb}
            </Typography>
          ) : null}
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
          {description ? (
            <Typography as="p" variant="body" tone="muted" className="mt-1 max-w-[62ch]">
              {description}
            </Typography>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  )
}

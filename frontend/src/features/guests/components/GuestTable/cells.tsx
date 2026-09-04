import type { ReactNode } from 'react'

import { Badge, Typography } from '@/components/ui'

// O nome fica no próprio texto: a etiqueta de acompanhante ao lado não pode
// entrar na busca por texto exato que os testes e o atendente fazem pelo nome.
export function NameCell({ fullName, isCompanion }: { fullName: string; isCompanion: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
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

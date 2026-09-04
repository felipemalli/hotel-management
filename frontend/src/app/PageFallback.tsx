import { LoaderCircle } from 'lucide-react'

import { Typography } from '@/components/ui'

export function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <Typography
        as="p"
        variant="body"
        tone="muted"
        role="status"
        className="flex items-center gap-2"
      >
        <LoaderCircle className="size-4 animate-spin" />
        Carregando…
      </Typography>
    </div>
  )
}

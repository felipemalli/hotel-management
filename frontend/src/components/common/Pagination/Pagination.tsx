import { Button, Typography } from '@/components/ui'

export interface PaginationProps {
  page: number
  count: number
  hasNext: boolean
  hasPrevious: boolean
  onPageChange: (page: number) => void
}

// A navegação segue `next`/`previous` do DRF em vez de calcular o total de
// páginas: a última página é a que o servidor disser que é, e a contagem serve
// só para situar o atendente.
export function Pagination({ page, count, hasNext, hasPrevious, onPageChange }: PaginationProps) {
  if (count === 0) return null

  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3">
      <Typography as="p" variant="body" tone="muted">
        Página {page} · {count} {count === 1 ? 'registro' : 'registros'}
      </Typography>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrevious}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </nav>
  )
}

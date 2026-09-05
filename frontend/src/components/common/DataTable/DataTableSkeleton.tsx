import { Skeleton } from '@/components/ui'

export interface DataTableSkeletonProps {
  columns: number
  rows?: number
}

export function DataTableSkeleton({ columns, rows = 4 }: DataTableSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-border px-4 py-3 last:border-b-0">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton key={columnIndex} className="h-4 grow" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 4, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="overflow-hidden rounded-lg ring-1 ring-border"
    >
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-4 border-b border-border bg-card px-4 py-3 last:border-b-0"
        >
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <div
              key={columnIndex}
              className="h-4 grow rounded bg-muted motion-safe:animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  )
}

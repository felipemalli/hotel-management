import { Skeleton } from '@/components/ui'

export function ReservationDetailPageSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Carregando…</span>
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-5 w-20 rounded-4xl" />
      </div>
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="rounded-lg bg-card p-5 ring-1 ring-border">
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, item) => (
              <div key={item} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

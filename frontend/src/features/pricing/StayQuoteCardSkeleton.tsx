import { Skeleton } from '@/components/ui'

export function StayQuoteCardSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-3 p-4">
      <span className="sr-only">Calculando valor estimado…</span>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-4 w-40 self-end" />
      <Skeleton className="h-7 w-32 self-end" />
    </div>
  )
}

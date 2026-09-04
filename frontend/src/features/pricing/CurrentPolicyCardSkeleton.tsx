import { Skeleton } from '@/components/ui'

const ITEM_COUNT = 9

export function CurrentPolicyCardSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="rounded-lg bg-card p-5 ring-1 ring-border"
    >
      <span className="sr-only">Carregando…</span>
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {Array.from({ length: ITEM_COUNT }).map((_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}

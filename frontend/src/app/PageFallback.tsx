import { SpinnerIcon } from '@/components/icons'

export function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
        <SpinnerIcon className="size-4 animate-spin" />
        Carregando…
      </p>
    </div>
  )
}

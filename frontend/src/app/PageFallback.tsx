import { LoaderCircle } from 'lucide-react'

export function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
        <LoaderCircle className="size-4 animate-spin" />
        Carregando…
      </p>
    </div>
  )
}

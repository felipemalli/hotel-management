import { useEffect, useSyncExternalStore } from 'react'

import { type Toast, toastStore, type ToastTone } from '@/lib/toast'

const AUTO_DISMISS_MS = 8_000

const TONES: Record<ToastTone, string> = {
  error: 'bg-red-50 text-red-900 ring-red-300',
  success: 'bg-emerald-50 text-emerald-900 ring-emerald-300',
  info: 'bg-slate-50 text-slate-900 ring-slate-300',
}

function ToastCard({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => toastStore.dismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast.id])

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-md px-4 py-3 text-sm shadow-lg ring-1 ring-inset ${TONES[toast.tone]}`}
    >
      <span className="grow">{toast.message}</span>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => toastStore.dismiss(toast.id)}
        className="shrink-0 rounded px-1 font-bold text-current hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        &times;
      </button>
    </div>
  )
}

export function Toaster() {
  const toasts = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getSnapshot,
  )

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

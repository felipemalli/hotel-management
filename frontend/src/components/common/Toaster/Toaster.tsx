import { useEffect, useState, useSyncExternalStore } from 'react'

import { type Toast, toastStore, type ToastTone } from '@/lib/notify/toast'
import { cn } from '@/lib/utils'

import { DismissButton } from '../DismissButton'

const AUTO_DISMISS_MS: Record<ToastTone, number> = {
  error: 8_000,
  success: 5_000,
  info: 8_000,
}

const TONES: Record<ToastTone, string> = {
  error: 'bg-destructive/10 text-destructive ring-destructive/20',
  success: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20',
  info: 'bg-card text-foreground ring-border',
}

function ToastCard({ toast }: { toast: Toast }) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => toastStore.dismiss(toast.id), AUTO_DISMISS_MS[toast.tone])
    return () => clearTimeout(timer)
  }, [toast.id, toast.tone, paused])

  // Ponteiro em cima ou foco dentro: ninguém perde a mensagem no meio da
  // leitura nem o botão de fechar debaixo do cursor. O relógio recomeça na
  // saída, de propósito — quem voltou a ler ganha o tempo inteiro de novo.
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-md px-4 py-3 text-sm shadow-lg ring-1 ring-inset',
        TONES[toast.tone],
      )}
    >
      <span className="grow">{toast.message}</span>
      <DismissButton onClick={() => toastStore.dismiss(toast.id)} />
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
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

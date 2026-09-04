export type ToastTone = 'error' | 'success' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

type Listener = () => void

const listeners = new Set<Listener>()

// Referência estável: `useSyncExternalStore` compara snapshots por identidade,
// então a lista só é recriada quando muda de verdade.
let toasts: readonly Toast[] = []
let nextId = 1

function emit(): void {
  for (const listener of listeners) listener()
}

export const toastStore = {
  getSnapshot: (): readonly Toast[] => toasts,

  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  push: (tone: ToastTone, message: string): number => {
    const id = nextId++
    toasts = [...toasts, { id, tone, message }]
    emit()
    return id
  },

  dismiss: (id: number): void => {
    const remaining = toasts.filter((toast) => toast.id !== id)
    if (remaining.length === toasts.length) return
    toasts = remaining
    emit()
  },

  clear: (): void => {
    if (toasts.length === 0) return
    toasts = []
    emit()
  },
}

export function notifyError(message: string): void {
  toastStore.push('error', message)
}

export function notifySuccess(message: string): void {
  toastStore.push('success', message)
}

export function notifyInfo(message: string): void {
  toastStore.push('info', message)
}

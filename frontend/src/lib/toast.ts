/**
 * Fila de avisos globais (SPEC 8.2/E: "handler global de erros (toast)").
 *
 * Store observavel fora do React, pelo mesmo motivo de `lib/session`: quem
 * publica o aviso nao esta na arvore. O `MutationCache` do TanStack Query
 * (SPEC 5.2) vive no `QueryClient`, e e ele que captura o erro de **qualquer**
 * mutation — sem que cada componente precise repetir um `onError`.
 *
 * Politica de quem exibe o que, para o atendente nunca ler a mesma falha duas
 * vezes (a lista canonica esta em `LOCALLY_PRESENTED_CODES`):
 *
 * - `VALIDATION_ERROR` / `DUPLICATE_DOCUMENT` -> no input do campo culpado.
 * - `EARLY_CHECKIN` -> nao e falha, e ramo de protocolo (D4): abre o alerta F2.
 * - todo o resto (rede, 500, `INVALID_STATUS`, `NOT_FOUND`) -> este toast.
 */

export type ToastTone = 'error' | 'success' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

type Listener = () => void

const listeners = new Set<Listener>()

/** Referencia estavel: `useSyncExternalStore` compara por identidade. */
let toasts: readonly Toast[] = []
let nextId = 1

function emit(): void {
  for (const listener of listeners) listener()
}

export const toastStore = {
  getSnapshot(): readonly Toast[] {
    return toasts
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  push(tone: ToastTone, message: string): number {
    const id = nextId++
    toasts = [...toasts, { id, tone, message }]
    emit()
    return id
  },

  dismiss(id: number): void {
    const remaining = toasts.filter((toast) => toast.id !== id)
    if (remaining.length === toasts.length) return
    toasts = remaining
    emit()
  },

  /** Usado ao trocar de sessao e entre testes: nada de aviso orfao na tela. */
  clear(): void {
    if (toasts.length === 0) return
    toasts = []
    emit()
  },
}

export function notifyError(message: string): void {
  toastStore.push('error', message)
}

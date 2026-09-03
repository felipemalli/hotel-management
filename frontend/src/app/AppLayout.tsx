import type { ReactNode } from 'react'

import { Button } from '@/components/ui'
import { useAuth } from '@/features/auth/useAuth'
import { toastStore } from '@/lib/toast'

export function AppLayout({ children }: { children: ReactNode }) {
  const { username, signOut } = useAuth()

  function onSignOut() {
    signOut()
    toastStore.clear()
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <a
        href="#main"
        className="sr-only rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Ir para o conteúdo
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900">Gestão de Hóspedes</h1>
          <nav aria-label="Sessão" className="flex items-center gap-3">
            <p className="text-xs text-slate-500">
              Recepção ·{' '}
              <span className="font-medium text-slate-700">{username ?? 'atendente'}</span>
            </p>
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              Sair
            </Button>
          </nav>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 focus:outline-none"
      >
        {children}
      </main>
    </div>
  )
}

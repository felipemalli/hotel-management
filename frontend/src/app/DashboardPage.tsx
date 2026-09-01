import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'

/**
 * Dashboard unico (SPEC 5.1). As listagens da SPEC 4.3 entram aqui como abas,
 * nao como paginas.
 */
export function DashboardPage() {
  const { signOut } = useAuth()
  const queryClient = useQueryClient()

  /** Sair descarta o cache: dado de hospede nao sobrevive a troca de sessao. */
  function onSignOut() {
    signOut()
    queryClient.clear()
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Gestão de Hóspedes</h1>
            <p className="text-xs text-slate-500">Recepção · atendente</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8" />
    </div>
  )
}

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useAuth } from '@/features/auth/useAuth'
import { GuestForm } from '@/features/guests/GuestForm'
import { GuestTable } from '@/features/guests/GuestTable'

/**
 * Dashboard unico (SPEC 5.1). As listagens da SPEC 4.3 sao abas da tabela, nao
 * paginas: o briefing pede localizar hospedes em tres recortes, e a troca de
 * aba e mais barata que a troca de rota para quem atende no balcao.
 */
export function DashboardPage() {
  const { signOut } = useAuth()
  const queryClient = useQueryClient()
  const [guestDialogOpen, setGuestDialogOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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
          <div className="flex items-center gap-2">
            <Button onClick={() => setGuestDialogOpen(true)}>Novo hóspede</Button>
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
        {notice ? (
          <Alert tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}

        <GuestTable />
      </main>

      <Dialog
        open={guestDialogOpen}
        title="Novo hóspede"
        description="Nome, documento e telefone são obrigatórios."
        onClose={() => setGuestDialogOpen(false)}
      >
        <GuestForm
          onCancel={() => setGuestDialogOpen(false)}
          onSuccess={(guest) => {
            setGuestDialogOpen(false)
            setNotice(`Hóspede ${guest.full_name} cadastrado.`)
          }}
        />
      </Dialog>
    </div>
  )
}

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useAuth } from '@/features/auth/useAuth'
import { GuestForm } from '@/features/guests/GuestForm'
import { GuestTable, type GuestRow } from '@/features/guests/GuestTable'
import { CheckoutStatementDialog } from '@/features/reservations/CheckoutStatementDialog'
import { ReservationActions } from '@/features/reservations/ReservationActions'
import { ReservationForm } from '@/features/reservations/ReservationForm'
import type { CheckoutStatement } from '@/features/reservations/types'
import { toastStore } from '@/lib/toast'

/**
 * Dashboard unico (SPEC 5.1). As listagens da SPEC 4.3 sao abas da tabela, nao
 * paginas: o briefing pede localizar hospedes em tres recortes, e a troca de
 * aba e mais barata que a troca de rota para quem atende no balcao.
 *
 * As acoes de cada linha derivam da aba, porque e a aba que define o estado
 * conhecido do hospede no contrato: "Todos" nao traz reserva (so cabe abrir
 * uma nova), "No hotel" traz a reserva `CHECKED_IN` (cabe checkout) e
 * "Check-in pendente" traz as `PENDING` (cabe check-in ou cancelamento).
 */
export function DashboardPage() {
  const { signOut } = useAuth()
  const queryClient = useQueryClient()
  const [guestDialogOpen, setGuestDialogOpen] = useState(false)
  const [reservationFor, setReservationFor] = useState<{
    id: number
    full_name: string
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // O extrato mora AQUI, nao na linha da tabela: o checkout tira o hospede da
  // aba "No hotel" e a linha desmonta. Estado nesta pagina sobrevive ao
  // refetch, e o atendente consegue ler o total (RN6).
  const [statement, setStatement] = useState<CheckoutStatement | null>(null)

  /** Sair descarta o cache: dado de hospede nao sobrevive a troca de sessao. */
  function onSignOut() {
    signOut()
    queryClient.clear()
    toastStore.clear()
  }

  function renderActions(row: GuestRow) {
    if (row.tab === 'todos') {
      return (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setReservationFor({ id: row.guest.id, full_name: row.guest.full_name })}
        >
          Nova reserva
        </Button>
      )
    }

    return (
      <ReservationActions
        reservationId={row.reservation.id}
        guestName={row.guest.full_name}
        state={row.tab === 'in-hotel' ? 'CHECKED_IN' : 'PENDING'}
        onCheckedOut={setStatement}
      />
    )
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

        <GuestTable renderActions={renderActions} />
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
            setReservationFor({ id: guest.id, full_name: guest.full_name })
          }}
        />
      </Dialog>

      {reservationFor ? (
        <Dialog
          open
          title="Nova reserva"
          description="Mínimo de 1 noite; a entrada não pode ser no passado."
          onClose={() => setReservationFor(null)}
        >
          <ReservationForm
            guest={reservationFor}
            onCancel={() => setReservationFor(null)}
            onSuccess={(reservation) => {
              setReservationFor(null)
              setNotice(`Reserva #${reservation.id} criada para ${reservationFor.full_name}.`)
            }}
          />
        </Dialog>
      ) : null}

      {statement ? (
        <CheckoutStatementDialog open statement={statement} onClose={() => setStatement(null)} />
      ) : null}
    </div>
  )
}

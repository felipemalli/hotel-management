import { useState } from 'react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Alert, Button, Dialog, ErrorState } from '@/components/ui'
import { GuestForm } from '@/features/guests/GuestForm'
import { type GuestRow, GuestTable } from '@/features/guests/GuestTable'
import type { GuestRef } from '@/features/guests/types'
import { CheckoutStatementDialog } from '@/features/reservations/CheckoutStatementDialog'
import { ReservationActions } from '@/features/reservations/ReservationActions'
import { ReservationForm } from '@/features/reservations/ReservationForm'
import type { CheckoutStatement } from '@/features/reservations/types'
import { errorMessage } from '@/lib/errors'

import { AppLayout } from './AppLayout'

export function DashboardPage() {
  const [guestDialogOpen, setGuestDialogOpen] = useState(false)
  const [reservationFor, setReservationFor] = useState<GuestRef | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // O extrato mora nesta página, e não na linha da tabela: o checkout tira o
  // hóspede da aba "No hotel", a linha desmonta e levaria o dialog com ela.
  const [statement, setStatement] = useState<CheckoutStatement | null>(null)

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
    <AppLayout>
      <div className="flex justify-end">
        <Button onClick={() => setGuestDialogOpen(true)}>Novo hóspede</Button>
      </div>

      {notice ? (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}

      {/* Uma quebra na tabela não derruba o header, o "Novo hóspede" nem os
          dialogs: o fallback é o mesmo `ErrorState` do erro de leitura. */}
      <ErrorBoundary
        scope="guest-table"
        fallback={({ error, resetErrorBoundary }) => (
          <ErrorState message={errorMessage(error)} onRetry={resetErrorBoundary} />
        )}
      >
        <GuestTable renderActions={renderActions} />
      </ErrorBoundary>

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
    </AppLayout>
  )
}

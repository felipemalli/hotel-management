import { ErrorState } from '@/components/common'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import { GuestForm } from '@/features/guests/GuestForm'
import { GuestTable } from '@/features/guests/GuestTable'
import type { GuestRow } from '@/features/guests/tabs'
import { CheckoutStatementDialog } from '@/features/reservations/CheckoutStatementDialog'
import { CancelReservationDialog } from '@/features/reservations/components/CancelReservationDialog'
import { ReservationActions } from '@/features/reservations/ReservationActions'
import { ReservationForm } from '@/features/reservations/ReservationForm'
import { errorMessage } from '@/lib/errors/errors'
import { notifySuccess } from '@/lib/notify/toast'

import { useDashboardDialog } from './useDashboardDialog'

// Os dialogs disparados por uma linha vivem aqui, e não na linha: checkout e
// cancelamento tiram o hóspede da aba, a linha desmonta e levaria o painel com
// ela no meio da mutation.
export function DashboardPage() {
  const { current, open, close } = useDashboardDialog()

  function renderActions(row: GuestRow) {
    if (row.tab === 'all') {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => open({ kind: 'reservation', guest: row.guest })}
        >
          Nova reserva
        </Button>
      )
    }

    return (
      <ReservationActions
        reservationId={row.reservation.id}
        guestName={row.guest.full_name}
        state={row.reservationStatus}
        onCheckedOut={(statement) => open({ kind: 'statement', statement })}
        onRequestCancel={() =>
          open({
            kind: 'cancel',
            reservationId: row.reservation.id,
            guestName: row.guest.full_name,
          })
        }
      />
    )
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => open({ kind: 'guest' })}>Novo hóspede</Button>
      </div>

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
        open={current?.kind === 'guest'}
        onOpenChange={(next) => (next ? undefined : close())}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo hóspede</DialogTitle>
            <DialogDescription>
              Nome, documento, telefone e nacionalidade são obrigatórios.
            </DialogDescription>
          </DialogHeader>
          <GuestForm
            onCancel={close}
            onSuccess={(guest) => {
              notifySuccess(`Hóspede ${guest.full_name} cadastrado.`)
              open({ kind: 'reservation', guest })
            }}
          />
        </DialogContent>
      </Dialog>

      {current?.kind === 'reservation' ? (
        <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova reserva</DialogTitle>
              <DialogDescription>
                Mínimo de 1 noite; a entrada não pode ser no passado.
              </DialogDescription>
            </DialogHeader>
            <ReservationForm
              guest={current.guest}
              onCancel={close}
              onSuccess={(reservation) => {
                close()
                notifySuccess(`Reserva #${reservation.id} criada para ${current.guest.full_name}.`)
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {current?.kind === 'cancel' ? (
        <CancelReservationDialog
          reservationId={current.reservationId}
          guestName={current.guestName}
          onClose={close}
          onCancelled={() => {
            close()
            notifySuccess(`Reserva de ${current.guestName} cancelada.`)
          }}
        />
      ) : null}

      {current?.kind === 'statement' ? (
        <CheckoutStatementDialog open allowPayment statement={current.statement} onClose={close} />
      ) : null}
    </>
  )
}

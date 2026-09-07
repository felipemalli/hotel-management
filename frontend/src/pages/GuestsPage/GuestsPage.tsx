import { PlusIcon } from 'lucide-react'
import { useCallback, useMemo } from 'react'

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
import {
  type GuestAllRow,
  type GuestInHotelRow,
  type GuestPendingRow,
  GuestTable,
} from '@/features/guests/components/GuestTable'
import { GuestForm } from '@/features/guests/GuestForm'
import type { GuestRef } from '@/features/guests/types'
import { CancelReservationDialog } from '@/features/reservations/components/CancelReservationDialog'
import { CheckoutStatementDialog } from '@/features/reservations/components/CheckoutStatementDialog'
import {
  ReservationActions,
  type ReservationActionState,
} from '@/features/reservations/components/ReservationActions'
import { ReservationForm } from '@/features/reservations/components/ReservationForm'
import type { CheckoutStatement } from '@/features/reservations/types'
import { errorMessage } from '@/lib/errors/errors'
import { useDialogState } from '@/lib/hooks/useDialogState'
import { whenClosed } from '@/lib/hooks/useDismissibleOpen'
import { notifySuccess } from '@/lib/notify/toast'

type GuestsDialog =
  | { kind: 'guest' }
  | { kind: 'reservation'; guest: GuestRef }
  | { kind: 'cancel'; reservationId: number; guestName: string }
  | { kind: 'statement'; statement: CheckoutStatement }

type ReservationRow = GuestInHotelRow | GuestPendingRow

function RowReservationActions({
  row,
  state,
  onOpen,
}: {
  row: ReservationRow
  state: ReservationActionState
  onOpen: (dialog: GuestsDialog) => void
}) {
  return (
    <ReservationActions
      reservationId={row.reservation.id}
      guestName={row.guest.full_name}
      state={state}
      onCheckedOut={(statement) => onOpen({ kind: 'statement', statement })}
      onRequestCancel={() =>
        onOpen({
          kind: 'cancel',
          reservationId: row.reservation.id,
          guestName: row.guest.full_name,
        })
      }
    />
  )
}

// Dialogs na página, não na linha: checkout/cancel desmontam a linha.
export function GuestsPage() {
  const { current, open, close } = useDialogState<GuestsDialog>()

  // Referência estável: senão a linha remonta debaixo do diálogo e perde o foco.
  const renderNewReservation = useCallback(
    (row: GuestAllRow) => (
      <Button
        size="sm"
        variant="outline"
        onClick={() => open({ kind: 'reservation', guest: row.guest })}
      >
        Nova reserva
      </Button>
    ),
    [open],
  )

  const renderInHotelActions = useCallback(
    (row: GuestInHotelRow) => <RowReservationActions row={row} state="CHECKED_IN" onOpen={open} />,
    [open],
  )

  const renderPendingActions = useCallback(
    (row: GuestPendingRow) => <RowReservationActions row={row} state="PENDING" onOpen={open} />,
    [open],
  )

  const renderActions = useMemo(
    () => ({
      all: renderNewReservation,
      inHotel: renderInHotelActions,
      pending: renderPendingActions,
    }),
    [renderNewReservation, renderInHotelActions, renderPendingActions],
  )

  const headerActions = useMemo(
    () => (
      <Button onClick={() => open({ kind: 'guest' })}>
        <PlusIcon className="size-4" aria-hidden="true" />
        Novo hóspede
      </Button>
    ),
    [open],
  )

  return (
    <>
      <ErrorBoundary
        scope="guest-table"
        fallback={({ error, resetErrorBoundary }) => (
          <ErrorState message={errorMessage(error)} onRetry={resetErrorBoundary} />
        )}
      >
        <GuestTable headerActions={headerActions} renderActions={renderActions} />
      </ErrorBoundary>

      <Dialog open={current?.kind === 'guest'} onOpenChange={whenClosed(close)}>
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
        <Dialog open onOpenChange={whenClosed(close)}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[880px]">
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

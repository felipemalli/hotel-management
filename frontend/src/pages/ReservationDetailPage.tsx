import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Alert, Button, EmptyState, ErrorState, TableSkeleton } from '@/components/ui'
import { useGuest } from '@/features/guests/hooks'
import { CheckoutStatementDialog } from '@/features/reservations/CheckoutStatementDialog'
import { CancelReservationDialog } from '@/features/reservations/components/CancelReservationDialog'
import {
  ReservationAccountSection,
  ReservationHistorySection,
  ReservationPeopleSection,
  ReservationStaySection,
} from '@/features/reservations/components/ReservationSections'
import { ReservationStatusBadge } from '@/features/reservations/components/ReservationStatusBadge'
import { parseReservationId } from '@/features/reservations/filters'
import { useReservation, useReservationStatement } from '@/features/reservations/hooks'
import { ReservationActions } from '@/features/reservations/ReservationActions'
import { errorMessage, isApiErrorCode } from '@/lib/errors'
import { returnFocusToContent } from '@/lib/focus'
import { ROUTES } from '@/lib/routes'
import { notifySuccess } from '@/lib/toast'

type DetailDialog = 'statement' | 'cancel' | null

export function ReservationDetailPage() {
  const { id: rawId } = useParams()
  const id = parseReservationId(rawId)
  const reservation = useReservation(id)
  const guest = useGuest(reservation.data?.guest_id)
  const [dialog, setDialog] = useState<DetailDialog>(null)
  // O checkout já semeou esta chave com o extrato que o POST devolveu: abrir a
  // 2ª via logo depois não custa uma segunda ida ao servidor.
  const statement = useReservationStatement(id ?? 0, { enabled: dialog === 'statement' })

  if (id === null || isApiErrorCode(reservation.error, 'NOT_FOUND')) return <NotFound />

  if (reservation.isPending) return <TableSkeleton rows={3} columns={2} />

  if (reservation.isError) {
    return (
      <ErrorState
        message={errorMessage(reservation.error)}
        onRetry={() => void reservation.refetch()}
      />
    )
  }

  const current = reservation.data
  const guestName = guest.data?.full_name ?? `reserva #${current.id}`

  function close() {
    returnFocusToContent()
    setDialog(null)
  }

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-slate-900">Reserva #{current.id}</h2>
          <ReservationStatusBadge status={current.status} />
        </div>
        <Link to={ROUTES.reservations} className="text-sm text-slate-600 underline">
          Voltar às reservas
        </Link>
      </header>

      <ReservationStaySection reservation={current} />
      <ReservationPeopleSection reservation={current} guest={guest} />
      <ReservationHistorySection reservation={current} />
      {current.status === 'CHECKED_OUT' ? (
        <ReservationAccountSection reservation={current} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {current.status === 'PENDING' || current.status === 'CHECKED_IN' ? (
          <ReservationActions
            reservationId={current.id}
            guestName={guestName}
            state={current.status}
            onCheckedOut={() => setDialog('statement')}
            onRequestCancel={() => setDialog('cancel')}
          />
        ) : null}

        {current.status === 'CHECKED_OUT' ? (
          <Button variant="secondary" onClick={() => setDialog('statement')}>
            Ver extrato
          </Button>
        ) : null}

        {current.status === 'CANCELLED' ? (
          <p className="text-sm text-slate-500">Reserva cancelada — nenhuma ação disponível.</p>
        ) : null}
      </div>

      {dialog === 'cancel' ? (
        <CancelReservationDialog
          reservationId={current.id}
          guestName={guestName}
          onClose={close}
          onCancelled={() => {
            close()
            notifySuccess(`Reserva de ${guestName} cancelada.`)
          }}
        />
      ) : null}

      {dialog === 'statement' && statement.data ? (
        <CheckoutStatementDialog open allowPayment statement={statement.data} onClose={close} />
      ) : null}

      {dialog === 'statement' && statement.isError ? (
        <Alert tone="error" onDismiss={() => setDialog(null)}>
          {errorMessage(statement.error)}
        </Alert>
      ) : null}
    </article>
  )
}

// Id que não é número, ou reserva que não existe: as duas terminam aqui, e a
// primeira nem chega a virar requisição.
function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <EmptyState message="Reserva não encontrada" />
      <Link to={ROUTES.reservations} className="text-sm text-slate-600 underline">
        Voltar às reservas
      </Link>
    </div>
  )
}

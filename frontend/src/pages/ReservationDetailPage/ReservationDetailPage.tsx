import { ArrowLeftIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Alert, EmptyState, ErrorState, PageHeader } from '@/components/common'
import { Button, buttonVariants, Typography } from '@/components/ui'
import { useGuest } from '@/features/guests/hooks'
import { CancelReservationDialog } from '@/features/reservations/components/CancelReservationDialog'
import { CheckoutStatementDialog } from '@/features/reservations/components/CheckoutStatementDialog'
import { ReservationActions } from '@/features/reservations/components/ReservationActions'
import {
  ReservationAccountSection,
  ReservationHistorySection,
  ReservationPeopleSection,
  ReservationStaySection,
} from '@/features/reservations/components/ReservationSections'
import { ReservationStatusBadge } from '@/features/reservations/components/ReservationStatusBadge'
import { parseReservationId } from '@/features/reservations/filters'
import { useReservation, useReservationStatement } from '@/features/reservations/hooks'
import { errorMessage, isApiErrorCode } from '@/lib/errors/errors'
import { notifySuccess } from '@/lib/notify/toast'
import { ROUTES } from '@/lib/routing/routes'

import { ReservationDetailPageSkeleton } from './ReservationDetailPageSkeleton'

type DetailDialog = 'statement' | 'cancel' | null

export function ReservationDetailPage() {
  const { id: rawId } = useParams()
  const id = parseReservationId(rawId)
  const reservation = useReservation(id)
  const guest = useGuest(reservation.data?.guest_id)
  const [dialog, setDialog] = useState<DetailDialog>(null)
  // Checkout já semeou esta chave: a 2ª via e a seção Conta não refazem o GET.
  const statement = useReservationStatement(id ?? 0, {
    enabled: dialog === 'statement' || reservation.data?.status === 'CHECKED_OUT',
  })

  if (id === null || isApiErrorCode(reservation.error, 'NOT_FOUND')) return <NotFound />

  if (reservation.isPending) return <ReservationDetailPageSkeleton />

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
    setDialog(null)
  }

  return (
    <article className="flex flex-col gap-6">
      <PageHeader
        title={`Reserva #${current.id}`}
        breadcrumb={
          <>
            Hotel Vila Marés{' '}
            <Link to={ROUTES.reservations} className="underline decoration-border">
              Reservas
            </Link>
          </>
        }
        badge={<ReservationStatusBadge status={current.status} />}
        actions={
          <Link to={ROUTES.reservations} className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeftIcon className="size-4 opacity-60" aria-hidden="true" />
            Voltar às reservas
          </Link>
        }
      />

      <ReservationStaySection reservation={current} />
      <ReservationPeopleSection reservation={current} guest={guest} />
      <ReservationHistorySection reservation={current} />
      {current.status === 'CHECKED_OUT' ? (
        <ReservationAccountSection reservation={current} statement={statement.data} />
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
          <Button variant="outline" onClick={() => setDialog('statement')}>
            Ver extrato
          </Button>
        ) : null}

        {current.status === 'CANCELLED' ? (
          <Typography as="p" variant="body" tone="muted">
            Reserva cancelada — nenhuma ação disponível.
          </Typography>
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

function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <EmptyState message="Reserva não encontrada" />
      <Link to={ROUTES.reservations} className="text-sm text-muted-foreground underline">
        Voltar às reservas
      </Link>
    </div>
  )
}

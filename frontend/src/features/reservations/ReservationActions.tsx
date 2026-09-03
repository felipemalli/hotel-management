import { useState } from 'react'

import { Button, Dialog } from '@/components/ui'
import { earlyCheckinServerTime } from '@/lib/errors'

import { EarlyCheckinDialog } from './EarlyCheckinDialog'
import { useCancelReservation, useCheckIn, useCheckOut } from './hooks'
import type { CheckoutStatement } from './types'

export type ReservationActionState = 'PENDING' | 'CHECKED_IN'

export interface ReservationActionsProps {
  reservationId: number
  guestName: string
  state: ReservationActionState
  onCheckedOut?: (statement: CheckoutStatement) => void
}

export function ReservationActions({
  reservationId,
  guestName,
  state,
  onCheckedOut,
}: ReservationActionsProps) {
  const [serverTime, setServerTime] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const checkIn = useCheckIn({ onSuccess: () => setServerTime(null) })
  const checkOut = useCheckOut({ onSuccess: onCheckedOut })
  const cancel = useCancelReservation({ onSuccess: () => setConfirmingCancel(false) })

  function runCheckIn(allowEarly: boolean) {
    checkIn.mutate(
      { id: reservationId, allow_early: allowEarly },
      {
        onError: (cause) => {
          const time = earlyCheckinServerTime(cause)
          if (time !== null) setServerTime(time)
        },
      },
    )
  }

  function runCheckOut() {
    checkOut.mutate(reservationId)
  }

  function runCancel() {
    cancel.mutate(reservationId)
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        {state === 'PENDING' ? (
          <>
            <Button size="sm" disabled={checkIn.isPending} onClick={() => runCheckIn(false)}>
              {checkIn.isPending ? 'Registrando…' : 'Check-in'}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={cancel.isPending}
              onClick={() => setConfirmingCancel(true)}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={checkOut.isPending} onClick={runCheckOut}>
            {checkOut.isPending ? 'Fechando…' : 'Checkout'}
          </Button>
        )}
      </div>

      <EarlyCheckinDialog
        open={serverTime !== null}
        serverTime={serverTime ?? ''}
        guestName={guestName}
        pending={checkIn.isPending}
        onConfirm={() => runCheckIn(true)}
        onCancel={() => setServerTime(null)}
      />

      <Dialog
        open={confirmingCancel}
        role="alertdialog"
        size="sm"
        title="Cancelar reserva"
        description={`A reserva de ${guestName} será cancelada. A ação não pode ser desfeita.`}
        onClose={() => setConfirmingCancel(false)}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={cancel.isPending}
              onClick={() => setConfirmingCancel(false)}
            >
              Voltar
            </Button>
            <Button variant="danger" disabled={cancel.isPending} onClick={runCancel}>
              {cancel.isPending ? 'Cancelando…' : 'Cancelar reserva'}
            </Button>
          </>
        }
      />
    </div>
  )
}

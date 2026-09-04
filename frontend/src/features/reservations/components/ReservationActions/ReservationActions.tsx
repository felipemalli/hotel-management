import { useState } from 'react'

import { Button } from '@/components/ui'
import { EarlyCheckinDialog } from '@/features/reservations/components/EarlyCheckinDialog'
import { useCheckIn, useCheckOut } from '@/features/reservations/hooks'
import type { CheckoutStatement, ReservationStatus } from '@/features/reservations/types'
import {
  type EarlyCheckinInfo,
  earlyCheckinInfo,
  errorMessage,
  isApiErrorCode,
} from '@/lib/errors/errors'
import { notifyError, notifySuccess } from '@/lib/notify/toast'

export type ReservationActionState = Extract<ReservationStatus, 'PENDING' | 'CHECKED_IN'>

export interface ReservationActionsProps {
  reservationId: number
  guestName: string
  state: ReservationActionState
  // Extrato e cancelamento moram na página: as mutations tiram esta linha.
  onCheckedOut: (statement: CheckoutStatement) => void
  onRequestCancel: () => void
}

export function ReservationActions({
  reservationId,
  guestName,
  state,
  onCheckedOut,
  onRequestCancel,
}: ReservationActionsProps) {
  const [early, setEarly] = useState<EarlyCheckinInfo | null>(null)

  const checkIn = useCheckIn({
    onSuccess: () => {
      setEarly(null)
      notifySuccess(`Check-in de ${guestName} registrado.`)
    },
  })
  const checkOut = useCheckOut({ onSuccess: onCheckedOut })

  function runCheckIn(allowEarly: boolean) {
    checkIn.mutate(
      { id: reservationId, allow_early: allowEarly },
      {
        onError: (cause) => {
          const info = earlyCheckinInfo(cause)
          if (info !== null) {
            setEarly(info)
            return
          }
          // Sem isto o 409 some: os códigos estão na lista dos apresentados localmente.
          if (isApiErrorCode(cause, 'ROOM_UNAVAILABLE') || isApiErrorCode(cause, 'EARLY_CHECKIN')) {
            notifyError(errorMessage(cause))
          }
        },
      },
    )
  }

  function runCheckOut() {
    checkOut.mutate(reservationId)
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        {state === 'PENDING' ? (
          <>
            <Button size="sm" disabled={checkIn.isPending} onClick={() => runCheckIn(false)}>
              {checkIn.isPending ? 'Registrando…' : 'Check-in'}
            </Button>
            <Button size="sm" variant="destructive" onClick={onRequestCancel}>
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
        open={early !== null}
        serverTime={early?.serverTime ?? ''}
        opensAt={early?.opensAt ?? ''}
        guestName={guestName}
        pending={checkIn.isPending}
        onConfirm={() => runCheckIn(true)}
        onCancel={() => setEarly(null)}
      />
    </div>
  )
}

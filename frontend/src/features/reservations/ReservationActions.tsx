import { useState } from 'react'

import { Button } from '@/components/ui'
import { earlyCheckinServerTime } from '@/lib/errors'
import { notifySuccess } from '@/lib/toast'

import { EarlyCheckinDialog } from './EarlyCheckinDialog'
import { useCheckIn, useCheckOut } from './hooks'
import type { CheckoutStatement, ReservationStatus } from './types'

export type ReservationActionState = Extract<ReservationStatus, 'PENDING' | 'CHECKED_IN'>

export interface ReservationActionsProps {
  reservationId: number
  guestName: string
  state: ReservationActionState
  // Obrigatórios: o extrato e a confirmação de cancelamento moram na página,
  // porque as duas mutations tiram esta linha da listagem. Sem o callback, a
  // ação seguiria clicável e o atendente ficaria sem o extrato e sem confirmar.
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
  const [serverTime, setServerTime] = useState<string | null>(null)

  const checkIn = useCheckIn({
    onSuccess: () => {
      setServerTime(null)
      notifySuccess(`Check-in de ${guestName} registrado.`)
    },
  })
  const checkOut = useCheckOut({ onSuccess: onCheckedOut })

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

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        {state === 'PENDING' ? (
          <>
            <Button size="sm" disabled={checkIn.isPending} onClick={() => runCheckIn(false)}>
              {checkIn.isPending ? 'Registrando…' : 'Check-in'}
            </Button>
            <Button size="sm" variant="danger" onClick={onRequestCancel}>
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
    </div>
  )
}

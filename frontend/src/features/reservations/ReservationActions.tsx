import { useState } from 'react'

import { Button } from '@/components/ui'
import {
  type EarlyCheckinInfo,
  earlyCheckinInfo,
  errorMessage,
  isApiErrorCode,
} from '@/lib/errors/errors'
import { notifyError, notifySuccess } from '@/lib/notify/toast'

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
          // Quarto ainda ocupado, chegada antecipada, ou um `EARLY_CHECKIN`
          // sem os horários no `extra`: não há o que confirmar, e os dois
          // códigos estão na lista dos apresentados localmente — sem este
          // aviso o erro sumiria da tela.
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

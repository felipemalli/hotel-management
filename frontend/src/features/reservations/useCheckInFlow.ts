import { useState } from 'react'

import {
  type EarlyCheckinInfo,
  earlyCheckinInfo,
  errorMessage,
  isApiErrorCode,
} from '@/lib/errors/errors'
import { notifyError, notifySuccess } from '@/lib/notify/toast'

import { useCheckIn } from './hooks'
import type { Reservation } from './types'

export interface CheckInFlowHandle {
  start: () => void
  confirmEarly: () => void
  dismissEarly: () => void
  early: EarlyCheckinInfo | null
  isPending: boolean
}

export interface CheckInFlowOptions {
  reservationId: number
  guestName: string
  onSuccess?: (reservation: Reservation) => void
}

/** Conduz o protocolo do check-in: 409 `EARLY_CHECKIN` → diálogo → reenvio com `allow_early`. */
export function useCheckInFlow({
  reservationId,
  guestName,
  onSuccess,
}: CheckInFlowOptions): CheckInFlowHandle {
  const [early, setEarly] = useState<EarlyCheckinInfo | null>(null)

  const checkIn = useCheckIn({
    onSuccess: (reservation) => {
      setEarly(null)
      notifySuccess(`Check-in de ${guestName} registrado.`)
      onSuccess?.(reservation)
    },
  })

  function run(allowEarly: boolean) {
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

  return {
    start: () => run(false),
    confirmEarly: () => run(true),
    dismissEarly: () => setEarly(null),
    early,
    isPending: checkIn.isPending,
  }
}

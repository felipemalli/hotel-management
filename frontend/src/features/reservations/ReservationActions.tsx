import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { earlyCheckinServerTime, errorMessage } from '@/lib/errors'

import { CheckoutStatementDialog } from './CheckoutStatementDialog'
import { EarlyCheckinDialog } from './EarlyCheckinDialog'
import { useCancelReservation, useCheckIn, useCheckOut } from './hooks'
import type { CheckoutStatement } from './types'

/**
 * Acoes de uma reserva na linha da tabela — RF6, RF7 e os fluxos F2/F3.
 *
 * Conduz o protocolo da D4 de ponta a ponta: `check-in` sai com
 * `allow_early: false`; se a resposta for `409 EARLY_CHECKIN`, o
 * `extra.server_time` abre o alerta e a confirmacao do atendente reenvia com
 * `allow_early: true`. Cancelar fecha o alerta sem efeito nenhum.
 *
 * Recebe so `reservationId`, `guestName` e o estado — nao importa tipos da
 * feature de hospedes, o que mantem a dependencia entre features em uma
 * direcao (guests nao conhece reservations, reservations nao conhece guests).
 */

export type ReservationActionState = 'PENDING' | 'CHECKED_IN'

export interface ReservationActionsProps {
  reservationId: number
  guestName: string
  state: ReservationActionState
}

export function ReservationActions({
  reservationId,
  guestName,
  state,
}: ReservationActionsProps) {
  const [serverTime, setServerTime] = useState<string | null>(null)
  const [statement, setStatement] = useState<CheckoutStatement | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkIn = useCheckIn({ onSuccess: () => setServerTime(null) })
  const checkOut = useCheckOut({ onSuccess: setStatement })
  const cancel = useCancelReservation({ onSuccess: () => setConfirmingCancel(false) })

  function runCheckIn(allowEarly: boolean) {
    setError(null)
    checkIn.mutate(
      { id: reservationId, allow_early: allowEarly },
      {
        onError: (cause) => {
          // O 409 de D4 nao e falha: e um ramo de protocolo. Vira alerta.
          const time = earlyCheckinServerTime(cause)
          if (time !== null) {
            setServerTime(time)
            return
          }
          setError(errorMessage(cause))
        },
      },
    )
  }

  function runCheckOut() {
    setError(null)
    checkOut.mutate(reservationId, {
      onError: (cause) => setError(errorMessage(cause)),
    })
  }

  function runCancel() {
    setError(null)
    cancel.mutate(reservationId, {
      onError: (cause) => setError(errorMessage(cause)),
    })
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

      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <EarlyCheckinDialog
        open={serverTime !== null}
        serverTime={serverTime ?? ''}
        guestName={guestName}
        pending={checkIn.isPending}
        onConfirm={() => runCheckIn(true)}
        onCancel={() => setServerTime(null)}
      />

      {statement ? (
        <CheckoutStatementDialog
          open
          statement={statement}
          onClose={() => setStatement(null)}
        />
      ) : null}

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

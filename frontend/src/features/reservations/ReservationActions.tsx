import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { earlyCheckinServerTime } from '@/lib/errors'

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
 *
 * O extrato do checkout NAO e estado deste componente. Ele sobe por
 * `onCheckedOut` para quem renderiza a tabela: o checkout remove o hospede da
 * aba "No hotel", a linha desmonta, e um dialogo que morasse aqui morreria
 * junto — o atendente veria o total piscar e desaparecer, reprovando a RN6.
 *
 * Falha inesperada (rede, `INVALID_STATUS`, 500) **nao** e tratada aqui: sobe
 * para o handler global do `MutationCache` (SPEC 8.2/E) e aparece em toast.
 * Este componente so intercepta o 409 de D4, porque esse nao e erro — e o
 * alerta que a RN4 pede.
 */

export type ReservationActionState = 'PENDING' | 'CHECKED_IN'

export interface ReservationActionsProps {
  reservationId: number
  guestName: string
  state: ReservationActionState
  /** Recebe o extrato para exibi-lo FORA da linha da tabela (ver acima). */
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
          // O 409 de D4 nao e falha: e um ramo de protocolo. Vira alerta.
          // Qualquer outro codigo cai no toast global e o alerta nao abre.
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

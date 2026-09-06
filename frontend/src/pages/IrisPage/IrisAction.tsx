import { Button } from '@/components/ui'
import type { ProposedAction } from '@/features/ai/types'
import { EarlyCheckinDialog } from '@/features/reservations/components/EarlyCheckinDialog'
import { useCheckOut } from '@/features/reservations/hooks'
import type { CheckoutStatement } from '@/features/reservations/types'
import { useCheckInFlow } from '@/features/reservations/useCheckInFlow'
import { formatISODateTime } from '@/lib/format/dates'

export interface IrisActionProps {
  action: ProposedAction
  onDone: (text: string) => void
  onStatement: (statement: CheckoutStatement) => void
}

export function IrisAction({ action, onDone, onStatement }: IrisActionProps) {
  const { guest_name: guestName, reservation_id: reservationId } = action

  const flow = useCheckInFlow({
    reservationId,
    guestName,
    onSuccess: (reservation) =>
      onDone(
        `Check-in de ${guestName} registrado em ${formatISODateTime(reservation.checked_in_at ?? '')}`,
      ),
  })

  const checkOut = useCheckOut({
    onSuccess: (statement) => {
      onStatement(statement)
      onDone(`Checkout de ${guestName} concluído · conta fechada`)
    },
  })

  if (action.type === 'checkout') {
    return (
      <Button
        size="lg"
        disabled={checkOut.isPending}
        onClick={() => checkOut.mutate(reservationId)}
      >
        {checkOut.isPending ? 'Confirmando…' : 'Confirmar checkout'}
      </Button>
    )
  }

  return (
    <>
      <Button size="lg" disabled={flow.isPending} onClick={flow.start}>
        {flow.isPending ? 'Confirmando…' : 'Confirmar check-in'}
      </Button>

      <EarlyCheckinDialog
        open={flow.early !== null}
        serverTime={flow.early?.serverTime ?? ''}
        opensAt={flow.early?.opensAt ?? ''}
        guestName={guestName}
        pending={flow.isPending}
        onConfirm={flow.confirmEarly}
        onCancel={flow.dismissEarly}
      />
    </>
  )
}

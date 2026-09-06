import { Button } from '@/components/ui'
import { EarlyCheckinDialog } from '@/features/reservations/components/EarlyCheckinDialog'
import { useCheckOut } from '@/features/reservations/hooks'
import type { CheckoutStatement, ReservationStatus } from '@/features/reservations/types'
import { useCheckInFlow } from '@/features/reservations/useCheckInFlow'

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
  const flow = useCheckInFlow({ reservationId, guestName })
  const checkOut = useCheckOut({ onSuccess: onCheckedOut })

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        {state === 'PENDING' ? (
          <>
            <Button size="sm" disabled={flow.isPending} onClick={flow.start}>
              {flow.isPending ? 'Registrando…' : 'Check-in'}
            </Button>
            <Button size="sm" variant="destructive" onClick={onRequestCancel}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={checkOut.isPending}
            onClick={() => checkOut.mutate(reservationId)}
          >
            {checkOut.isPending ? 'Fechando…' : 'Checkout'}
          </Button>
        )}
      </div>

      <EarlyCheckinDialog
        open={flow.early !== null}
        serverTime={flow.early?.serverTime ?? ''}
        opensAt={flow.early?.opensAt ?? ''}
        guestName={guestName}
        pending={flow.isPending}
        onConfirm={flow.confirmEarly}
        onCancel={flow.dismissEarly}
      />
    </div>
  )
}

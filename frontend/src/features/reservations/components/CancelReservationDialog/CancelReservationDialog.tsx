import { ConfirmDestructiveDialog } from '@/components/common'
import { useCancelReservation } from '@/features/reservations/hooks'

export interface CancelReservationDialogProps {
  reservationId: number
  guestName: string
  onClose: () => void
  onCancelled: () => void
}

export function CancelReservationDialog({
  reservationId,
  guestName,
  onClose,
  onCancelled,
}: CancelReservationDialogProps) {
  const cancel = useCancelReservation({ onSuccess: onCancelled })

  return (
    <ConfirmDestructiveDialog
      title="Cancelar reserva"
      description={`A reserva de ${guestName} será cancelada. A ação não pode ser desfeita.`}
      pending={cancel.isPending}
      confirmLabel="Cancelar reserva"
      pendingLabel="Cancelando…"
      onClose={onClose}
      onConfirm={() => cancel.mutate(reservationId)}
    />
  )
}

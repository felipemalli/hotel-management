import { Button, Dialog } from '@/components/ui'

import { useCancelReservation } from '../hooks'

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
    <Dialog
      open
      role="alertdialog"
      size="sm"
      title="Cancelar reserva"
      description={`A reserva de ${guestName} será cancelada. A ação não pode ser desfeita.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" disabled={cancel.isPending} onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(reservationId)}
          >
            {cancel.isPending ? 'Cancelando…' : 'Cancelar reserva'}
          </Button>
        </>
      }
    />
  )
}

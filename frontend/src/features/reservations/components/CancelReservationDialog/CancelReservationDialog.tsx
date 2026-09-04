import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui'
import { useCancelReservation } from '@/features/reservations/hooks'
import { focusMainContent } from '@/lib/a11y/focus'

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
  // open=false antes de desmontar: o Base UI restaura o foco nessa transição.
  const [open, setOpen] = useState(true)
  // Só a confirmação usa finalFocus: a linha desmonta com a reserva cancelada.
  const [confirmed, setConfirmed] = useState(false)

  return (
    <AlertDialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(next) => (next ? undefined : onClose())}
    >
      <AlertDialogContent
        size="sm"
        finalFocus={confirmed ? () => focusMainContent() ?? true : undefined}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar reserva</AlertDialogTitle>
          <AlertDialogDescription>
            A reserva de {guestName} será cancelada. A ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancel.isPending}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => {
              setConfirmed(true)
              cancel.mutate(reservationId)
            }}
          >
            {cancel.isPending ? 'Cancelando…' : 'Cancelar reserva'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

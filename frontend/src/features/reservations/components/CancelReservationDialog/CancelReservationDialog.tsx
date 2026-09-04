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
  // Fechar precisa passar por `open=false` antes de desmontar: é nessa
  // transição que o Base UI restaura o foco. Desmontar direto no pedido de
  // fechamento (Escape, clique fora, "Voltar") atropela essa restauração.
  const [open, setOpen] = useState(true)
  // "Voltar"/Escape devolvem o foco ao próprio gatilho (padrão do Base UI,
  // que segue vivo). Só a confirmação precisa de `finalFocus`: a linha que
  // abriu o diálogo desmonta junto com a reserva cancelada.
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

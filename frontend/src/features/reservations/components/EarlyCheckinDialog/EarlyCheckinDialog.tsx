import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Typography,
} from '@/components/ui'
import type { EarlyCheckinInfo } from '@/lib/errors/errors'
import { whenClosed } from '@/lib/hooks/useDismissibleOpen'

export interface EarlyCheckinDialogProps {
  early: EarlyCheckinInfo | null
  guestName: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function EarlyCheckinDialog({
  early,
  guestName,
  pending = false,
  onConfirm,
  onCancel,
}: EarlyCheckinDialogProps) {
  return (
    <AlertDialog open={early !== null} onOpenChange={whenClosed(onCancel)}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{`Check-in antes das ${early?.opensAt ?? ''}`}</AlertDialogTitle>
          <AlertDialogDescription>
            {`São ${early?.serverTime ?? ''} — o check-in abre às ${early?.opensAt ?? ''}. Confirmar mesmo assim?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Typography as="p" variant="body" tone="muted">
          O check-in de{' '}
          <Typography as="strong" variant="body">
            {guestName}
          </Typography>{' '}
          será registrado fora do horário de abertura.
        </Typography>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            {pending ? 'Confirmando…' : 'Confirmar mesmo assim'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

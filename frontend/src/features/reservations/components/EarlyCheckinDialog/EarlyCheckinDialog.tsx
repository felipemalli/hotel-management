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

export interface EarlyCheckinDialogProps {
  open: boolean
  serverTime: string
  // Horário da política vigente, não de constante.
  opensAt: string
  guestName: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function EarlyCheckinDialog({
  open,
  serverTime,
  opensAt,
  guestName,
  pending = false,
  onConfirm,
  onCancel,
}: EarlyCheckinDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{`Check-in antes das ${opensAt}`}</AlertDialogTitle>
          <AlertDialogDescription>
            {`São ${serverTime} — o check-in abre às ${opensAt}. Confirmar mesmo assim?`}
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

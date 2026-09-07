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
import { useDismissibleOpen } from '@/lib/hooks/useDismissibleOpen'

export interface ConfirmDestructiveDialogProps {
  title: string
  description: string
  pending: boolean
  confirmLabel: string
  pendingLabel: string
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDestructiveDialog({
  title,
  description,
  pending,
  confirmLabel,
  pendingLabel,
  onClose,
  onConfirm,
}: ConfirmDestructiveDialogProps) {
  const { open, onOpenChange, onOpenChangeComplete } = useDismissibleOpen(onClose)

  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

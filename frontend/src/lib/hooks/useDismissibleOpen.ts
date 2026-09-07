import { useCallback, useState } from 'react'

export function whenClosed(onClose: () => void) {
  return (open: boolean) => {
    if (!open) onClose()
  }
}

export function useDismissibleOpen(onClose: () => void, initiallyOpen = true) {
  // open=false antes de desmontar: o Base UI restaura o foco nessa transição.
  const [open, setOpen] = useState(initiallyOpen)
  const onOpenChangeComplete = useCallback(
    (next: boolean) => {
      if (!next) onClose()
    },
    [onClose],
  )

  return { open, setOpen, onOpenChange: setOpen, onOpenChangeComplete }
}

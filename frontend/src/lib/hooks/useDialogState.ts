import { useCallback, useState } from 'react'

export interface DialogState<T> {
  current: T | null
  open: (dialog: T) => void
  close: () => void
}

export function useDialogState<T>(): DialogState<T> {
  const [current, setCurrent] = useState<T | null>(null)

  const open = useCallback((dialog: T) => {
    setCurrent(dialog)
  }, [])

  const close = useCallback(() => {
    setCurrent(null)
  }, [])

  return { current, open, close }
}

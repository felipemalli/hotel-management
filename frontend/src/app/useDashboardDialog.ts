import { useCallback, useState } from 'react'

import type { GuestRef } from '@/features/guests/types'
import type { CheckoutStatement } from '@/features/reservations/types'

export type DashboardDialog =
  | { kind: 'guest' }
  | { kind: 'reservation'; guest: GuestRef }
  | { kind: 'cancel'; reservationId: number; guestName: string }
  | { kind: 'statement'; statement: CheckoutStatement }

export interface DashboardDialogHandle {
  current: DashboardDialog | null
  open: (dialog: DashboardDialog) => void
  close: () => void
}

export function useDashboardDialog(): DashboardDialogHandle {
  const [current, setCurrent] = useState<DashboardDialog | null>(null)

  const open = useCallback((dialog: DashboardDialog) => {
    setCurrent(dialog)
  }, [])

  const close = useCallback(() => {
    setCurrent(null)
  }, [])

  return { current, open, close }
}

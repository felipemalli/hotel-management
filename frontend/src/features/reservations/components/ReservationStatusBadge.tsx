import { Badge } from '@/components/ui'

import { RESERVATION_STATUS_LABELS, RESERVATION_STATUS_TONES } from '../status'
import type { ReservationStatus } from '../types'

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <Badge variant={RESERVATION_STATUS_TONES[status]}>{RESERVATION_STATUS_LABELS[status]}</Badge>
  )
}

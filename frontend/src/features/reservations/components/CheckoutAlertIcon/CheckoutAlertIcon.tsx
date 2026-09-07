import { OctagonAlertIcon, TriangleAlertIcon } from 'lucide-react'

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { CHECKOUT_ALERT_LABELS, type CheckoutAlert } from '@/features/reservations/status'

const ALERT_ICON = {
  due: TriangleAlertIcon,
  overdue: OctagonAlertIcon,
} as const

const ALERT_ICON_CLASS = {
  due: 'text-amber-600',
  overdue: 'text-red-600',
} as const

export function CheckoutAlertIcon({ alert }: { alert: CheckoutAlert }) {
  const Icon = ALERT_ICON[alert]
  const label = CHECKOUT_ALERT_LABELS[alert]

  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={label} />}>
        <Icon className={ALERT_ICON_CLASS[alert]} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { DismissButton } from '../DismissButton'

export type AlertTone = 'error' | 'warning' | 'success' | 'info'

const TONES: Record<AlertTone, string> = {
  error: 'bg-destructive/10 text-destructive ring-destructive/20',
  warning: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',
  success: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20',
  info: 'bg-muted text-muted-foreground ring-border',
}

const ROLES: Record<AlertTone, 'alert' | 'status'> = {
  error: 'alert',
  warning: 'alert',
  success: 'status',
  info: 'status',
}

export interface AlertProps {
  tone?: AlertTone
  children: ReactNode
  onDismiss?: () => void
}

export function Alert({ tone = 'error', children, onDismiss }: AlertProps) {
  return (
    <div
      role={ROLES[tone]}
      className={cn(
        'flex items-start gap-3 rounded-md px-3 py-2 text-sm ring-1 ring-inset',
        TONES[tone],
      )}
    >
      <span className="grow">{children}</span>
      {onDismiss ? <DismissButton onClick={onDismiss} /> : null}
    </div>
  )
}

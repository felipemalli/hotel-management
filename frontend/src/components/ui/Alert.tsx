import type { ReactNode } from 'react'

import { DismissButton } from './DismissButton'

export type AlertTone = 'error' | 'warning' | 'success' | 'info'

const TONES: Record<AlertTone, string> = {
  error: 'bg-red-50 text-red-800 ring-red-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  info: 'bg-slate-50 text-slate-700 ring-slate-200',
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
      className={`flex items-start gap-3 rounded-md px-3 py-2 text-sm ring-1 ring-inset ${TONES[tone]}`}
    >
      <span className="grow">{children}</span>
      {onDismiss ? <DismissButton onClick={onDismiss} /> : null}
    </div>
  )
}

import { CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'

import { Typography } from '@/components/ui'

export interface IrisAnswerProps {
  question: string
  reply: string
  action?: ReactNode
  done?: string
}

export function IrisAnswer({ question, reply, action, done }: IrisAnswerProps) {
  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex items-baseline gap-2.5">
        <Typography as="span" variant="mono" tone="mutedLight" className="pt-[3px] tracking-widest">
          VOCÊ
        </Typography>
        <Typography as="p" variant="body" weight="medium">
          {question}
        </Typography>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex gap-3 px-5 py-4.5">
          <span
            aria-hidden="true"
            className="mt-px flex size-6 flex-none items-center justify-center rounded-full border-2 border-primary"
          >
            <span className="size-1.75 rounded-full bg-primary" />
          </span>
          <Typography as="p" variant="body" className="leading-6" aria-live="polite">
            {reply}
          </Typography>
        </div>

        {action === undefined ? null : (
          <div className="border-t border-border bg-background px-5 py-3.5">{action}</div>
        )}

        {done === undefined ? null : (
          <div className="flex items-center gap-2 border-t border-border bg-background px-5 py-3.5">
            <CircleCheck className="size-4 opacity-55" aria-hidden="true" />
            <Typography as="p" variant="label">
              {done}
            </Typography>
          </div>
        )}
      </div>
    </div>
  )
}

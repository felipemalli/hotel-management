import { X } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export interface DismissButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type'
> {
  label?: string
}

export function DismissButton({ label = 'Fechar aviso', className, ...props }: DismissButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'shrink-0 rounded p-1 text-current hover:bg-black/5',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
        className,
      )}
      {...props}
    >
      <X className="size-4" />
    </button>
  )
}

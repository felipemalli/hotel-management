import type { ButtonHTMLAttributes } from 'react'

import { CloseIcon } from '@/components/icons'

export interface DismissButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type'
> {
  label?: string
}

export function DismissButton({
  label = 'Fechar aviso',
  className = '',
  ...props
}: DismissButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={[
        'shrink-0 rounded p-1 text-current hover:bg-black/5',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
        className,
      ].join(' ')}
      {...props}
    >
      <CloseIcon />
    </button>
  )
}

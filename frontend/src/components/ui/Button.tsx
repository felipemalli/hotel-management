import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Botao unico do sistema (SPEC 5.1: primitivos minimos em Tailwind).
 * Foco visivel em todas as variantes — acessibilidade de teclado no balcao.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'sm'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-700 focus-visible:outline-slate-900 disabled:bg-slate-400',
  secondary:
    'bg-white text-slate-900 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 focus-visible:outline-slate-900 disabled:text-slate-400',
  danger:
    'bg-white text-red-700 ring-1 ring-red-300 ring-inset hover:bg-red-50 focus-visible:outline-red-700 disabled:text-red-300',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-900',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-2.5 py-1.5 text-xs',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...props}
    />
  )
}

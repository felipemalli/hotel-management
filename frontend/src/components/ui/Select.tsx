import { forwardRef, type ReactNode, type SelectHTMLAttributes, useId } from 'react'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

// Mesma fiação de rótulo, dica e erro do `Input`: quem já sabe ler um campo de
// texto desta interface lê um campo de escolha sem aprender nada novo.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, className = '', id, children, ...props },
  ref,
) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const errorId = `${selectId}-error`
  const hintId = `${selectId}-hint`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <select
        id={selectId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={[
          'rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset',
          'focus:outline-2 focus:-outline-offset-2 disabled:bg-slate-50 disabled:text-slate-500',
          error ? 'ring-red-400 focus:outline-red-600' : 'ring-slate-300 focus:outline-slate-900',
          className,
        ].join(' ')}
        {...props}
      >
        {children}
      </select>
      {hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
})

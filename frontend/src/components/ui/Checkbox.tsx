import { forwardRef, type InputHTMLAttributes, useId } from 'react'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  error?: string
  hint?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, hint, className = '', id, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          ref={ref}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={[
            'size-4 rounded border-slate-300 text-slate-900',
            'focus:outline-2 focus:outline-offset-2 focus:outline-slate-900',
            className,
          ].join(' ')}
          {...props}
        />
        <label htmlFor={inputId} className="text-sm text-slate-800">
          {label}
        </label>
      </div>
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

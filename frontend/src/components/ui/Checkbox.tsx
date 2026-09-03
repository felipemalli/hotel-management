import { type InputHTMLAttributes, useId } from 'react'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
}

export function Checkbox({ label, className = '', id, ...props }: CheckboxProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex items-center gap-2">
      <input
        id={inputId}
        type="checkbox"
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
  )
}

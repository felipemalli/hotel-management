import { useId, type InputHTMLAttributes } from 'react'

/**
 * Campo de texto com label e mensagem de erro acopladas.
 *
 * O erro e ligado por `aria-describedby` e `aria-invalid`: leitor de tela
 * anuncia a causa, e o teste consulta o campo pelo label acessivel.
 */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, className = '', id, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={[
          'rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset',
          'placeholder:text-slate-500 focus:outline-2 focus:-outline-offset-2',
          error
            ? 'ring-red-400 focus:outline-red-600'
            : 'ring-slate-300 focus:outline-slate-900',
          className,
        ].join(' ')}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

import type { ReactNode } from 'react'
import { useId } from 'react'

import { Field as UiField, FieldDescription, FieldError, FieldLabel } from '@/components/ui'

export interface FormFieldControl {
  id: string
  'aria-invalid': true | undefined
  'aria-describedby': string | undefined
}

export interface FormFieldProps {
  label: string
  hint?: string
  hintClassName?: string
  error?: string
  htmlFor?: string
  hideLabel?: boolean
  children: (control: FormFieldControl) => ReactNode
}

// O field vendorizado não liga aria-describedby/aria-invalid sozinho.
export function FormField({
  label,
  hint,
  hintClassName,
  error,
  htmlFor,
  hideLabel,
  children,
}: FormFieldProps) {
  const generatedId = useId()
  const id = htmlFor ?? generatedId
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  const control: FormFieldControl = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  }

  return (
    <UiField data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </FieldLabel>
      {children(control)}
      {hint ? (
        <FieldDescription id={hintId} className={hintClassName}>
          {hint}
        </FieldDescription>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </UiField>
  )
}

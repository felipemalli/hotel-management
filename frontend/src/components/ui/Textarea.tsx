import { forwardRef, type TextareaHTMLAttributes, useId } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, className = '', id, ...props },
  ref,
) {
  const generatedId = useId()
  const textareaId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={textareaId} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <textarea
        id={textareaId}
        ref={ref}
        className={[
          'rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset',
          'placeholder:text-slate-500 focus:outline-2 focus:-outline-offset-2 focus:outline-slate-900',
          className,
        ].join(' ')}
        {...props}
      />
    </div>
  )
})

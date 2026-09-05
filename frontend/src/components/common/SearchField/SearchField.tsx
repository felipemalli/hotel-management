import { SearchIcon } from 'lucide-react'

import { Input } from '@/components/ui'

import { FormField } from '../FormField'

export interface SearchFieldProps {
  label: string
  hint?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  className?: string
}

// Rótulo só acessível: o design não mostra texto acima do campo de busca.
export function SearchField({
  label,
  hint,
  placeholder,
  value,
  onChange,
  className,
}: SearchFieldProps) {
  return (
    <FormField label={label} hint={hint} hideLabel>
      {(control) => (
        <div className={className}>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60"
            />
            <Input
              type="search"
              placeholder={placeholder}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="pl-8"
              {...control}
            />
          </div>
        </div>
      )}
    </FormField>
  )
}

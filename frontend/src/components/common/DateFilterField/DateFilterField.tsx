import { XIcon } from 'lucide-react'

import { Button, Input } from '@/components/ui'
import { type DateFilter, TODAY } from '@/lib/routing/dateFilter'
import { cn } from '@/lib/utils'

import { FormField } from '../FormField'

export interface DateFilterFieldProps {
  label: string
  value: DateFilter
  today: string
  onChange: (value: DateFilter) => void
  className?: string
}

export function DateFilterField({
  label,
  value,
  today,
  onChange,
  className,
}: DateFilterFieldProps) {
  const isToday = value === TODAY

  return (
    <FormField label={label}>
      {(control) => (
        <div className={cn('flex items-center gap-1', className)}>
          <Input
            type="date"
            value={isToday ? today : (value ?? '')}
            onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
            {...control}
          />
          {/* Dois campos, dois "Hoje": sem o rótulo próprio, um leitor de tela
              anuncia o mesmo botão duas vezes. */}
          <Button
            type="button"
            variant={isToday ? 'default' : 'outline'}
            aria-label={`Hoje em ${label.toLowerCase()}`}
            aria-pressed={isToday}
            onClick={() => onChange(isToday ? null : TODAY)}
          >
            Hoje
          </Button>
          {value === null ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Limpar ${label.toLowerCase()}`}
              onClick={() => onChange(null)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </FormField>
  )
}

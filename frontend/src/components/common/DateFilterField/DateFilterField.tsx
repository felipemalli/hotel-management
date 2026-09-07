import { ptBR } from 'date-fns/locale'
import { CalendarIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from '@/components/ui'
import { formatISODate } from '@/lib/format/dates'
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

// `YYYY-MM-DD` sem passar por `new Date(iso)`: meia-noite UTC desloca o dia.
function isoToLocalDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
}

function localDateToISO(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function DateFilterField({ label, value, today, onChange, className }: DateFilterFieldProps) {
  const [open, setOpen] = useState(false)
  const isToday = value === TODAY
  const resolved = isToday ? today : value

  return (
    <FormField label={label}>
      {(control) => (
        <div className={cn('flex items-center gap-1', className)}>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              id={control.id}
              aria-invalid={control['aria-invalid']}
              aria-describedby={control['aria-describedby']}
              render={
                <Button type="button" variant="outline" className="justify-start gap-2 font-normal grow">
                  <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                  {resolved ? formatISODate(resolved) : 'Selecionar data'}
                </Button>
              }
            />
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                locale={ptBR}
                selected={resolved ? isoToLocalDate(resolved) : undefined}
                onSelect={(date) => {
                  onChange(date ? localDateToISO(date) : null)
                  setOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
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

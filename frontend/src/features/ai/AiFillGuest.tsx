import { useState } from 'react'

import { FormField } from '@/components/common'
import { Button, Textarea } from '@/components/ui'

import { useAiStatus, useParseGuestText } from './hooks'
import type { ParsedGuestFields } from './types'

export interface AiFillGuestProps {
  onFilled: (fields: ParsedGuestFields) => void
}

export function AiFillGuest({ onFilled }: AiFillGuestProps) {
  const status = useAiStatus()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const parse = useParseGuestText({
    onSuccess: (fields) => {
      onFilled(fields)
      setOpen(false)
      setText('')
    },
  })

  if (!status.data?.enabled) return null

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Preencher com IA
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 ring-inset">
      <FormField label="Texto livre">
        {(control) => (
          <Textarea
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="hóspede Ana Souza cpf 123.456.789-01 cel (21) 98888-7777"
            {...control}
          />
        )}
      </FormField>
      <p className="text-xs text-slate-500">
        O texto é enviado a um provedor externo (Anthropic) para extração dos campos. Nada é salvo
        por aqui: revise nome, documento e telefone antes de cadastrar.
      </p>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false)
            setText('')
          }}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={parse.isPending || text.trim().length === 0}
          onClick={() => parse.mutate(text.trim())}
        >
          {parse.isPending ? 'Extraindo…' : 'Extrair campos'}
        </Button>
      </div>
    </div>
  )
}

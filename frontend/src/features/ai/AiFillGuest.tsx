import { useId, useState } from 'react'

import { Button } from '@/components/ui/Button'

import { useAiStatus, useParseGuestText } from './hooks'
import type { ParsedGuestFields } from './types'

/**
 * Preenchimento do cadastro por IA (SPEC 7.1) — o unico ponto de contato da
 * feature com a UI.
 *
 * Portao de fallback (SPEC 7.2): enquanto `/api/ai/status/` nao responder
 * `enabled: true` este componente **renderiza nada**. Sem chave, sem backend
 * de IA, com a rota fora do ar — em todos os casos o formulario segue igual ao
 * que sempre foi, e nenhum estado de erro aparece para o atendente.
 *
 * Human-in-the-loop: a extracao apenas preenche os campos; quem salva e o
 * atendente, depois de revisar. Por isso o aviso de provedor externo fica
 * junto do botao que dispara o envio, e nao escondido na documentacao.
 */

export interface AiFillGuestProps {
  onFilled: (fields: ParsedGuestFields) => void
}

export function AiFillGuest({ onFilled }: AiFillGuestProps) {
  const status = useAiStatus()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const textareaId = useId()

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
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Preencher com IA
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 ring-inset">
      <label htmlFor={textareaId} className="text-sm font-medium text-slate-800">
        Texto livre
      </label>
      <textarea
        id={textareaId}
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="hóspede Ana Souza cpf 123.456.789-01 cel (21) 98888-7777"
        className="rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-500 focus:-outline-offset-2 focus:outline-2 focus:outline-slate-900"
      />
      <p className="text-xs text-slate-500">
        O texto é enviado a um provedor externo (Anthropic) para extração dos campos. Nada é
        salvo por aqui: revise nome, documento e telefone antes de cadastrar.
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

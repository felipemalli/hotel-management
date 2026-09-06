import { ArrowUp } from 'lucide-react'
import { useState } from 'react'

import { Button, Input, Typography } from '@/components/ui'

export interface IrisAskCardProps {
  suggestions: readonly string[]
  pending: boolean
  onAsk: (question: string) => void
}

export function IrisAskCard({ suggestions, pending, onAsk }: IrisAskCardProps) {
  const [question, setQuestion] = useState('')
  const empty = question.trim().length === 0

  function submit() {
    if (empty || pending) return
    onAsk(question.trim())
    setQuestion('')
  }

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4.5 shadow-sm">
      <div className="flex gap-2.5">
        {/* `FormField` exige rótulo visível, e o desenho não tem um: daí o aria-label. */}
        <Input
          aria-label="Pergunte à Íris"
          className="h-9 flex-1 px-3"
          placeholder="Pergunte algo sobre o hotel…"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
        />
        <Button size="lg" className="px-4" disabled={empty || pending} onClick={submit}>
          <ArrowUp aria-hidden="true" />
          {pending ? 'Consultando…' : 'Perguntar'}
        </Button>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Typography as="span" variant="mono" tone="mutedLight" className="tracking-widest">
          SUGESTÕES
        </Typography>
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={pending}
            onClick={() => onAsk(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  )
}

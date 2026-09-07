import { useState } from 'react'

import { EmptyState, PageHeader } from '@/components/common'
import { IrisAnswer } from '@/features/ai/components/IrisAnswer'
import { IrisAskCard } from '@/features/ai/components/IrisAskCard'
import { IrisEmptyState } from '@/features/ai/components/IrisEmptyState'
import { useAiStatus, useCopilot } from '@/features/ai/hooks'
import { IRIS_SUGGESTIONS } from '@/features/ai/suggestions'
import { CheckoutStatementDialog } from '@/features/reservations/components/CheckoutStatementDialog'
import type { CheckoutStatement } from '@/features/reservations/types'

import { IrisAction } from './IrisAction'

const TITLE_ID = 'iris-title'

const DESCRIPTION = 'Copiloto de dados do hotel. Pergunte em linguagem natural.'

const DISABLED = 'A Íris está desligada neste servidor: configure OPENAI_API_KEY para ativá-la.'

export function IrisPage() {
  const status = useAiStatus()
  const ask = useCopilot()

  const [asked, setAsked] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [statement, setStatement] = useState<CheckoutStatement | null>(null)

  const enabled = status.data?.enabled === true
  const answer = ask.data
  const action = done === null ? (answer?.proposed_action ?? null) : null

  function send(question: string) {
    setDone(null)
    setAsked(question)
    ask.mutate(question)
  }

  return (
    <section aria-labelledby={TITLE_ID} className="flex flex-col gap-4.5">
      <PageHeader titleId={TITLE_ID} title="Íris" description={DESCRIPTION} />

      {enabled ? (
        <div className="flex max-w-[840px] flex-col gap-4.5">
          <IrisAskCard suggestions={IRIS_SUGGESTIONS} pending={ask.isPending} onAsk={send} />

          {answer === undefined || asked === null ? (
            <IrisEmptyState />
          ) : (
            <IrisAnswer
              question={asked}
              reply={answer.reply}
              action={
                action === null ? undefined : (
                  <IrisAction action={action} onDone={setDone} onStatement={setStatement} />
                )
              }
              done={done ?? undefined}
            />
          )}
        </div>
      ) : null}

      {!enabled && !status.isPending ? <EmptyState message={DISABLED} /> : null}

      {statement === null ? null : (
        <CheckoutStatementDialog
          open
          allowPayment
          statement={statement}
          onClose={() => setStatement(null)}
        />
      )}
    </section>
  )
}

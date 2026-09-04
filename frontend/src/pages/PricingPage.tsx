import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button, Dialog, ErrorState, TableSkeleton } from '@/components/ui'
import { useIsAdmin } from '@/features/auth/hooks'
import { CurrentPolicyCard } from '@/features/pricing/CurrentPolicyCard'
import { useCurrentPolicy } from '@/features/pricing/hooks'
import { PolicyForm } from '@/features/pricing/PolicyForm'
import { PolicyHistoryTable } from '@/features/pricing/PolicyHistoryTable'
import { formatISODateTime } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { pageFromSearchParams, withPage } from '@/lib/pagination'
import { notifySuccess } from '@/lib/toast'

export function PricingPage() {
  const isAdmin = useIsAdmin()
  const [searchParams, setSearchParams] = useSearchParams()
  const [publishing, setPublishing] = useState(false)

  const page = pageFromSearchParams(searchParams)
  const current = useCurrentPolicy()

  return (
    <section aria-labelledby="tarifas-titulo" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="tarifas-titulo" className="text-xl font-semibold text-slate-900">
          Tarifas
        </h2>
        {isAdmin && current.data ? (
          <Button onClick={() => setPublishing(true)}>Publicar nova tarifa</Button>
        ) : null}
      </div>

      <p className="text-sm text-slate-600">
        A tarifa é amarrada à estadia no check-in: publicar uma nova muda o futuro e nunca o extrato
        de quem já entrou.
      </p>

      <section aria-labelledby="tarifa-vigente" className="flex flex-col gap-2">
        <h3 id="tarifa-vigente" className="text-base font-semibold text-slate-900">
          Tarifa vigente
        </h3>
        {current.isPending ? (
          <TableSkeleton rows={4} columns={2} />
        ) : current.isError ? (
          <ErrorState
            message={errorMessage(current.error)}
            onRetry={() => void current.refetch()}
          />
        ) : (
          <CurrentPolicyCard policy={current.data} />
        )}
      </section>

      <section aria-labelledby="historico-tarifas" className="flex flex-col gap-2">
        <h3 id="historico-tarifas" className="text-base font-semibold text-slate-900">
          Histórico
        </h3>
        <PolicyHistoryTable
          page={page}
          currentId={current.data?.id}
          onPageChange={(next) => setSearchParams((previous) => withPage(previous, next))}
        />
      </section>

      {publishing && current.data ? (
        <Dialog
          open
          size="lg"
          title="Publicar nova tarifa"
          description="Os campos vêm com a tarifa vigente; altere o que muda."
          onClose={() => setPublishing(false)}
        >
          <PolicyForm
            current={current.data}
            onCancel={() => setPublishing(false)}
            onSuccess={(policy) => {
              setPublishing(false)
              notifySuccess(
                `Tarifa publicada — vigente desde ${formatISODateTime(policy.effective_from)}.`,
              )
            }}
          />
        </Dialog>
      ) : null}
    </section>
  )
}

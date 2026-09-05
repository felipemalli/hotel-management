import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ErrorState, PageHeader } from '@/components/common'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Typography,
} from '@/components/ui'
import { useIsAdmin } from '@/features/auth/hooks'
import { PolicyHistoryTable } from '@/features/pricing/components/PolicyHistoryTable'
import { CurrentPolicyCard } from '@/features/pricing/CurrentPolicyCard'
import { CurrentPolicyCardSkeleton } from '@/features/pricing/CurrentPolicyCardSkeleton'
import { useCurrentPolicy } from '@/features/pricing/hooks'
import { PolicyForm } from '@/features/pricing/PolicyForm'
import { errorMessage } from '@/lib/errors/errors'
import { formatISODateTime } from '@/lib/format/dates'
import { notifySuccess } from '@/lib/notify/toast'
import { pageFromSearchParams, withPage } from '@/lib/routing/pagination'

export function PricingPage() {
  const isAdmin = useIsAdmin()
  const [searchParams, setSearchParams] = useSearchParams()
  const [publishing, setPublishing] = useState(false)

  const page = pageFromSearchParams(searchParams)
  const current = useCurrentPolicy()

  return (
    <section aria-labelledby="tarifas-titulo" className="flex flex-col gap-6">
      <PageHeader
        title="Tarifas"
        titleId="tarifas-titulo"
        breadcrumb="Hotel Vila Marés"
        description="A tarifa é amarrada à estadia no check-in: publicar uma nova muda o futuro e nunca o extrato de quem já entrou."
        actions={
          isAdmin && current.data ? (
            <Button onClick={() => setPublishing(true)}>
              <PlusIcon className="size-4" aria-hidden="true" />
              Publicar nova tarifa
            </Button>
          ) : null
        }
      />

      <section aria-labelledby="tarifa-vigente" className="flex flex-col gap-2">
        <Typography as="h3" id="tarifa-vigente" variant="sectionTitle">
          Tarifa vigente
        </Typography>
        {current.isPending ? (
          <CurrentPolicyCardSkeleton />
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
        <Typography as="h3" id="historico-tarifas" variant="sectionTitle">
          Histórico
        </Typography>
        <PolicyHistoryTable
          page={page}
          currentId={current.data?.id}
          onPageChange={(next) => setSearchParams((previous) => withPage(previous, next))}
        />
      </section>

      {publishing && current.data ? (
        <Dialog open onOpenChange={(next) => (next ? undefined : setPublishing(false))}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Publicar nova tarifa</DialogTitle>
              <DialogDescription>
                Os campos vêm com a tarifa vigente; altere o que muda.
              </DialogDescription>
            </DialogHeader>
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
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  )
}

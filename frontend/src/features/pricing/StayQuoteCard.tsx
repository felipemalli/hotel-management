import { ErrorState } from '@/components/common'
import { Typography } from '@/components/ui'
import { errorMessage } from '@/lib/errors/errors'
import { formatBRL } from '@/lib/format/money'

import { StayQuoteCardSkeleton } from './StayQuoteCardSkeleton'
import type { StayQuote } from './types'

const ZERO_MONEY = '0.00'

const BUCKET_RANGE = {
  weekday: 'seg–sex',
  weekend: 'sáb–dom',
} as const

export interface StayQuoteCardProps {
  quote: StayQuote | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  enabled: boolean
  onRetry: () => void
}

export function StayQuoteCard({
  quote,
  isPending,
  isError,
  error,
  enabled,
  onRetry,
}: StayQuoteCardProps) {
  return (
    <aside
      aria-labelledby="valor-estimado-titulo"
      className="overflow-hidden rounded-[10px] border border-border bg-muted/40"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border bg-background px-4 py-3">
        <Typography as="h3" id="valor-estimado-titulo" variant="cardTitle">
          Valor estimado
        </Typography>
        <Typography as="span" variant="body" tone="muted">
          {quote === undefined ? '—' : nightsLabel(quote.nights)}
        </Typography>
      </div>
      {body()}
    </aside>
  )

  function body() {
    if (!enabled) {
      return (
        <Typography as="p" variant="body" tone="muted" className="px-4 py-10 text-center">
          Informe entrada e saída válidas para ver o valor estimado.
        </Typography>
      )
    }
    if (isPending && quote === undefined) return <StayQuoteCardSkeleton />
    if (isError && quote === undefined) {
      return <ErrorState message={errorMessage(error)} onRetry={onRetry} />
    }
    if (quote === undefined) return null
    return <QuoteBreakdown quote={quote} />
  }
}

function QuoteBreakdown({ quote }: { quote: StayQuote }) {
  return (
    <div>
      <table className="w-full table-fixed">
        <caption className="sr-only">Composição do valor estimado</caption>
        <colgroup>
          <col />
          <col className="w-[7rem]" />
          <col className="w-[7rem]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-background">
            <th scope="col" className="px-4 py-2.5 text-left">
              <Typography as="span" variant="overline">
                Noites
              </Typography>
            </th>
            <th scope="col" className="px-3 py-2.5 text-right">
              <Typography as="span" variant="overline">
                Diária
              </Typography>
            </th>
            <th scope="col" className="px-3 py-2.5 text-right">
              <Typography as="span" variant="overline">
                Vaga
              </Typography>
            </th>
          </tr>
        </thead>
        <tbody>
          {quote.buckets.map((bucket) => {
            const parkingIsZero = bucket.parking_fee === ZERO_MONEY
            return (
              <tr key={bucket.kind} className="border-b border-border/60 bg-background">
                <th scope="row" className="min-w-0 px-4 py-2.5 text-left font-normal">
                  <Typography as="p" variant="body">
                    {bucket.nights}x {BUCKET_RANGE[bucket.kind]}
                  </Typography>
                  <Typography as="p" variant="caption">
                    {bucketDetail(bucket.nights, bucket.daily_rate, bucket.parking_fee)}
                  </Typography>
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <Typography as="span" variant="mono">
                    {formatBRL(bucket.subtotal_daily)}
                  </Typography>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <Typography as="span" variant="mono" tone={parkingIsZero ? 'muted' : 'default'}>
                    {formatBRL(bucket.subtotal_parking)}
                  </Typography>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex flex-col gap-2 px-4 py-3.5">
        <SummaryRow label="Diárias" value={formatBRL(quote.subtotal_daily)} />
        <SummaryRow
          label="Estacionamento"
          value={formatBRL(quote.subtotal_parking)}
          muted={quote.subtotal_parking === ZERO_MONEY}
        />
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
          <Typography as="span" variant="cardTitle">
            Total estimado
          </Typography>
          <Typography
            as="span"
            variant="title"
            className="font-mono tracking-tight"
            aria-live="polite"
            aria-label={`Total estimado ${formatBRL(quote.total)}`}
          >
            {formatBRL(quote.total)}
          </Typography>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Typography as="span" variant="body" tone="muted">
        {label}
      </Typography>
      <Typography as="span" variant="mono" tone={muted ? 'muted' : 'default'}>
        {value}
      </Typography>
    </div>
  )
}

function nightsLabel(nights: number): string {
  return nights === 1 ? '1 noite' : `${nights} noites`
}

function bucketDetail(nights: number, dailyRate: string, parkingFee: string): string {
  const daily = `${nights} × ${formatBRL(dailyRate)}`
  if (parkingFee === ZERO_MONEY) return daily
  return `${daily} + ${formatBRL(parkingFee)}`
}

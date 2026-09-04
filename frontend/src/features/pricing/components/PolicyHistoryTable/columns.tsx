import { createColumnHelper } from '@tanstack/react-table'

import { type DataTableColumns, type dataTableFeatures } from '@/components/common'
import { Badge, Typography } from '@/components/ui'
import type { PricingPolicy } from '@/features/pricing/types'
import { formatISODateTime } from '@/lib/format/dates'
import { formatBRL, formatDecimalBR } from '@/lib/format/money'

const helper = createColumnHelper<typeof dataTableFeatures, PricingPolicy>()

export function buildPolicyColumns(currentId?: number): DataTableColumns<PricingPolicy> {
  return helper.columns([
    helper.display({
      id: 'effective_from',
      header: 'Vigência desde',
      cell: ({ row }) => {
        const policy = row.original
        return (
          <span className="flex flex-wrap items-center gap-2 whitespace-nowrap">
            <Typography as="span" variant="caption">
              {policy.created_by === null
                ? 'implantação'
                : formatISODateTime(policy.effective_from)}
            </Typography>
            {policy.id === currentId ? <Badge variant="success">Vigente</Badge> : null}
          </span>
        )
      },
    }),
    helper.display({
      id: 'daily_rates',
      header: 'Diárias (útil / fds)',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatBRL(row.original.weekday_rate)} / {formatBRL(row.original.weekend_rate)}
        </span>
      ),
    }),
    helper.display({
      id: 'parking_rates',
      header: 'Vagas (útil / fds)',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatBRL(row.original.weekday_park)} / {formatBRL(row.original.weekend_park)}
        </span>
      ),
    }),
    helper.accessor('late_fee_factor', {
      header: 'Fator da multa',
      cell: ({ getValue }) => formatDecimalBR(getValue()),
    }),
    helper.display({
      id: 'hours',
      header: 'Check-in / checkout',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.checkin_opens} / {row.original.checkout_limit}
        </span>
      ),
    }),
    helper.display({
      id: 'created_by',
      header: 'Publicada por',
      cell: ({ row }) => row.original.created_by?.username ?? 'sistema',
    }),
  ])
}

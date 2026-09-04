import { EmptyState, ErrorState, Pagination, TableSkeleton } from '@/components/common'
import { Badge, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { errorMessage } from '@/lib/errors/errors'
import { formatISODateTime } from '@/lib/format/dates'
import { formatBRL, formatDecimalBR } from '@/lib/format/money'

import { usePolicies } from './hooks'

const HEADERS = [
  'Vigência desde',
  'Diárias (útil / fds)',
  'Vagas (útil / fds)',
  'Fator da multa',
  'Check-in / checkout',
  'Publicada por',
]

export interface PolicyHistoryTableProps {
  page: number
  currentId?: number
  onPageChange: (page: number) => void
}

export function PolicyHistoryTable({ page, currentId, onPageChange }: PolicyHistoryTableProps) {
  const query = usePolicies(page)

  if (query.isPending) return <TableSkeleton columns={HEADERS.length} />

  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  }

  if (query.data.results.length === 0) {
    return <EmptyState message="Nenhuma tarifa publicada" />
  }

  return (
    <div className="flex flex-col gap-4">
      <Table caption="Histórico de tarifas">
        <THead>
          <TR>
            {HEADERS.map((header) => (
              <TH key={header}>{header}</TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {query.data.results.map((policy) => (
            <TR key={policy.id}>
              <TD className="text-xs whitespace-nowrap">
                {policy.created_by === null
                  ? 'implantação'
                  : formatISODateTime(policy.effective_from)}{' '}
                {policy.id === currentId ? <Badge variant="success">Vigente</Badge> : null}
              </TD>
              <TD className="whitespace-nowrap">
                {formatBRL(policy.weekday_rate)} / {formatBRL(policy.weekend_rate)}
              </TD>
              <TD className="whitespace-nowrap">
                {formatBRL(policy.weekday_park)} / {formatBRL(policy.weekend_park)}
              </TD>
              <TD>{formatDecimalBR(policy.late_fee_factor)}</TD>
              <TD className="whitespace-nowrap">
                {policy.checkin_opens} / {policy.checkout_limit}
              </TD>
              <TD>{policy.created_by?.username ?? 'sistema'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Pagination
        page={page}
        count={query.data.count}
        hasNext={query.data.next !== null}
        hasPrevious={query.data.previous !== null}
        onPageChange={onPageChange}
      />
    </div>
  )
}

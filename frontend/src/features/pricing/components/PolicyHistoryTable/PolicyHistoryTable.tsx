import { useMemo } from 'react'

import { DataTable, ErrorState } from '@/components/common'
import { usePolicies } from '@/features/pricing/hooks'
import { errorMessage } from '@/lib/errors/errors'

import { buildPolicyColumns } from './columns'

export interface PolicyHistoryTableProps {
  page: number
  currentId?: number
  onPageChange: (page: number) => void
}

export function PolicyHistoryTable({ page, currentId, onPageChange }: PolicyHistoryTableProps) {
  const query = usePolicies(page)
  const columns = useMemo(() => buildPolicyColumns(currentId), [currentId])

  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  }

  const results = query.data?.results ?? []

  return (
    <DataTable
      columns={columns}
      data={results}
      caption="Histórico de tarifas"
      getRowId={(policy) => `policy-${policy.id}`}
      isLoading={query.isPending}
      emptyMessage="Nenhuma tarifa publicada"
      pagination={
        query.isSuccess && results.length > 0
          ? {
              page,
              count: query.data.count,
              hasNext: query.data.next !== null,
              hasPrevious: query.data.previous !== null,
              onPageChange,
            }
          : undefined
      }
    />
  )
}

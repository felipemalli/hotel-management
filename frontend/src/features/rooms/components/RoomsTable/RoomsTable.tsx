import type { ReactNode } from 'react'

import { DataTable, ErrorState } from '@/components/common'
import { useRooms } from '@/features/rooms/hooks'
import type { Room } from '@/features/rooms/types'
import { errorMessage } from '@/lib/errors/errors'

import { roomColumns } from './columns'

export interface RoomsTableProps {
  includeInactive: boolean
  page: number
  search?: string
  onPageChange: (page: number) => void
  renderActions?: (room: Room) => ReactNode
}

export function RoomsTable({
  includeInactive,
  page,
  search = '',
  onPageChange,
  renderActions,
}: RoomsTableProps) {
  const query = useRooms({ includeInactive, page, search })

  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  }

  const results = query.data?.results ?? []
  const emptyMessage = search.trim()
    ? 'Nenhum quarto encontrado.'
    : includeInactive
      ? 'Nenhum quarto cadastrado'
      : 'Nenhum quarto em operação'

  return (
    <DataTable
      columns={roomColumns(renderActions)}
      data={results}
      caption="Quartos do hotel"
      getRowId={(room) => `room-${room.id}`}
      isLoading={query.isPending}
      emptyMessage={emptyMessage}
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

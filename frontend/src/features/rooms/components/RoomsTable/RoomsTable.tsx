import type { ReactNode } from 'react'

import { DataTable, ErrorState, Pagination } from '@/components/common'
import { useRooms } from '@/features/rooms/hooks'
import type { Room } from '@/features/rooms/types'
import { errorMessage } from '@/lib/errors/errors'

import { roomColumns } from './columns'

export interface RoomsTableProps {
  includeInactive: boolean
  page: number
  onPageChange: (page: number) => void
  renderActions?: (room: Room) => ReactNode
}

export function RoomsTable({
  includeInactive,
  page,
  onPageChange,
  renderActions,
}: RoomsTableProps) {
  const query = useRooms({ includeInactive, page })

  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  }

  const results = query.data?.results ?? []

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={roomColumns(renderActions)}
        data={results}
        caption="Quartos do hotel"
        getRowId={(room) => `room-${room.id}`}
        isLoading={query.isPending}
        emptyMessage={includeInactive ? 'Nenhum quarto cadastrado' : 'Nenhum quarto em operação'}
      />
      {query.isSuccess && results.length > 0 ? (
        <Pagination
          page={page}
          count={query.data.count}
          hasNext={query.data.next !== null}
          hasPrevious={query.data.previous !== null}
          onPageChange={onPageChange}
        />
      ) : null}
    </div>
  )
}

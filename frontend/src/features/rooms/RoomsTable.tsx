import type { ReactNode } from 'react'

import { EmptyState, ErrorState, Pagination, TableSkeleton } from '@/components/common'
import { Badge, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { errorMessage } from '@/lib/errors/errors'
import { formatISODateTime } from '@/lib/format/dates'

import { useRooms } from './hooks'
import type { Room } from './types'

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
  const headers = [
    'Número',
    'Capacidade',
    'Situação',
    'Cadastro',
    ...(renderActions ? ['Ações'] : []),
  ]

  if (query.isPending) return <TableSkeleton columns={headers.length} />

  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  }

  if (query.data.results.length === 0) {
    return (
      <EmptyState
        message={includeInactive ? 'Nenhum quarto cadastrado' : 'Nenhum quarto em operação'}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Table caption="Quartos do hotel">
        <THead>
          <TR>
            {headers.map((header) => (
              <TH key={header}>{header}</TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {query.data.results.map((room) => (
            <TR key={room.id}>
              <TD className="font-mono text-sm font-medium text-slate-900">{room.number}</TD>
              <TD>{room.capacity === 1 ? '1 pessoa' : `${room.capacity} pessoas`}</TD>
              <TD>
                <Badge variant={room.is_active ? 'success' : 'secondary'}>
                  {room.is_active ? 'Ativo' : 'Desativado'}
                </Badge>
              </TD>
              <TD className="text-xs text-slate-500">{formatISODateTime(room.created_at)}</TD>
              {renderActions ? <TD>{renderActions(room)}</TD> : null}
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

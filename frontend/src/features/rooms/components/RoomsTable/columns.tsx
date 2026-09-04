import { createColumnHelper } from '@tanstack/react-table'
import type { ReactNode } from 'react'

import { type DataTableColumns, type dataTableFeatures } from '@/components/common'
import { Badge, Typography } from '@/components/ui'
import type { Room } from '@/features/rooms/types'
import { formatISODateTime } from '@/lib/format/dates'

const helper = createColumnHelper<typeof dataTableFeatures, Room>()

// A coluna "Ações" só existe quando o atendente (não-admin) não recebe
// `renderActions`: ver ele para o botão de admin, não para uma coluna vazia.
export function roomColumns(renderActions?: (room: Room) => ReactNode): DataTableColumns<Room> {
  return helper.columns([
    helper.accessor('number', {
      header: 'Número',
      cell: ({ getValue }) => (
        <Typography as="span" variant="mono" weight="medium">
          {getValue()}
        </Typography>
      ),
    }),
    helper.accessor('capacity', {
      header: 'Capacidade',
      cell: ({ getValue }) => {
        const capacity = getValue()
        return capacity === 1 ? '1 pessoa' : `${capacity} pessoas`
      },
    }),
    helper.accessor('is_active', {
      header: 'Situação',
      cell: ({ getValue }) => (
        <Badge variant={getValue() ? 'success' : 'secondary'}>
          {getValue() ? 'Ativo' : 'Desativado'}
        </Badge>
      ),
    }),
    helper.accessor('created_at', {
      header: 'Cadastro',
      cell: ({ getValue }) => (
        <Typography as="span" variant="caption">
          {formatISODateTime(getValue())}
        </Typography>
      ),
    }),
    ...(renderActions
      ? [
          helper.display({
            id: 'actions',
            header: 'Ações',
            cell: ({ row }) => renderActions(row.original),
          }),
        ]
      : []),
  ])
}

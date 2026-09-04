import type { RowData } from '@tanstack/react-table'
import { useTable } from '@tanstack/react-table'
import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

import { EmptyState } from '../EmptyState'
import { DataTableSkeleton } from './DataTableSkeleton'
import type { DataTableColumns } from './features'
import { dataTableFeatures, EMPTY_ROWS } from './features'

export interface DataTableProps<Row extends RowData> {
  columns: DataTableColumns<Row>
  data: readonly Row[]
  // Landmark: diferencia as tabelas para quem navega por regiões.
  caption: string
  getRowId: (row: Row) => string
  isLoading?: boolean
  emptyMessage?: string
  rowProps?: (row: Row) => HTMLAttributes<HTMLTableRowElement> | undefined
}

export function DataTable<Row extends RowData>({
  columns,
  data,
  caption,
  getRowId,
  isLoading = false,
  emptyMessage = 'Nenhum resultado encontrado',
  rowProps,
}: DataTableProps<Row>) {
  // Modelos da tabela existem mesmo no esqueleto ou no vazio.
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: isLoading ? (EMPTY_ROWS as readonly Row[]) : data,
    getRowId,
  })

  if (isLoading) return <DataTableSkeleton columns={columns.length} />
  if (data.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full caption-bottom text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="[&_tr]:border-b [&_tr]:border-border">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta
                return (
                  <th
                    key={header.id}
                    scope="col"
                    className={cn(
                      'h-10 px-4 text-left align-middle font-medium text-muted-foreground',
                      meta?.align === 'end' && 'text-right',
                      meta?.headClassName,
                    )}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border last:border-0"
              {...rowProps?.(row.original)}
            >
              {row.getAllCells().map((cell) => {
                const meta = cell.column.columnDef.meta
                return (
                  <td
                    key={cell.id}
                    className={cn(
                      'px-4 py-3 align-middle',
                      meta?.align === 'end' && 'text-right',
                      meta?.cellClassName,
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import type { ColumnDef, RowData } from '@tanstack/react-table'
import { metaHelper, tableFeatures } from '@tanstack/react-table'

export interface DataTableColumnMeta {
  align?: 'start' | 'end'
  headClassName?: string
  cellClassName?: string
}

export const dataTableFeatures = tableFeatures({
  columnMeta: metaHelper<DataTableColumnMeta>(),
})

export type DataTableColumns<Row extends RowData> = readonly ColumnDef<
  typeof dataTableFeatures,
  Row
>[]

// Referência estável: lista nova a cada render invalidaria os modelos.
export const EMPTY_ROWS: readonly never[] = []

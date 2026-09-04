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

// Referência estável: uma lista nova a cada render invalidaria os modelos da
// tabela mesmo sem dado nenhum ter mudado.
export const EMPTY_ROWS: readonly never[] = []

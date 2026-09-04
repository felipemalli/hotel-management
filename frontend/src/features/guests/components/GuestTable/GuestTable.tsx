import type { UseQueryResult } from '@tanstack/react-query'
import type { RowData } from '@tanstack/react-table'
import { type ReactNode, useMemo, useState } from 'react'

import type { DataTableColumns } from '@/components/common'
import { DataTable, ErrorState, FormField, PageHeader, Pagination } from '@/components/common'
import { Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { useGuests, useGuestsInHotel, useGuestsPendingCheckin } from '@/features/guests/hooks'
import { errorMessage } from '@/lib/errors/errors'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from '@/lib/hooks/useDebouncedValue'

import { allColumns, inHotelColumns, pendingColumns } from './columns'
import {
  allRowId,
  GUEST_TAB_CAPTIONS,
  GUEST_TAB_EMPTY_MESSAGES,
  GUEST_TAB_ITEMS,
  type GuestAllRow,
  type GuestInHotelRow,
  type GuestPendingRow,
  type GuestTab,
  isGuestTab,
  partyRowId,
  toAllRows,
  toInHotelRows,
  toPendingRows,
} from './rows'

export type { GuestAllRow, GuestInHotelRow, GuestPendingRow, GuestTab }

export interface GuestTableRenderActions {
  all?: (row: GuestAllRow) => ReactNode
  inHotel?: (row: GuestInHotelRow) => ReactNode
  pending?: (row: GuestPendingRow) => ReactNode
}

export interface GuestTableProps {
  renderActions?: GuestTableRenderActions
  headerActions?: ReactNode
}

function resultAnnouncement(count: number): string {
  return count === 1 ? '1 resultado encontrado' : `${count} resultados encontrados`
}

interface GuestTabPanelProps<Row extends RowData> {
  query: Pick<UseQueryResult, 'isError' | 'isPending' | 'isSuccess' | 'error' | 'refetch'>
  rows: readonly Row[]
  columns: DataTableColumns<Row>
  caption: string
  emptyMessage: string
  getRowId: (row: Row) => string
  page: number
  count: number
  hasNext: boolean
  hasPrevious: boolean
  onPageChange: (page: number) => void
}

function GuestTabPanel<Row extends RowData>({
  query,
  rows,
  columns,
  caption,
  emptyMessage,
  getRowId,
  page,
  count,
  hasNext,
  hasPrevious,
  onPageChange,
}: GuestTabPanelProps<Row>) {
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        data={rows}
        caption={caption}
        getRowId={getRowId}
        isLoading={query.isPending}
        emptyMessage={emptyMessage}
      />
      {query.isSuccess && rows.length > 0 ? (
        <Pagination
          page={page}
          count={count}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          onPageChange={onPageChange}
        />
      ) : null}
    </div>
  )
}

export function GuestTable({ renderActions, headerActions }: GuestTableProps) {
  const [tab, setTab] = useState<GuestTab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)

  const all = useGuests(debouncedSearch, page, { enabled: tab === 'all' })
  const inHotel = useGuestsInHotel(page, { enabled: tab === 'in-hotel' })
  const pending = useGuestsPendingCheckin(page, { enabled: tab === 'pending-checkin' })

  const allRows = toAllRows(all.data)
  const inHotelRows = toInHotelRows(inHotel.data)
  const pendingRows = toPendingRows(pending.data)

  // Referência estável: senão a linha remonta debaixo do diálogo e perde o foco.
  const allTableColumns = useMemo(() => allColumns(renderActions?.all), [renderActions?.all])
  const inHotelTableColumns = useMemo(
    () => inHotelColumns(renderActions?.inHotel),
    [renderActions?.inHotel],
  )
  const pendingTableColumns = useMemo(
    () => pendingColumns(renderActions?.pending),
    [renderActions?.pending],
  )

  const query = tab === 'all' ? all : tab === 'in-hotel' ? inHotel : pending
  const rowCount =
    tab === 'all' ? allRows.length : tab === 'in-hotel' ? inHotelRows.length : pendingRows.length

  function changeTab(next: string) {
    if (!isGuestTab(next)) return
    setTab(next)
    setPage(1)
  }

  return (
    <Tabs value={tab} onValueChange={changeTab}>
      <PageHeader
        title="Recepção"
        titleId="recepcao-titulo"
        actions={headerActions}
        updating={query.isFetching && !query.isPending}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <TabsList aria-label="Listagens de hóspedes">
            {GUEST_TAB_ITEMS.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tab === 'all' ? (
            <div className="w-full sm:w-80">
              <FormField
                label="Buscar hóspede"
                hint="Nome, documento ou telefone — busca por fragmento."
              >
                {(control) => (
                  <Input
                    type="search"
                    placeholder="Nome, documento ou telefone"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setPage(1)
                    }}
                    {...control}
                  />
                )}
              </FormField>
            </div>
          ) : null}
        </div>
      </PageHeader>

      <p aria-live="polite" className="sr-only">
        {query.isSuccess && !query.isPlaceholderData ? resultAnnouncement(rowCount) : ''}
      </p>

      <TabsContent value="all">
        <GuestTabPanel
          query={all}
          rows={allRows}
          columns={allTableColumns}
          caption={GUEST_TAB_CAPTIONS.all}
          emptyMessage={GUEST_TAB_EMPTY_MESSAGES.all}
          getRowId={allRowId}
          page={page}
          count={all.data?.count ?? 0}
          hasNext={all.data?.next != null}
          hasPrevious={all.data?.previous != null}
          onPageChange={setPage}
        />
      </TabsContent>

      <TabsContent value="in-hotel">
        <GuestTabPanel
          query={inHotel}
          rows={inHotelRows}
          columns={inHotelTableColumns}
          caption={GUEST_TAB_CAPTIONS['in-hotel']}
          emptyMessage={GUEST_TAB_EMPTY_MESSAGES['in-hotel']}
          getRowId={partyRowId}
          page={page}
          count={inHotel.data?.count ?? 0}
          hasNext={inHotel.data?.next != null}
          hasPrevious={inHotel.data?.previous != null}
          onPageChange={setPage}
        />
      </TabsContent>

      <TabsContent value="pending-checkin">
        <GuestTabPanel
          query={pending}
          rows={pendingRows}
          columns={pendingTableColumns}
          caption={GUEST_TAB_CAPTIONS['pending-checkin']}
          emptyMessage={GUEST_TAB_EMPTY_MESSAGES['pending-checkin']}
          getRowId={partyRowId}
          page={page}
          count={pending.data?.count ?? 0}
          hasNext={pending.data?.next != null}
          hasPrevious={pending.data?.previous != null}
          onPageChange={setPage}
        />
      </TabsContent>
    </Tabs>
  )
}

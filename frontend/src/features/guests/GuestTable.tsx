import { type ReactNode, useState } from 'react'

import {
  EmptyState,
  ErrorState,
  Pagination,
  tabId,
  Table,
  TableSkeleton,
  tabPanelId,
  TBody,
  TH,
  THead,
  TR,
} from '@/components/ui'
import { errorMessage } from '@/lib/errors'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

import { GuestRowCells } from './components/GuestTableRows'
import { GuestTableToolbar } from './components/GuestTableToolbar'
import { useGuests, useGuestsInHotel, useGuestsPendingCheckin } from './hooks'
import {
  DEBOUNCE_MS,
  GUEST_TAB_CONFIG,
  type GuestRow,
  guestRowKey,
  type GuestTab,
  toGuestRows,
} from './tabs'

export interface GuestTableProps {
  renderActions?: (row: GuestRow) => ReactNode
}

export function GuestTable({ renderActions }: GuestTableProps) {
  const [tab, setTab] = useState<GuestTab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search, DEBOUNCE_MS)

  const all = useGuests(debouncedSearch, page, { enabled: tab === 'all' })
  const inHotel = useGuestsInHotel(page, { enabled: tab === 'in-hotel' })
  const pending = useGuestsPendingCheckin(page, { enabled: tab === 'pending-checkin' })

  const query = tab === 'all' ? all : tab === 'in-hotel' ? inHotel : pending
  const config = GUEST_TAB_CONFIG[tab]
  const rows = toGuestRows(tab, {
    all: all.data,
    'in-hotel': inHotel.data,
    'pending-checkin': pending.data,
  })

  return (
    <section className="flex flex-col gap-4">
      <GuestTableToolbar
        tab={tab}
        // Recorte novo, primeira página: a página 3 da busca anterior não
        // significa nada na próxima. Nos handlers, e não num efeito, porque o
        // gatilho é a ação do atendente e não a mudança de estado.
        onTabChange={(next) => {
          setTab(next)
          setPage(1)
        }}
        search={search}
        onSearchChange={(next) => {
          setSearch(next)
          setPage(1)
        }}
        updating={query.isFetching && !query.isPending}
      />

      <div id={tabPanelId(tab)} role="tabpanel" aria-labelledby={tabId(tab)}>
        <p aria-live="polite" className="sr-only">
          {query.isSuccess && !query.isPlaceholderData ? resultAnnouncement(rows.length) : ''}
        </p>

        {query.isPending ? (
          <TableSkeleton columns={config.headers.length} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState message={config.emptyMessage} />
        ) : (
          <Table caption={config.caption}>
            <THead>
              <TR>
                {config.headers.map((header) => (
                  <TH key={header}>{header}</TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={guestRowKey(row)}>
                  <GuestRowCells row={row} renderActions={renderActions} />
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        {query.isSuccess && rows.length > 0 ? (
          <Pagination
            page={page}
            count={query.data.count}
            hasNext={query.data.next !== null}
            hasPrevious={query.data.previous !== null}
            onPageChange={setPage}
          />
        ) : null}
      </div>
    </section>
  )
}

function resultAnnouncement(count: number): string {
  return count === 1 ? '1 resultado encontrado' : `${count} resultados encontrados`
}

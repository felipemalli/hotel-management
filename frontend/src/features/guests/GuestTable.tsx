import { useState, type ReactNode } from 'react'

import { Input } from '@/components/ui/Input'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { tabId, tabPanelId } from '@/components/ui/tabIds'
import type { Paginated } from '@/lib/apiClient'
import { formatISODate, formatISODateTime } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

import { useGuests, useGuestsInHotel, useGuestsPendingCheckin } from './hooks'
import type { Guest, GuestInHotel, GuestPendingCheckin, ReservationSummary } from './types'

/**
 * F1 (SPEC 5.3) — tabela com busca dinamica e abas.
 *
 * Cada aba e um endpoint distinto da SPEC 4.3 e, portanto, uma query key
 * distinta (SPEC 5.2). A aba inativa nao busca (`enabled`).
 *
 * A busca de fragmento (RF3) so existe na aba "Todos": o contrato nao expoe
 * `?search=` em `in-hotel`/`pending-checkin`, e filtrar no cliente seria
 * inventar um segundo criterio de busca fora do servidor.
 *
 * As acoes por linha entram por `renderActions` em vez de serem importadas
 * daqui: o estado do hospede vem do endpoint da aba, e essa inversao mantem a
 * tabela independente da feature de reservas.
 */

export const DEBOUNCE_MS = 300

export const GUEST_TABS = [
  { id: 'todos', label: 'Todos' },
  { id: 'in-hotel', label: 'No hotel' },
  { id: 'pending-checkin', label: 'Check-in pendente' },
] as const

export type GuestTab = (typeof GUEST_TABS)[number]['id']

export type GuestRow =
  | { tab: 'todos'; guest: Guest }
  | { tab: 'in-hotel'; guest: GuestInHotel; reservation: ReservationSummary }
  | { tab: 'pending-checkin'; guest: GuestPendingCheckin; reservation: ReservationSummary }

export interface GuestTableProps {
  renderActions?: (row: GuestRow) => ReactNode
}

const EMPTY_MESSAGE: Record<GuestTab, string> = {
  todos: 'Nenhum hóspede encontrado',
  'in-hotel': 'Nenhum hóspede no hotel',
  'pending-checkin': 'Nenhuma reserva aguardando check-in',
}

/** O skeleton imita a largura real da aba, para a tabela nao "pular" ao chegar. */
const SKELETON_COLUMNS: Record<GuestTab, number> = {
  todos: 5,
  'in-hotel': 7,
  'pending-checkin': 6,
}

function PiiCells({ guest }: { guest: Guest }) {
  return (
    <>
      <TD className="font-medium text-slate-900">{guest.full_name}</TD>
      <TD className="font-mono text-xs">{guest.document}</TD>
      <TD className="font-mono text-xs">{guest.phone}</TD>
    </>
  )
}

function Stay({ reservation }: { reservation: ReservationSummary }) {
  return (
    <span className="whitespace-nowrap">
      {formatISODate(reservation.checkin_date)} → {formatISODate(reservation.checkout_date)}
    </span>
  )
}

function VehicleCell({ reservation }: { reservation: ReservationSummary }) {
  return <TD>{reservation.has_vehicle ? 'Sim' : 'Não'}</TD>
}

function TodosTable({
  data,
  renderActions,
}: {
  data: Paginated<Guest> | undefined
  renderActions?: (row: GuestRow) => ReactNode
}) {
  if (!data || data.results.length === 0) return <EmptyState message={EMPTY_MESSAGE.todos} />

  return (
    <Table caption="Todos os hóspedes cadastrados">
      <THead>
        <TR>
          <TH>Nome</TH>
          <TH>Documento</TH>
          <TH>Telefone</TH>
          <TH>Cadastro</TH>
          <TH>Ações</TH>
        </TR>
      </THead>
      <TBody>
        {data.results.map((guest) => (
          <tr key={guest.id}>
            <PiiCells guest={guest} />
            <TD className="text-xs text-slate-500">{formatISODateTime(guest.created_at)}</TD>
            <TD>{renderActions?.({ tab: 'todos', guest })}</TD>
          </tr>
        ))}
      </TBody>
    </Table>
  )
}

function InHotelTable({
  data,
  renderActions,
}: {
  data: Paginated<GuestInHotel> | undefined
  renderActions?: (row: GuestRow) => ReactNode
}) {
  if (!data || data.results.length === 0) {
    return <EmptyState message={EMPTY_MESSAGE['in-hotel']} />
  }

  return (
    <Table caption="Hóspedes no hotel">
      <THead>
        <TR>
          <TH>Nome</TH>
          <TH>Documento</TH>
          <TH>Telefone</TH>
          <TH>Estadia</TH>
          <TH>Vaga</TH>
          <TH>Check-in</TH>
          <TH>Ações</TH>
        </TR>
      </THead>
      <TBody>
        {data.results.map((guest) => (
          <tr key={guest.id}>
            <PiiCells guest={guest} />
            <TD className="text-xs">
              <Stay reservation={guest.active_reservation} />
            </TD>
            <VehicleCell reservation={guest.active_reservation} />
            <TD className="text-xs text-slate-500">
              {guest.active_reservation.checked_in_at
                ? formatISODateTime(guest.active_reservation.checked_in_at)
                : '—'}
            </TD>
            <TD>
              {renderActions?.({
                tab: 'in-hotel',
                guest,
                reservation: guest.active_reservation,
              })}
            </TD>
          </tr>
        ))}
      </TBody>
    </Table>
  )
}

/**
 * Uma linha por reserva pendente, nao por hospede: um hospede pode ter varias
 * reservas futuras (SPEC 4.3) e cada uma tem suas proprias acoes.
 */
function PendingTable({
  data,
  renderActions,
}: {
  data: Paginated<GuestPendingCheckin> | undefined
  renderActions?: (row: GuestRow) => ReactNode
}) {
  const rows = data?.results.flatMap((guest) =>
    guest.pending_reservations.map((reservation) => ({ guest, reservation })),
  )

  if (!rows || rows.length === 0) {
    return <EmptyState message={EMPTY_MESSAGE['pending-checkin']} />
  }

  return (
    <Table caption="Hóspedes com reserva pendente de check-in">
      <THead>
        <TR>
          <TH>Nome</TH>
          <TH>Documento</TH>
          <TH>Telefone</TH>
          <TH>Reserva</TH>
          <TH>Vaga</TH>
          <TH>Ações</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map(({ guest, reservation }) => (
          <tr key={reservation.id}>
            <PiiCells guest={guest} />
            <TD className="text-xs">
              <Stay reservation={reservation} />
            </TD>
            <VehicleCell reservation={reservation} />
            <TD>{renderActions?.({ tab: 'pending-checkin', guest, reservation })}</TD>
          </tr>
        ))}
      </TBody>
    </Table>
  )
}

export function GuestTable({ renderActions }: GuestTableProps) {
  const [tab, setTab] = useState<GuestTab>('todos')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, DEBOUNCE_MS)

  const todos = useGuests(debouncedSearch, { enabled: tab === 'todos' })
  const inHotel = useGuestsInHotel({ enabled: tab === 'in-hotel' })
  const pending = useGuestsPendingCheckin({ enabled: tab === 'pending-checkin' })

  const query = tab === 'todos' ? todos : tab === 'in-hotel' ? inHotel : pending

  const tabs = GUEST_TABS.map((item) => ({
    ...item,
    badge:
      item.id === 'todos'
        ? todos.data?.count
        : item.id === 'in-hotel'
          ? inHotel.data?.count
          : pending.data?.count,
  }))

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Tabs items={tabs} value={tab} onChange={setTab} label="Listagens de hóspedes" />
        {tab === 'todos' ? (
          <div className="w-full sm:w-80">
            <Input
              label="Buscar hóspede"
              type="search"
              placeholder="Nome, documento ou telefone"
              value={search}
              hint="Nome busca por fragmento; documento e telefone, por valor completo."
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      {/* Painel nomeado pela aba ativa: `aria-controls` das abas aponta para ca. */}
      <div id={tabPanelId(tab)} role="tabpanel" aria-labelledby={tabId(tab)}>
        {query.isPending ? (
          <TableSkeleton columns={SKELETON_COLUMNS[tab]} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : tab === 'todos' ? (
          <TodosTable data={todos.data} renderActions={renderActions} />
        ) : tab === 'in-hotel' ? (
          <InHotelTable data={inHotel.data} renderActions={renderActions} />
        ) : (
          <PendingTable data={pending.data} renderActions={renderActions} />
        )}
      </div>
    </section>
  )
}

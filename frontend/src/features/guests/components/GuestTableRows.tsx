import type { ReactNode } from 'react'

import { Badge, TD } from '@/components/ui'
import { countryName } from '@/lib/format/countries'
import { formatISODate, formatISODateTime } from '@/lib/format/dates'
import { formatDocument, formatPhone } from '@/lib/format/pii'

import type { GuestRow, PartyRole } from '../tabs'
import type { Guest, ReservationSummary } from '../types'

export interface GuestRowCellsProps {
  row: GuestRow
  renderActions?: (row: GuestRow) => ReactNode
}

export function GuestRowCells({ row, renderActions }: GuestRowCellsProps) {
  switch (row.tab) {
    case 'all':
      return (
        <>
          <GuestCells guest={row.guest} />
          <NationalityCell guest={row.guest} />
          <TD className="text-xs text-slate-500">{formatISODateTime(row.guest.created_at)}</TD>
          <TD>{renderActions?.(row)}</TD>
        </>
      )
    case 'in-hotel':
      return (
        <>
          <GuestCells guest={row.guest} role={row.role} />
          <RoomCell reservation={row.reservation} />
          <StayCell reservation={row.reservation} />
          <VehicleCell reservation={row.reservation} />
          <TD className="text-xs text-slate-500">
            {row.reservation.checked_in_at ? formatISODateTime(row.reservation.checked_in_at) : '—'}
          </TD>
          <TD>{renderActions?.(row)}</TD>
        </>
      )
    case 'pending-checkin':
      return (
        <>
          <GuestCells guest={row.guest} role={row.role} />
          <RoomCell reservation={row.reservation} />
          <StayCell reservation={row.reservation} />
          <VehicleCell reservation={row.reservation} />
          <TD>{renderActions?.(row)}</TD>
        </>
      )
    default: {
      const unhandled: never = row
      return unhandled
    }
  }
}

// O nome fica no próprio `<span>`: a etiqueta ao lado não pode entrar na busca
// por texto exato que os testes e o atendente fazem pelo nome.
function GuestCells({ guest, role = 'holder' }: { guest: Guest; role?: PartyRole }) {
  return (
    <>
      <TD className="font-medium text-slate-900">
        <span className="flex flex-wrap items-center gap-2">
          <span>{guest.full_name}</span>
          {role === 'companion' ? <Badge variant="info">Acompanhante</Badge> : null}
        </span>
      </TD>
      <TD className="font-mono text-xs">{formatDocument(guest.document)}</TD>
      <TD className="font-mono text-xs">{formatPhone(guest.phone)}</TD>
    </>
  )
}

// O código cabe na coluna e é o que a API grava; o nome por extenso fica no
// `title` para quem não reconhece a sigla.
function NationalityCell({ guest }: { guest: Guest }) {
  return (
    <TD className="font-mono text-xs" title={countryName(guest.nationality)}>
      {guest.nationality}
    </TD>
  )
}

function RoomCell({ reservation }: { reservation: ReservationSummary }) {
  return <TD className="font-mono text-xs">{reservation.room.number}</TD>
}

function StayCell({ reservation }: { reservation: ReservationSummary }) {
  return (
    <TD className="text-xs">
      <span className="whitespace-nowrap">
        {formatISODate(reservation.checkin_date)} → {formatISODate(reservation.checkout_date)}
      </span>
    </TD>
  )
}

function VehicleCell({ reservation }: { reservation: ReservationSummary }) {
  return <TD>{reservation.has_vehicle ? 'Sim' : 'Não'}</TD>
}

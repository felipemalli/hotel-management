import type { ReactNode } from 'react'

import { TD } from '@/components/ui'
import { formatISODate, formatISODateTime } from '@/lib/dates'
import { formatDocument, formatPhone } from '@/lib/pii'

import type { GuestRow } from '../tabs'
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
          <TD className="text-xs text-slate-500">{formatISODateTime(row.guest.created_at)}</TD>
          <TD>{renderActions?.(row)}</TD>
        </>
      )
    case 'in-hotel':
      return (
        <>
          <GuestCells guest={row.guest} />
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
          <GuestCells guest={row.guest} />
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

function GuestCells({ guest }: { guest: Guest }) {
  return (
    <>
      <TD className="font-medium text-slate-900">{guest.full_name}</TD>
      <TD className="font-mono text-xs">{formatDocument(guest.document)}</TD>
      <TD className="font-mono text-xs">{formatPhone(guest.phone)}</TD>
    </>
  )
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

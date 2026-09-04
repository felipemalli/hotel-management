import { createColumnHelper } from '@tanstack/react-table'
import type { ReactNode } from 'react'

import { type DataTableColumns, type dataTableFeatures } from '@/components/common'
import { Typography } from '@/components/ui'
import { countryName } from '@/lib/format/countries'
import { formatISODate, formatISODateTime } from '@/lib/format/dates'
import { formatDocument, formatPhone } from '@/lib/format/pii'

import { Mono, NameCell } from './cells'
import type { GuestAllRow, GuestInHotelRow, GuestPendingRow } from './rows'

const allHelper = createColumnHelper<typeof dataTableFeatures, GuestAllRow>()

export function allColumns(
  renderActions?: (row: GuestAllRow) => ReactNode,
): DataTableColumns<GuestAllRow> {
  return allHelper.columns([
    allHelper.accessor((row) => row.guest.full_name, {
      id: 'name',
      header: 'Nome',
      cell: ({ row }) => <NameCell fullName={row.original.guest.full_name} isCompanion={false} />,
    }),
    allHelper.accessor((row) => row.guest.document, {
      id: 'document',
      header: 'Documento',
      cell: ({ getValue }) => <Mono>{formatDocument(getValue())}</Mono>,
    }),
    allHelper.accessor((row) => row.guest.phone, {
      id: 'phone',
      header: 'Telefone',
      cell: ({ getValue }) => <Mono>{formatPhone(getValue())}</Mono>,
    }),
    allHelper.accessor((row) => row.guest.nationality, {
      id: 'nationality',
      header: 'Nacionalidade',
      cell: ({ getValue }) => {
        const code = getValue()
        return <Mono title={countryName(code)}>{code}</Mono>
      },
    }),
    allHelper.accessor((row) => row.guest.created_at, {
      id: 'created_at',
      header: 'Cadastro',
      cell: ({ getValue }) => (
        <Typography as="span" variant="caption">
          {formatISODateTime(getValue())}
        </Typography>
      ),
    }),
    allHelper.display({
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => renderActions?.(row.original),
    }),
  ])
}

const inHotelHelper = createColumnHelper<typeof dataTableFeatures, GuestInHotelRow>()

export function inHotelColumns(
  renderActions?: (row: GuestInHotelRow) => ReactNode,
): DataTableColumns<GuestInHotelRow> {
  return inHotelHelper.columns([
    inHotelHelper.accessor((row) => row.guest.full_name, {
      id: 'name',
      header: 'Nome',
      cell: ({ row }) => (
        <NameCell
          fullName={row.original.guest.full_name}
          isCompanion={row.original.role === 'companion'}
        />
      ),
    }),
    inHotelHelper.accessor((row) => row.guest.document, {
      id: 'document',
      header: 'Documento',
      cell: ({ getValue }) => <Mono>{formatDocument(getValue())}</Mono>,
    }),
    inHotelHelper.accessor((row) => row.guest.phone, {
      id: 'phone',
      header: 'Telefone',
      cell: ({ getValue }) => <Mono>{formatPhone(getValue())}</Mono>,
    }),
    inHotelHelper.accessor((row) => row.reservation.room.number, {
      id: 'room',
      header: 'Quarto',
      cell: ({ getValue }) => <Mono>{getValue()}</Mono>,
    }),
    inHotelHelper.display({
      id: 'stay',
      header: 'Estadia',
      cell: ({ row }) => (
        <Typography as="span" variant="caption" className="whitespace-nowrap">
          {formatISODate(row.original.reservation.checkin_date)} →{' '}
          {formatISODate(row.original.reservation.checkout_date)}
        </Typography>
      ),
    }),
    inHotelHelper.display({
      id: 'vehicle',
      header: 'Vaga',
      cell: ({ row }) => (row.original.reservation.has_vehicle ? 'Sim' : 'Não'),
    }),
    inHotelHelper.display({
      id: 'checked_in_at',
      header: 'Check-in',
      cell: ({ row }) => {
        const checkedInAt = row.original.reservation.checked_in_at
        return (
          <Typography as="span" variant="caption">
            {checkedInAt ? formatISODateTime(checkedInAt) : '—'}
          </Typography>
        )
      },
    }),
    inHotelHelper.display({
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => renderActions?.(row.original),
    }),
  ])
}

const pendingHelper = createColumnHelper<typeof dataTableFeatures, GuestPendingRow>()

export function pendingColumns(
  renderActions?: (row: GuestPendingRow) => ReactNode,
): DataTableColumns<GuestPendingRow> {
  return pendingHelper.columns([
    pendingHelper.accessor((row) => row.guest.full_name, {
      id: 'name',
      header: 'Nome',
      cell: ({ row }) => (
        <NameCell
          fullName={row.original.guest.full_name}
          isCompanion={row.original.role === 'companion'}
        />
      ),
    }),
    pendingHelper.accessor((row) => row.guest.document, {
      id: 'document',
      header: 'Documento',
      cell: ({ getValue }) => <Mono>{formatDocument(getValue())}</Mono>,
    }),
    pendingHelper.accessor((row) => row.guest.phone, {
      id: 'phone',
      header: 'Telefone',
      cell: ({ getValue }) => <Mono>{formatPhone(getValue())}</Mono>,
    }),
    pendingHelper.accessor((row) => row.reservation.id, {
      id: 'reservation',
      header: 'Reserva',
      cell: ({ getValue }) => <Mono>{`#${getValue()}`}</Mono>,
    }),
    pendingHelper.accessor((row) => row.reservation.room.number, {
      id: 'room',
      header: 'Quarto',
      cell: ({ getValue }) => <Mono>{getValue()}</Mono>,
    }),
    pendingHelper.display({
      id: 'stay',
      header: 'Estadia',
      cell: ({ row }) => (
        <Typography as="span" variant="caption" className="whitespace-nowrap">
          {formatISODate(row.original.reservation.checkin_date)} →{' '}
          {formatISODate(row.original.reservation.checkout_date)}
        </Typography>
      ),
    }),
    pendingHelper.display({
      id: 'vehicle',
      header: 'Vaga',
      cell: ({ row }) => (row.original.reservation.has_vehicle ? 'Sim' : 'Não'),
    }),
    pendingHelper.display({
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => renderActions?.(row.original),
    }),
  ])
}

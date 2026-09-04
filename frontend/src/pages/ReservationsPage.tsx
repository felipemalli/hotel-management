import { EmptyState, ErrorState, Pagination, TableSkeleton } from '@/components/common'
import { ReservationFilters } from '@/features/reservations/components/ReservationFilters'
import { toListParams } from '@/features/reservations/filters'
import { useReservations } from '@/features/reservations/hooks'
import { ReservationTable } from '@/features/reservations/ReservationTable'
import { useReservationFilters } from '@/features/reservations/useReservationFilters'
import { errorMessage } from '@/lib/errors/errors'

export function ReservationsPage() {
  const { filters, setStatus, setPaid, setPage } = useReservationFilters()
  const query = useReservations(toListParams(filters))
  const results = query.data?.results ?? []

  return (
    <section aria-labelledby="reservas-titulo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="reservas-titulo" className="text-xl font-semibold text-slate-900">
          Reservas
        </h2>
        {query.isFetching && !query.isPending ? (
          <span className="text-xs text-slate-500">Atualizando…</span>
        ) : null}
      </div>

      <ReservationFilters filters={filters} onStatusChange={setStatus} onPaidChange={setPaid} />

      <p aria-live="polite" className="sr-only">
        {query.isSuccess && !query.isPlaceholderData ? announce(query.data.count) : ''}
      </p>

      {query.isPending ? (
        <TableSkeleton columns={9} />
      ) : query.isError ? (
        // Uma página fora do intervalo responde 404: o retry volta à primeira,
        // porque insistir na página impossível daria o mesmo 404.
        <ErrorState message={errorMessage(query.error)} onRetry={() => setPage(1)} />
      ) : results.length === 0 ? (
        <EmptyState message="Nenhuma reserva encontrada" />
      ) : (
        <>
          <ReservationTable reservations={results} />
          <Pagination
            page={filters.page}
            count={query.data.count}
            hasNext={query.data.next !== null}
            hasPrevious={query.data.previous !== null}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  )
}

function announce(count: number): string {
  return count === 1 ? '1 reserva encontrada' : `${count} reservas encontradas`
}

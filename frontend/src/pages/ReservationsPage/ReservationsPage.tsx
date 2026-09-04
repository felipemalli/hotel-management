import { ErrorState, PageHeader, Pagination } from '@/components/common'
import { ReservationFilters } from '@/features/reservations/components/ReservationFilters'
import { ReservationTable } from '@/features/reservations/components/ReservationTable'
import { toListParams } from '@/features/reservations/filters'
import { useReservations } from '@/features/reservations/hooks'
import { useReservationFilters } from '@/features/reservations/useReservationFilters'
import { errorMessage } from '@/lib/errors/errors'

export function ReservationsPage() {
  const { filters, setStatus, setPaid, setPage } = useReservationFilters()
  const query = useReservations(toListParams(filters))
  const results = query.data?.results ?? []

  return (
    <section aria-labelledby="reservas-titulo" className="flex flex-col gap-4">
      <PageHeader
        title="Reservas"
        titleId="reservas-titulo"
        updating={query.isFetching && !query.isPending}
      >
        <ReservationFilters filters={filters} onStatusChange={setStatus} onPaidChange={setPaid} />
      </PageHeader>

      <p aria-live="polite" className="sr-only">
        {query.isSuccess && !query.isPlaceholderData ? announce(query.data.count) : ''}
      </p>

      {query.isError ? (
        // 404 de página fora do intervalo: retry na primeira, não na impossível.
        <ErrorState message={errorMessage(query.error)} onRetry={() => setPage(1)} />
      ) : (
        <div className="flex flex-col gap-4">
          <ReservationTable reservations={results} isLoading={query.isPending} />
          {query.isSuccess && results.length > 0 ? (
            <Pagination
              page={filters.page}
              count={query.data.count}
              hasNext={query.data.next !== null}
              hasPrevious={query.data.previous !== null}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}
    </section>
  )
}

function announce(count: number): string {
  return count === 1 ? '1 reserva encontrada' : `${count} reservas encontradas`
}

import { useEffect, useState } from 'react'

import { ErrorState, PageHeader } from '@/components/common'
import { ReservationFilters } from '@/features/reservations/components/ReservationFilters'
import { ReservationTable } from '@/features/reservations/components/ReservationTable'
import { toListParams } from '@/features/reservations/filters'
import { useReservations } from '@/features/reservations/hooks'
import { useReservationFilters } from '@/features/reservations/useReservationFilters'
import { errorMessage } from '@/lib/errors/errors'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from '@/lib/hooks/useDebouncedValue'

export function ReservationsPage() {
  const { filters, setStatus, setPaid, setSearch, setPage } = useReservationFilters()
  // Valor imediato no campo; a URL (e a consulta) só recebem a versão com debounce.
  const [searchValue, setSearchValue] = useState(filters.search)
  const debouncedSearch = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS)

  useEffect(() => {
    if (debouncedSearch !== filters.search) setSearch(debouncedSearch)
    // filters/setSearch mudam a cada busca: só o debounce dispara o efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const query = useReservations(toListParams({ ...filters, search: debouncedSearch }))
  const results = query.data?.results ?? []

  return (
    <section aria-labelledby="reservas-titulo" className="flex flex-col gap-4">
      <PageHeader
        title="Reservas"
        titleId="reservas-titulo"
        breadcrumb="Hotel Vila Marés"
        description="Todas as estadias registradas, com status, ocupação e situação de pagamento."
        updating={query.isFetching && !query.isPending}
      />

      <ReservationFilters
        filters={filters}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onStatusChange={setStatus}
        onPaidChange={setPaid}
      />

      <p aria-live="polite" className="sr-only">
        {query.isSuccess && !query.isPlaceholderData ? announce(query.data.count) : ''}
      </p>

      {query.isError ? (
        // 404 de página fora do intervalo: retry na primeira, não na impossível.
        <ErrorState message={errorMessage(query.error)} onRetry={() => setPage(1)} />
      ) : (
        <ReservationTable
          reservations={results}
          isLoading={query.isPending}
          pagination={
            query.isSuccess && results.length > 0
              ? {
                  page: filters.page,
                  count: query.data.count,
                  hasNext: query.data.next !== null,
                  hasPrevious: query.data.previous !== null,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      )}
    </section>
  )
}

function announce(count: number): string {
  return count === 1 ? '1 reserva encontrada' : `${count} reservas encontradas`
}

import { useEffect, useState } from 'react'

import { ErrorState, PageHeader } from '@/components/common'
import { useCurrentPolicy } from '@/features/pricing/hooks'
import { ReservationFilters } from '@/features/reservations/components/ReservationFilters'
import { ReservationTable } from '@/features/reservations/components/ReservationTable'
import { toListParams } from '@/features/reservations/filters'
import { useReservations } from '@/features/reservations/hooks'
import { useReservationFilters } from '@/features/reservations/useReservationFilters'
import { errorMessage } from '@/lib/errors/errors'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { useHotelClock } from '@/lib/hooks/useHotelClock'

export function ReservationsPage() {
  const {
    filters,
    setStatus,
    setPaid,
    setSearch,
    setCheckinDate,
    setCheckoutDate,
    setOrdering,
    setPage,
  } = useReservationFilters()
  const clock = useHotelClock()
  // Valor imediato no campo; a URL (e a consulta) só recebem a versão com debounce.
  const [searchValue, setSearchValue] = useState(filters.search)
  const debouncedSearch = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS)

  useEffect(() => {
    if (debouncedSearch !== filters.search) setSearch(debouncedSearch)
    // filters/setSearch mudam a cada busca: só o debounce dispara o efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const query = useReservations(toListParams({ ...filters, search: debouncedSearch }, clock.today))
  const results = query.data?.results ?? []

  // O limite vem da política vigente; a reserva só expõe o id da sua.
  const checkoutLimit = useCurrentPolicy().data?.checkout_limit ?? null

  return (
    <section aria-labelledby="reservas-titulo" className="flex flex-col gap-4">
      <PageHeader
        title="Reservas"
        titleId="reservas-titulo"
        description="Todas as estadias registradas, com status, ocupação e situação de pagamento."
        updating={query.isFetching && !query.isPending}
      />

      <ReservationFilters
        filters={filters}
        searchValue={searchValue}
        today={clock.today}
        onSearchChange={setSearchValue}
        onStatusChange={setStatus}
        onPaidChange={setPaid}
        onCheckinDateChange={setCheckinDate}
        onCheckoutDateChange={setCheckoutDate}
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
          ordering={filters.ordering}
          onOrderingChange={setOrdering}
          clock={checkoutLimit === null ? null : { ...clock, checkoutLimit }}
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

import { useEffect, useState } from 'react'

/**
 * Debounce de valor (SPEC 5.3/F1: 300 ms na busca).
 *
 * O input segue controlado e instantaneo; so a query key atrasa, para nao
 * disparar um GET por tecla.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

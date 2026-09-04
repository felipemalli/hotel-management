import { useEffect, useState } from 'react'

// Usado pela busca da Recepção e pelo seletor de acompanhantes: os dois
// esperam o atendente parar de digitar antes de consultar o servidor.
export const SEARCH_DEBOUNCE_MS = 300

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

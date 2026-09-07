import { useEffect, useState } from 'react'

import { nowTimeISO, todayISO } from '../format/dates'

export const CLOCK_TICK_MS = 30_000

export interface HotelClock {
  today: string
  /** Hora local `HH:MM:SS`. */
  time: string
}

function readClock(): HotelClock {
  const now = new Date()
  return { today: todayISO(now), time: nowTimeISO(now) }
}

// Sem o tique, a linha atrasada ao passar do limite continuaria amarela até navegar.
export function useHotelClock(intervalMs: number = CLOCK_TICK_MS): HotelClock {
  const [clock, setClock] = useState(readClock)

  useEffect(() => {
    const timer = setInterval(() => setClock(readClock()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return clock
}

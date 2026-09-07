import type { StayQuote } from '../types'

export const WEEKDAY_NIGHT_QUOTE: StayQuote = {
  nights: 1,
  buckets: [
    {
      kind: 'weekday',
      nights: 1,
      daily_rate: '120.00',
      parking_fee: '0.00',
      subtotal_daily: '120.00',
      subtotal_parking: '0.00',
    },
  ],
  subtotal_daily: '120.00',
  subtotal_parking: '0.00',
  total: '120.00',
}

export const FOURTEEN_NIGHTS_QUOTE: StayQuote = {
  nights: 14,
  buckets: [
    {
      kind: 'weekday',
      nights: 10,
      daily_rate: '120.00',
      parking_fee: '15.00',
      subtotal_daily: '1200.00',
      subtotal_parking: '150.00',
    },
    {
      kind: 'weekend',
      nights: 4,
      daily_rate: '180.00',
      parking_fee: '20.00',
      subtotal_daily: '720.00',
      subtotal_parking: '80.00',
    },
  ],
  subtotal_daily: '1920.00',
  subtotal_parking: '230.00',
  total: '2150.00',
}

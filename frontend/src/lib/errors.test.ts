import { describe, expect, it } from 'vitest'

import {
  ApiError,
  earlyCheckinInfo,
  earlyCheckinServerTime,
  errorMessage,
  isApiError,
  isApiErrorCode,
  isErrorCode,
  isServerFault,
  roomUnavailableInfo,
} from './errors'

function apiError(code: Parameters<typeof isApiErrorCode>[1], status: number, detail = 'detalhe') {
  return new ApiError({ code, detail, status })
}

describe('isErrorCode', () => {
  it('aceita os codigos do servidor e os sinteticos do cliente', () => {
    expect(isErrorCode('EARLY_CHECKIN')).toBe(true)
    expect(isErrorCode('THROTTLED')).toBe(true)
    expect(isErrorCode('NETWORK_ERROR')).toBe(true)
    expect(isErrorCode('CONTRACT_ERROR')).toBe(true)
  })

  it('conhece os codigos das rotas administrativas e de quarto', () => {
    expect(isErrorCode('PERMISSION_DENIED')).toBe(true)
    expect(isErrorCode('ROOM_UNAVAILABLE')).toBe(true)
  })

  it('recusa um codigo que a uniao nao conhece', () => {
    expect(isErrorCode('QUOTA_EXCEEDED')).toBe(false)
  })
})

describe('predicados de erro', () => {
  it('reconhece o ApiError e o codigo, estreitando o tipo', () => {
    const error: unknown = apiError('DUPLICATE_DOCUMENT', 409)

    expect(isApiError(error)).toBe(true)
    expect(isApiErrorCode(error, 'DUPLICATE_DOCUMENT')).toBe(true)
    expect(isApiErrorCode(error, 'VALIDATION_ERROR')).toBe(false)
    expect(isApiErrorCode(new Error('qualquer'), 'VALIDATION_ERROR')).toBe(false)
  })

  it('trata 5xx e rede fora do ar como falha do servidor', () => {
    expect(isServerFault(apiError('UNKNOWN_ERROR', 500))).toBe(true)
    expect(isServerFault(apiError('UNKNOWN_ERROR', 503))).toBe(true)
    expect(isServerFault(apiError('NETWORK_ERROR', 0))).toBe(true)
    expect(isServerFault(apiError('NOT_FOUND', 404))).toBe(false)
    expect(isServerFault(apiError('VALIDATION_ERROR', 400))).toBe(false)
    expect(isServerFault(new Error('erro de render'))).toBe(false)
  })
})

describe('acessores de extra', () => {
  it('devolve a hora do servidor so no EARLY_CHECKIN e so quando e string', () => {
    const early = new ApiError({
      code: 'EARLY_CHECKIN',
      detail: 'Check-in permitido a partir das 14:00.',
      status: 409,
      extra: { server_time: '13:45' },
    })

    expect(earlyCheckinServerTime(early)).toBe('13:45')
    expect(earlyCheckinServerTime(apiError('EARLY_CHECKIN', 409))).toBeNull()
    expect(earlyCheckinServerTime(apiError('INVALID_STATUS', 409))).toBeNull()
  })
})

describe('errorMessage', () => {
  it('traduz transporte e autenticacao, sem repassar texto do simplejwt', () => {
    expect(errorMessage(apiError('NETWORK_ERROR', 0, 'Network Error'))).toBe(
      'Não foi possível falar com o servidor.',
    )
    expect(
      errorMessage(apiError('NOT_AUTHENTICATED', 401, 'Given token not valid for any token type')),
    ).toBe('Sua sessão expirou. Entre novamente.')
    expect(errorMessage(apiError('THROTTLED', 429, 'Request was throttled.'))).toBe(
      'Muitas tentativas em pouco tempo. Aguarde um instante.',
    )
  })

  it('mantem o detail do servidor nos codigos de dominio', () => {
    expect(errorMessage(apiError('INVALID_STATUS', 409, 'Transição inválida: CHECKED_OUT.'))).toBe(
      'Transição inválida: CHECKED_OUT.',
    )
  })

  it('deixa a tela sobrepor a mensagem do codigo que ela apresenta', () => {
    const message = errorMessage(apiError('NOT_AUTHENTICATED', 401), {
      NOT_AUTHENTICATED: 'Usuário ou senha inválidos.',
    })

    expect(message).toBe('Usuário ou senha inválidos.')
  })

  it('sobrevive ao que nao e ApiError', () => {
    expect(errorMessage(new Error('falha de render'))).toBe('falha de render')
    expect(errorMessage('texto solto')).toBe('Erro inesperado. Tente novamente.')
  })
})

describe('earlyCheckinInfo', () => {
  it('devolve a hora do servidor e a abertura da politica', () => {
    const error = new ApiError({
      code: 'EARLY_CHECKIN',
      detail: 'Check-in permitido a partir das 15:00.',
      status: 409,
      extra: { server_time: '13:45', opens_at: '15:00' },
    })

    expect(earlyCheckinInfo(error)).toEqual({ serverTime: '13:45', opensAt: '15:00' })
  })

  it('devolve nulo quando falta uma das horas', () => {
    const error = new ApiError({
      code: 'EARLY_CHECKIN',
      detail: 'Check-in permitido a partir das 14:00.',
      status: 409,
      extra: { server_time: '13:45' },
    })

    expect(earlyCheckinInfo(error)).toBeNull()
  })

  it('devolve nulo para outro codigo', () => {
    expect(earlyCheckinInfo(apiError('INVALID_STATUS', 409))).toBeNull()
    expect(earlyCheckinInfo(new Error('qualquer'))).toBeNull()
  })
})

describe('roomUnavailableInfo', () => {
  it('devolve a data da reserva conflitante quando o servidor a conhece', () => {
    const error = new ApiError({
      code: 'ROOM_UNAVAILABLE',
      detail: 'Quarto 101 indisponivel no periodo solicitado.',
      status: 409,
      extra: { room_id: 1, conflicting_reservation_id: 7, conflicting_checkin_date: '2026-09-10' },
    })

    expect(roomUnavailableInfo(error)).toEqual({ conflictingCheckinDate: '2026-09-10' })
  })

  it('devolve data nula no caminho da corrida, em que so ha room_id', () => {
    const error = new ApiError({
      code: 'ROOM_UNAVAILABLE',
      detail: 'Quarto indisponivel para o periodo.',
      status: 409,
      extra: { room_id: 1 },
    })

    expect(roomUnavailableInfo(error)).toEqual({ conflictingCheckinDate: null })
  })

  it('devolve nulo para outro codigo', () => {
    expect(roomUnavailableInfo(apiError('INVALID_STATUS', 409))).toBeNull()
  })
})

describe('errorMessage para autorizacao', () => {
  it('fala a lingua do balcao mesmo quando o DRF responde em ingles', () => {
    const error = apiError(
      'PERMISSION_DENIED',
      403,
      'You do not have permission to perform this action.',
    )

    expect(errorMessage(error)).toBe('Ação restrita ao administrador do hotel.')
  })

  it('mantem o detail do servidor para o codigo de dominio', () => {
    const error = apiError('ROOM_UNAVAILABLE', 409, 'Quarto 101 indisponivel no periodo.')

    expect(errorMessage(error)).toBe('Quarto 101 indisponivel no periodo.')
  })
})

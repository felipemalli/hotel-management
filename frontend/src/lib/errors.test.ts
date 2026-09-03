import { describe, expect, it } from 'vitest'

import {
  ApiError,
  earlyCheckinServerTime,
  errorMessage,
  fieldErrors,
  isApiError,
  isApiErrorCode,
  isErrorCode,
  isServerFault,
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

  it('achata o erro por campo do DRF na primeira mensagem', () => {
    const validation = new ApiError({
      code: 'VALIDATION_ERROR',
      detail: 'Dados inválidos.',
      status: 400,
      extra: {
        phone: ['Telefone inválido para a região.', 'segunda mensagem ignorada'],
        document: 'Documento inválido.',
        non_field_errors: [],
      },
    })

    expect(fieldErrors(validation)).toEqual({
      phone: 'Telefone inválido para a região.',
      document: 'Documento inválido.',
    })
    expect(fieldErrors(apiError('NOT_FOUND', 404))).toEqual({})
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

import { afterEach, describe, expect, it, vi } from 'vitest'

import { session } from './session'

const TOKENS = { access: 'access-1', refresh: 'refresh-1', username: 'recepcao' }

afterEach(() => {
  session.clear()
  window.localStorage.clear()
})

describe('session', () => {
  it('guarda o par de tokens e o atendente, e avisa quem observa', () => {
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)

    session.set(TOKENS)

    expect(session.getAccessToken()).toBe('access-1')
    expect(session.getRefreshToken()).toBe('refresh-1')
    expect(session.getUsername()).toBe('recepcao')
    expect(window.localStorage.getItem('hotel.access')).toBe('access-1')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    session.clear()

    expect(session.getAccessToken()).toBeNull()
    expect(window.localStorage.getItem('hotel.refresh')).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('troca so o access na renovacao, preservando o refresh', () => {
    session.set(TOKENS)
    session.setAccessToken('access-2')

    expect(session.getAccessToken()).toBe('access-2')
    expect(session.getRefreshToken()).toBe('refresh-1')
  })

  it('derruba a sessao quando outra aba faz sign-out', () => {
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)
    session.set(TOKENS)
    listener.mockClear()

    window.localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: 'hotel.access', newValue: null }))

    expect(session.getAccessToken()).toBeNull()
    expect(session.getUsername()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('ignora a chave de outra aplicacao no mesmo dominio', () => {
    session.set(TOKENS)

    window.dispatchEvent(new StorageEvent('storage', { key: 'outra.chave', newValue: 'x' }))

    expect(session.getAccessToken()).toBe('access-1')
  })

  it('segue funcionando em memoria quando o localStorage lanca', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('acesso negado em modo privado')
    })

    expect(() => session.set(TOKENS)).not.toThrow()
    expect(session.getAccessToken()).toBe('access-1')
  })
})

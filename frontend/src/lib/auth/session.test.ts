import { afterEach, describe, expect, it, vi } from 'vitest'

import { connectTabs, session } from './session'

const CHANNEL = 'hotel.auth'

const closers: (() => void)[] = []

afterEach(() => {
  while (closers.length > 0) closers.pop()?.()
  session.clear()
})

function connected(): void {
  closers.push(connectTabs())
}

describe('session', () => {
  it('guarda o access em memoria e avisa quem observa', () => {
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)

    session.setAccessToken('access-1')

    expect(session.getAccessToken()).toBe('access-1')
    expect(session.getStatus()).toBe('authenticated')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    session.clear()

    expect(session.getAccessToken()).toBeNull()
    expect(session.getStatus()).toBe('anonymous')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('nao deixa credencial nenhuma no armazenamento do navegador', () => {
    session.setAccessToken('access-1')

    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('troca o access na renovacao sem sair do estado autenticado', () => {
    session.setAccessToken('access-1')
    session.setAccessToken('access-2')

    expect(session.getAccessToken()).toBe('access-2')
    expect(session.getStatus()).toBe('authenticated')
  })

  it('derruba a sessao quando outra aba faz sign-out', async () => {
    connected()
    session.setAccessToken('access-1')

    const outraAba = new BroadcastChannel(CHANNEL)
    closers.push(() => {
      outraAba.close()
    })
    outraAba.postMessage('signed-out')

    await vi.waitFor(() => expect(session.getAccessToken()).toBeNull(), { interval: 2 })
    expect(session.getStatus()).toBe('anonymous')
  })

  it('ignora mensagem que nao e o sign-out', async () => {
    connected()
    session.setAccessToken('access-1')

    const outraAba = new BroadcastChannel(CHANNEL)
    closers.push(() => {
      outraAba.close()
    })
    outraAba.postMessage('outra-coisa')

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(session.getAccessToken()).toBe('access-1')
  })

  // Rede caida no boot nao e motivo para derrubar quem ja esta dentro.
  it('nao avisa as outras abas ao apenas constatar que esta anonima', async () => {
    connected()
    const outraAba = new BroadcastChannel(CHANNEL)
    const recebidas = vi.fn()
    outraAba.onmessage = recebidas
    closers.push(() => {
      outraAba.close()
    })

    session.setAccessToken('access-1')
    session.markAnonymous()

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(session.getStatus()).toBe('anonymous')
    expect(recebidas).not.toHaveBeenCalled()
  })

  it('segue funcionando sem BroadcastChannel no ambiente', () => {
    const original = globalThis.BroadcastChannel
    // @ts-expect-error o teste remove a API de propósito
    delete globalThis.BroadcastChannel

    const disconnect = connectTabs()
    session.setAccessToken('access-1')

    expect(() => {
      session.clear()
    }).not.toThrow()
    expect(session.getAccessToken()).toBeNull()

    disconnect()
    globalThis.BroadcastChannel = original
  })
})

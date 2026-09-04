/* eslint-disable testing-library/no-manual-cleanup -- sem `globals` o RTL nao encontra um
   `afterEach` para se registrar sozinho: e daqui que a arvore e desmontada entre casos. */
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { errorLogger } from '@/lib/errors/errorLogger'

import { resetGlobalStores } from './renderWithProviders'

declare global {
  var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined
  interface Element {
    getAnimations?: () => Animation[]
  }
}

// Base UI le esta flag no proprio pacote e pula a espera por animacoes CSS
// (jsdom nao tem Element.getAnimations mesmo, mas isto evita depender do guard).
globalThis.BASE_UI_ANIMATIONS_DISABLED = true

// NAO adicionar um stub de ResizeObserver: o floating-ui so usa
// `typeof ResizeObserver === 'function'` para decidir se observa elementos
// para reposicionamento, e um stub cujo `observe()` nunca dispara o callback
// trava esse fluxo para sempre (Select/Menu nunca terminam de abrir).
// A ausencia de ResizeObserver no jsdom faz o floating-ui pular esse caminho.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined
}

if (!('getAnimations' in Element.prototype)) {
  Element.prototype.getAnimations = (): Animation[] => []
}

// jsdom nao implementa PointerEvent: o Checkbox do Base UI redispara o clique
// num input nativo oculto via `new window.PointerEvent(...)` para manter os
// dois em sincronia, e sem isto o clique explode com "not a constructor".
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent implements PointerEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    readonly width: number
    readonly height: number
    readonly pressure: number
    readonly tangentialPressure: number
    readonly tiltX: number
    readonly tiltY: number
    readonly twist: number
    readonly altitudeAngle: number
    readonly azimuthAngle: number

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? ''
      this.isPrimary = params.isPrimary ?? false
      this.width = params.width ?? 1
      this.height = params.height ?? 1
      this.pressure = params.pressure ?? 0
      this.tangentialPressure = params.tangentialPressure ?? 0
      this.tiltX = params.tiltX ?? 0
      this.tiltY = params.tiltY ?? 0
      this.twist = params.twist ?? 0
      this.altitudeAngle = params.altitudeAngle ?? 0
      this.azimuthAngle = params.azimuthAngle ?? 0
    }

    getCoalescedEvents = (): PointerEvent[] => []
    getPredictedEvents = (): PointerEvent[] => []
  }

  globalThis.PointerEvent = PointerEventPolyfill
}

// O sink de console é útil no navegador e só ruído aqui: quem afirma sobre o
// log instala o próprio sink no caso.
errorLogger.use({ capture: () => undefined })

beforeEach(resetGlobalStores)
afterEach(cleanup)

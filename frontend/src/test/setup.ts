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

// Base UI: desliga espera por animação CSS (jsdom não tem getAnimations).
globalThis.BASE_UI_ANIMATIONS_DISABLED = true

// NÃO stubar ResizeObserver: floating-ui só checa `typeof ResizeObserver === 'function'`.
// Um stub cujo observe() nunca dispara trava Select/Menu para sempre.
// Sem ResizeObserver no jsdom, o floating-ui pula esse caminho.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined
}

if (!('getAnimations' in Element.prototype)) {
  Element.prototype.getAnimations = (): Animation[] => []
}

// jsdom não tem PointerEvent: o Checkbox do Base UI faz `new window.PointerEvent(...)`.
// Sem isto o clique explode com "not a constructor".
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

// Sink de console só faz ruído aqui; quem afirma sobre o log instala o próprio.
errorLogger.use({ capture: () => undefined })

beforeEach(resetGlobalStores)
afterEach(cleanup)

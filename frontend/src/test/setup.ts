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

// O sink de console é útil no navegador e só ruído aqui: quem afirma sobre o
// log instala o próprio sink no caso.
errorLogger.use({ capture: () => undefined })

beforeEach(resetGlobalStores)
afterEach(cleanup)

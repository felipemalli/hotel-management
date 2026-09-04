/* eslint-disable testing-library/no-manual-cleanup -- sem `globals` o RTL nao encontra um
   `afterEach` para se registrar sozinho: e daqui que a arvore e desmontada entre casos. */
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { errorLogger } from '@/lib/errors/errorLogger'

import { resetGlobalStores } from './renderWithProviders'

// O sink de console é útil no navegador e só ruído aqui: quem afirma sobre o
// log instala o próprio sink no caso.
errorLogger.use({ capture: () => undefined })

beforeEach(resetGlobalStores)
afterEach(cleanup)

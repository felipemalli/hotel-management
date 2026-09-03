/* eslint-disable testing-library/no-manual-cleanup -- sem `globals` o RTL nao encontra um
   `afterEach` para se registrar sozinho: e daqui que a arvore e desmontada entre casos. */
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { resetGlobalStores } from './renderWithProviders'

// `session` e `toastStore` sao stores de modulo: sem isto, um caso herda a
// sessao e os avisos do anterior.
beforeEach(resetGlobalStores)
afterEach(cleanup)

/* eslint-disable testing-library/no-manual-cleanup -- sem `globals` o RTL nao encontra um
   `afterEach` para se registrar sozinho: e daqui que a arvore e desmontada entre casos. */
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { resetGlobalStores } from './renderWithProviders'

beforeEach(resetGlobalStores)
afterEach(cleanup)

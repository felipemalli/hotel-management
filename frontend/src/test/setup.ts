/* eslint-disable testing-library/no-manual-cleanup -- sem `globals` o RTL nao encontra um
   `afterEach` para se registrar sozinho: e daqui que a arvore e desmontada entre casos. */
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

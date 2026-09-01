"""
Feature opcional de IA (SPEC 7) -- extracao de campos de cadastro a partir de
texto livre.

Isolamento (SPEC 7.2, 8.4/C1): este pacote **nao** e importado por `hotel/`
nem por `accounts/`. Ele nao entra em `INSTALLED_APPS` (nao tem models,
migracoes nem templates), so e alcancado pela rota `api/ai/` de
`config/urls.py`. O corte limpo do pacote e, portanto: apagar `backend/ai/`,
a rota em `config/urls.py`, `backend/tests/api/test_ai.py`, o bloco da IA em
`frontend/src/features/guests/GuestForm.tsx` + `frontend/src/features/ai/` e a
dependencia `httpx` -- sem orfaos.

Portao de fallback (SPEC 7.2): sem `ANTHROPIC_API_KEY` a feature se desliga
inteira (`/api/ai/status/` responde `enabled: false`, `parse-guest` responde
`503 AI_DISABLED`) e o resto do sistema segue 100% funcional.
"""

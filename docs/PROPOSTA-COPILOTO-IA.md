# Proposta: copiloto de recepção (substituir o parse-guest)

**Status:** ideia, não implementada.  
**Audiência:** outro agente (ou revisor) avaliando se a ideia cabe neste repositório, se o isolamento atual se mantém, e qual o nível de complexidade.  
**Não é** um spec de implementação fechado: há decisões abertas na §8. A §9 é o roteiro de avaliação pedido.

Este texto incorpora o desenho original **e** o que ficou decidido depois (formato da resposta, desambiguação, “não filtrar todas as colunas”), alinhado à arquitetura vigente em `ARQUITECTURE.md` (apps aninhados, `preview_checkout` já existente, import-linter).

Leia antes, neste repositório:

| Documento | Para quê |
|---|---|
| `desafio.md` | Briefing do desafio (RF/RN). A IA **não** está nele. |
| `README.md` §5.4 e §8 | Diferencial opcional atual; escopo deliberadamente fora. |
| `ARQUITECTURE.md` | Pacotes, grafo `ai → reservations → folhas`, ciclo estadia × conta, §8 IA, §10 copiloto. |
| `docs/GUIA-DO-PROJETO.md` | Como o frontend se organiza; `ai/` no cadastro hoje. |
| `docker-compose.yml` (comando do backend) | Gunicorn `-w ${GUNICORN_WORKERS:-3} --threads 2`. |

---

## 1. Problema

O diferencial de IA hoje é **preencher o cadastro de hóspede a partir de texto livre**.

Fluxo: o atendente cola uma frase → `POST /api/ai/parse-guest/` → Anthropic extrai `{full_name, document, phone}` → o formulário é preenchido → o atendente revisa e submete. Nada é persistido pela IA.

Isso está **bem feito como engenharia** e **fraco como produto**:

- O formulário tem poucos campos. Colar uma frase é mais lento do que digitar.
- Não usa nenhuma regra de negócio do briefing (diária, vaga, 14h, multa das 12h).
- Em apresentação de desafio, lê-se como “IA para ter IA”.

A engenharia que **deve ser preservada** (não jogar fora junto com o caso de uso):

- Feature opcional: sem `ANTHROPIC_API_KEY` o sistema inteiro funciona; `GET /api/ai/status/` → `{enabled: false}`; o frontend não renderiza o botão.
- Isolamento: nenhum app de domínio importa `ai/` (`ARQUITECTURE.md` §3 e §8; contrato `lint-imports` no CI). Hoje `ai/` importa **só `core`** (parse-guest não toca hóspede/reserva). O copiloto seria o **primeiro** toque de `ai/` no domínio — e o grafo já reserva o lugar: `ai → hotel.reservations` (`ARQUITECTURE.md` §3 e §10).
- Saída de modelo = input não confiável: serializer antes de devolver ao cliente; desvio → `502 AI_UPSTREAM_ERROR`.
- Human-in-the-loop: a IA não grava hóspede nem reserva.
- Privacidade: texto vai a provedor externo; payload não entra em log.
- Removível: apagar `backend/ai/`, `frontend/src/features/ai/`, a linha de rota e o import no `GuestForm` desliga o diferencial. O copiloto não pode tornar isso mentira (nada de `if ai` em `hotel.*`).

Código atual (referência):

- Backend: `backend/ai/{client,config,exceptions,serializers,urls,views}.py` + `backend/tests/api/test_ai.py`
- Frontend: `frontend/src/features/ai/` + 1 import em `frontend/src/features/guests/GuestForm.tsx`
- Cliente: um único `httpx.post` para `https://api.anthropic.com/v1/messages` (`ai/client.py`), timeout 10s, `max_tokens` 512, temperature 0.

Ponto de costura **já existente** (não inventar outro): `hotel.reservations.services.preview_checkout(reservation, now=…)` — extrato projetado, sem lock e sem escrita (`ARQUITECTURE.md` §5 e §8: “o copiloto de checkout está adiado”).

---

## 2. Ideia proposta

Substituir o parse-guest por um **copiloto de balcão**.

O atendente descreve a situação em linguagem natural no **dashboard** (não no formulário de cadastro). O backend faz um loop de *tool use* com a Anthropic: o modelo **pede** consultas; o Django **executa** selectors/serviços que já existem; o modelo **não** fala com o Postgres e **não** grava nada. A resposta final é um texto para o atendente **mais** uma ação proposta (DTO). O clique do atendente dispara os endpoints de negócio que já existem (`check-in`, `checkout`, etc.).

### 2.1 Demo-alvo (o que tem de funcionar na apresentação)

Três falas, com dados reais do seed / da base:

1. *“A Ana Souza chegou, tem reserva hoje.”*  
   → acha a reserva `PENDING`, avisa se ainda é antes das 14h, oferece botão **Confirmar check-in** (com o mesmo fluxo de `allow_early` que a UI já tem).

2. *“O João quer sair agora, tem carro.”*  
   → preview do extrato via `preview_checkout` (Django), narrado em português, botão **Confirmar checkout**. Os números da fala vêm da ferramenta, não do modelo. O clique abre o `CheckoutStatementDialog` de sempre.

3. *“Quem ainda está no hotel?”* / *“quem tem reserva e não fez check-in?”*  
   → lista curta. As abas do dashboard já fazem isso; aqui é para o copiloto não ser cego ao estado do dia.

### 2.2 O que a IA **não** faz

- Não calcula diária, vaga, multa nem extras. Isso é `hotel.billing.engine` + o livro (`Account` / `AccountLine`). A ferramenta só lê `preview_checkout`.
- Não executa check-in, checkout, cancelamento, cadastro, reserva nem pagamento.
- Não gera SQL, ORM, nem HTTP para `localhost`.
- Não substitui as três listagens do briefing (elas continuam na `GuestTable`).
- Não vira chat com memória de sessão (v1: **um** turno do atendente por request HTTP; o loop de tools é interno ao servidor).
- **Não exige filtro novo em coluna nenhuma.** Não é um query builder. Catálogo fechado de RPCs em cima do que o balcão já consulta (ver §2.5).

### 2.3 Formato do retorno (não é só texto corrido)

O input do atendente é texto. A API **não** devolve um parágrafo solto. Contrato:

```json
{
  "reply": "Ana Souza — reserva #12, quarto 101, status PENDING. São 13:45; check-in abre às 14:00.",
  "proposed_action": {
    "type": "check_in",
    "reservation_id": 12,
    "needs_early_override": true
  }
}
```

| Campo | Papel na UI |
|---|---|
| `reply` | Texto curto, operacional, em português. Sem markdown, sem HTML, sem tabela gerada pelo modelo. |
| `proposed_action` | `null` se for só informativo; senão enum fechado + `reservation_id`. Vira **um** botão. |

O clique **não** grava pela IA:

- `check_in` → o mesmo caminho de `ReservationActions` / `EarlyCheckinDialog` (`allow_early`).
- `checkout` → `POST .../checkout/` e o **extrato oficial** (`CheckoutStatementDialog`). A fala é resumo; a conta é a tabela do Django.

O que propositalmente **não** é o retorno: chat com histórico, streaming, markdown/HTML do modelo, cards cujo layout o LLM inventa.

v1: **um** campo, **uma** resposta, **no máximo um** botão. A UI **substitui** o resultado anterior — não empilha bolhas. Ao enviar, some o `reply`/botão da pergunta de antes (ou fica um estado de “consultando…”); a resposta nova ocupa o mesmo lugar. Dois resultados na tela fingiriam memória que o backend não tem, e o atendente clicaria no checkout do João errado.

### 2.4 Desambiguação (dois João no hotel)

O agente **não escolhe** um alvo calado. Escolher é o erro perigoso: o botão gravaria a reserva errada.

Comportamento obrigatório:

1. A ferramenta devolve os dois (nome + quarto + `reservation_id` + recorte de documento).
2. O `reply` lista os dois e pede critério (*“qual deles?”*).
3. `proposed_action` é **`null`**. Sem botão.
4. A próxima fala do atendente (nova request: v1 **não** guarda histórico) precisa trazer o critério: *“o do quarto 12”*, *“reserva #14”*. Aí a ferramenta reduz a um id e o botão pode aparecer.

Guarda no servidor, não só no prompt: a allowlist “`reservation_id` tem de ter aparecido num `tool_result`” **não basta** — os dois ids apareceram. Se a busca daquela request deixou **mais de um** candidato plausível, o backend **zera** `proposed_action` mesmo que o modelo escolha um.

### 2.5 Não é filtrar todas as colunas

O modelo não ganha `WHERE` genérico sobre Guest/Reservation/Room. As listagens do produto já filtram o que o briefing pede (nome/documento/telefone; reservas por status/pago/`q`). O copiloto **reusa** isso via ferramentas nomeadas. Ampliar a API de filtros para “a IA consultar o que quiser” explode `hotel.*`, testes e OpenAPI, e vira SQL por LLM — recusado.

---

## 3. Desenho técnico

### 3.1 Princípio

**Tool use = RPC com allowlist.** O modelo escolhe `nome + args` de um catálogo fechado. Python valida os args (serializer), chama o domínio, serializa um **recorte** e devolve como `tool_result`. Writes continuam só nas views de `hotel.reservations`.

Grafo (`ARQUITECTURE.md` §3, `backend/pyproject.toml` `[tool.importlinter]`):

```text
ai  →  hotel.reservations  →  hotel.guests | hotel.rooms | hotel.billing  →  core | accounts
```

`ai/` **não** importa `hotel.billing` nem `hotel.rooms` direto. Motor de dinheiro e quarto entram só pelo que `reservations` já expõe (`preview_checkout`, `check_in` interno, selectors de ocupação). `search_guests` vive em `hotel.guests.selectors`: o import-linter **permite** `ai → guests` (camada abaixo), mas o desenho preferido é passar por `reservations` (façade da estadia) ou um wrapper fino lá — decisão §8.2. `hotel.*` continua sem importar `ai`.

### 3.2 Sequência (uma `POST` do frontend)

```
Atendente                 Django (ai/)                    Anthropic
    |                          |                              |
    |  POST /api/ai/copilot/   |                              |
    |  { "message": "..." }    |                              |
    |------------------------->|  messages + tools[]          |
    |                          |----------------------------->|
    |                          |  stop_reason: tool_use       |
    |                          |  search_guests({term:"Ana"}) |
    |                          |<-----------------------------|
    |                          |  selector existente          |
    |                          |  messages += tool_result     |
    |                          |----------------------------->|
    |                          |  stop_reason: tool_use       |
    |                          |  preview_checkout({id:12})   |
    |                          |<-----------------------------|
    |                          |  reservations.preview_checkout
    |                          |----------------------------->|
    |                          |  stop_reason: end_turn       |
    |                          |  JSON {reply, proposed_action}|
    |                          |<-----------------------------|
    |  200 {reply, action}     |  serializer da resposta      |
    |<-------------------------|                              |
    |  [botão Confirmar]       |                              |
    |  POST /api/reservations/12/checkout/   (hotel.reservations, igual hoje)
```

O browser **nunca** vê a chave Anthropic. O loop **não** é exposto ao React: uma request, uma resposta. Teto sugerido: **3–4** voltas de tool, timeout **global** do request (não 10s × N).

Protocolo: o mesmo `POST /v1/messages` já usado. A diferença é o campo `tools` e repetir a chamada enquanto `stop_reason == "tool_use"`. Documentação Anthropic: *Tool use* na Messages API.

### 3.3 Catálogo v1 (fechado; não é um plugin system)

Cada ferramenta é um wrapper fino. Sem ferramenta de escrita.

| Nome | Args | Implementação existente | Recorte devolvido ao modelo |
|---|---|---|---|
| `search_guests` | `term: str` | `hotel.guests.selectors.search_guests` | até 5: `id`, `full_name`, documento mascarado |
| `guests_in_hotel` | (nenhum ou `term`) | `hotel.reservations.selectors.guests_in_hotel` | até 10: hóspede + `reservation_id` + quarto |
| `guests_pending_checkin` | (nenhum ou `term`) | `hotel.reservations.selectors.guests_pending_checkin` | idem |
| `get_reservation` | `reservation_id: int` | `hotel.reservations.selectors.reservation_queryset` | status, datas, quarto, vaga, titular, acompanhantes |
| `preview_checkin` | `reservation_id: int` | a mesma regra de `reservations.services.check_in` (`engine.early_checkin` + política vigente + `now`) — **sem** persistir | `{allowed_now, opens_at, server_time, reservation_id}` |
| `preview_checkout` | `reservation_id: int` | **`reservations.services.preview_checkout`** (já existe) | mesmo formato conceitual do `StatementSerializer` (linhas, subtotais, multa, **extras**, total) |

`preview_checkout` já agrega extras do livro (`AccountLine` kind EXTRA) em cima do motor. O copiloto não recalcula; se houver extra, o recorte a inclui. A ferramenta **não** chama `check_out` (esse posta linhas e fecha a conta).

`preview_checkin` ainda não tem um helper espelhado. Preferível extrair a decisão “é cedo?” para uma função em `reservations.services` (sem IA no nome), em vez de `ai/` importar `hotel.billing.engine`.

### 3.4 Contrato HTTP proposto

Manter `GET /api/ai/status/` como está (`{enabled: bool}`).

**Substituir** `POST /api/ai/parse-guest/` (não manter os dois diferenciais).

Novo:

`POST /api/ai/copilot/`  
Auth: a mesma das rotas de negócio (JWT Bearer).  
Throttle: o `AiRateThrottle` já existe (`THROTTLE_AI`, default `20/min`).  
Request:

```json
{ "message": "A Ana Souza chegou, tem reserva hoje." }
```

`message`: string, teto na casa de 2_000 caracteres (o parse-guest já usa `MAX_TEXT_LENGTH = 2000`).

Response 200: o JSON da §2.3. `proposed_action` pode ser `null`.

`type` é enum fechado, validado por serializer **depois** do modelo (mesmo padrão `ParsedGuestSerializer`):

| `type` | Campos | Clique no UI chama |
|---|---|---|
| `check_in` | `reservation_id`, `needs_early_override` | `POST /api/reservations/{id}/check-in/` com `allow_early` se o atendente confirmar o alerta (reusar `EarlyCheckinDialog`) |
| `checkout` | `reservation_id` | `POST /api/reservations/{id}/checkout/` → já abre o `CheckoutStatementDialog` |
| `none` / omitido | — | sem botão |

Fora do v1 (não implementar agora): `cancel`, `pay`, `create_guest`, `create_reservation`. Cada um explode UI e estados de diálogo.

Erros: reusar `503 AI_DISABLED`, `502 AI_UPSTREAM_ERROR`. Timeout, `stop_reason` inesperado, JSON final inválido, `type` desconhecido, `reservation_id` inexistente no result das tools → 502, não 400 (o atendente não “errou o formulário”; o modelo saiu do contrato). Mensagem de `message` vazia → 400.

### 3.5 System prompt (requisitos, não o texto final)

Obrigar:

- Usar ferramentas antes de afirmar fato operacional (nome, status, valor, horário).
- Se a ferramenta não achou, dizer que não achou; não inventar id.
- Se a ferramenta devolveu **mais de um** candidato, listar e **não** preencher `proposed_action`.
- Valores monetários: copiar o JSON de `preview_checkout`; nunca arredondar de cabeça. Incluir extras se o statement os trouxer.
- Resposta final **exclusivamente** o JSON `{reply, proposed_action}` (sem markdown fence; o client atual já stripa ` ``` ` por precaução).
- Propor `check_in` / `checkout` só se a ferramenta mostrou **exatamente um** alvo com status compatível (`PENDING` / `CHECKED_IN`).

### 3.6 Frontend

- Painel no `DashboardPage` (recepção), não no `GuestForm`.
- `GET /api/ai/status/`: se `enabled: false`, o painel **não renderiza** (igual ao botão atual).
- UI mínima: textarea + enviar + **um** slot de resultado (`reply` + botão). Sem histórico, sem lista de mensagens, sem streaming, sem markdown rico. Cada envio **substitui** o slot; no `isPending`, limpa o resultado anterior para o botão velho não continuar clicável.
- Ação: não reimplementar check-in/checkout. Encaminhar para os hooks já usados (`useCheckIn`, `useCheckOut` em `ReservationActions`) e para os diálogos já orquestrados por `useDashboardDialog` (`statement`; o early hoje mora dentro de `ReservationActions`).
- Remover `AiFillGuest` do `GuestForm` e o `vi.mock('@/features/ai/api')` correspondente em `GuestForm.test.tsx`.
- Camadas: `features/ai` continua isolada; `pages/DashboardPage` é quem compõe. `features/guests` deixa de importar `features/ai`.

### 3.7 Testes (obrigatório neste repo; a IA não isenta)

Backend, no mesmo estilo de `backend/tests/api/test_ai.py` (httpx dublado, sem rede):

- Sem chave → status `enabled: false`; `POST` copiloto → 503.
- Upstream 500 / timeout / JSON lixo / `proposed_action.type` inválido → 502.
- Loop: primeira resposta `tool_use` `search_guests`, segunda `end_turn` com JSON válido → 200; assertir que o client **executou** o selector (ou um fake da ferramenta) e **não** persistiu reserva.
- `preview_checkout` via ferramenta **não** muda `Reservation.status` nem posta `AccountLine`.
- Dois candidatos na ferramenta + modelo escolhendo um → response com `proposed_action: null`.
- Ferramenta com nome fora do catálogo (se o modelo inventar) → tratar como falha de turno (resultado de erro para o modelo ou abortar 502) — decidir na implementação; o teste documenta a escolha.
- OpenAPI: path novo, path velho removido.
- `preview_checkout` em `hotel.reservations` já tem (ou deve ter) teste de db **independente** de IA; não duplicar a regra em `ai/`.

Frontend:

- Status desligado → painel ausente.
- Enviar mensagem → `reply` na tela.
- `proposed_action: check_in` → botão dispara o mesmo caminho de check-in (mock de `@/features/reservations/api` ou o mock que a página já usa nos fluxos do dashboard).
- `proposed_action: null` → nenhum botão de gravar.
- Sem persistir nada via `features/ai`.

Não é necessário e2e Playwright contra a Anthropic. O e2e atual zera `ANTHROPIC_API_KEY` (`frontend/playwright.config.ts`).

O CI já roda `uv run lint-imports`: qualquer import `ai → billing` ou `hotel → ai` deve falhar o job.

---

## 4. O que reaproveitar vs. o que é novo

| Já existe | Novo |
|---|---|
| `ai/config.py` (chave, modelo, throttle, enabled) | Loop de tool use em `ai/client.py` (hoje é one-shot) |
| `AiDisabledError` / `AiUpstreamError` | `ai/tools.py`: registry nome → callable |
| `GET /api/ai/status/` | Serializers de request/response do copiloto e de cada tool input |
| httpx + parse de `content[].text` + strip de fence | UI no dashboard + wiring da ação → diálogos existentes |
| Feature flag no frontend | Prompt + catálogo + teto de rodadas + guarda de ambiguidade |
| Isolamento via import-linter; testes com FakeResponse | (talvez) helper de preview de check-in em `reservations.services`, sem mencionar IA |
| `guests.selectors.search_guests` | — |
| `reservations.selectors.guests_in_hotel` / `guests_pending_checkin` | — |
| **`reservations.services.preview_checkout`** | — (o “buraco” da versão anterior desta proposta **já foi fechado**) |
| `StatementSerializer`, `EarlyCheckinDialog`, `CheckoutStatementDialog`, `ReservationActions` | — |
| Gunicorn `-w 3 --threads 2` | Timeout global do loop (o runtime já não é 1 worker sync) |

Não reaproveitar: `SYSTEM_PROMPT` de extração de cadastro, `ParsedGuestSerializer`, `AiFillGuest`.

Não reintroduzir: `hotel.services.pricing` / `calculate_bill` chamado de `ai/` — o motor é `hotel.billing.engine`, e a costura do copiloto é `preview_checkout`.

---

## 5. Complexidade — decomposição para o avaliador

Estimativa de esforço humano (uma pessoa que já conhece o repo). Não é cronograma.

A arquitetura nova **baixou** a fatia de preview de checkout: a função dry-run que a proposta original pedia para criar **já está no domínio**.

| Fatia | O quê | Tamanho relativo | Notas |
|---|---|---|---|
| A. Registry + loop | client com `tools`, `stop_reason`, teto, timeout global | **Média-alta** | Coração novo. Fácil de fazer frágil (loop infinito, tokens, mensagens mal concatenadas). |
| B. Ferramentas de leitura | wrappers em cima de selectors + `preview_checkout` | **Baixa** | Recorte, limite de linhas, máscara de PII. |
| C. Preview check-in | extrair “é cedo?” sem persistir | **Baixa** | Não importar `engine` de `ai/`. |
| D. Preview checkout | — | **Quase zero** | `preview_checkout` + extras já existem. Teste: a ferramenta não escreve. |
| E. Contrato + views + OpenAPI | uma view, uns serializers | **Baixa** | Cópia do padrão `parse_guest`. |
| F. Testes de API do loop | fita de FakeResponse + caso de 2 João | **Média** | Mais combinatória que o teste atual. |
| G. UI dashboard + ação | painel + encadear diálogos | **Média** | Não duplicar a máquina de `allow_early`. `useDashboardDialog` hoje não tem `kind: 'early'`. |
| H. Remoção do parse-guest | backend + GuestForm + README §5.4 + guia | **Baixa** | Docs longos; limpeza documental é trabalho real. |
| I. Runtime | loop × threads do gunicorn | **Baixa agora** | Compose já usa `-w 3 --threads 2`. Ainda: uma conversa de 4 round-trips segura um thread por até dezenas de segundos — timeout global, não novo worker “porque IA”. |

**Leitura consolidada:** mais trabalhoso que o parse-guest por um fator de ~3–4 (loop + UI de ação + guarda de ambiguidade), **um pouco menos** do que a versão original desta proposta (não há que inventar dry-run de conta). Ainda **contido** se o v1 respeitar §2.2–2.5. Sai do “contido” se entrar chat com histórico, streaming, writes por ferramenta, filtro genérico ou cadastro/reserva via copiloto.

Comparado ao restante do produto: menor que auth/cookies/JWT; menor que o fatiamento billing × reservations; maior que qualquer feature atual de `ai/`.

---

## 6. Riscos e tensões (o avaliador deve pesar)

1. **Escopo vs. tese do README §8.** O briefing não pede IA. A tese é “briefing + evolução declarada”, qualidade acima de feature. `ARQUITECTURE.md` §8 e §10 **já nomeiam** o copiloto como evolução e apontam `preview_checkout` como costura — então não é um corpo estranho, desde que continue opcional e `hotel.*` sem ifs de IA.

2. **Dinheiro.** Qualquer valor dito no `reply` que não tenha saído de `preview_checkout` é regressão. O extrato agora tem **extras**; omitir extra no `reply` também mente. Decisão aberta: (a) o serializer só valida shape e o texto pode mentir; (b) o UI, se a ação é checkout, mostra um resumo montado do tool result / abre o statement. **(b) é mais sênior.**

3. **Thread preso no loop.** Mitigado em relação ao T12 antigo (1 worker sync). Continua síncrono; timeout global curto. Não reabrir Celery por causa disto.

4. **PII para provedor externo.** Hoje sai um parágrafo colado. Amanhã saem listas de quem está no hotel. Reescrever o aviso do README §5.4. Recortes mascaram documento/telefone.

5. **Alucinação de ação e ambiguidade.** Allowlist de ids **e** “N>1 candidato ⇒ `proposed_action` null” (§2.4). Sem a segunda guarda, dois João passam na primeira.

6. **Duplicação de UI de check-in cedo.** `ReservationActions` já trata `EARLY_CHECKIN`. O copiloto não ganha um segundo caminho de `allow_early`.

7. **Dependência Anthropic tool_use.** Continua httpx cru, sem SDK. O client fica maior.

8. **Primeiro import `ai → hotel.reservations`.** Hoje `ai` só vê `core`. Isso é o degrau de acoplamento que o grafo já prevê; o avaliador deve confirmar que **não** escorrega para `ai → billing.engine`.

---

## 7. Recortes menores (se a avaliação for “copiloto é grande demais”)

Ordem de “ainda chama atenção, menos risco”:

1. **Só explicar o extrato.** No checkout (ou a partir de `preview_checkout` antes de confirmar), `POST /api/ai/explain-statement/` devolve parágrafo. Sem tools, sem loop, sem dashboard novo. Demo: checkout atrasado com vaga no fim de semana. **Complexidade baixa.** Casa literalmente com `ARQUITECTURE.md` §10 (“copiloto de checkout consome `preview_checkout`”).

2. **Copiloto só leitura, sem `proposed_action`.** Tools + `reply`; o atendente usa as abas/botões que já existem. Some a fatia G. Ainda precisa da guarda de “não inventar quem é o João”. **Complexidade média.**

3. **Copiloto completo (esta proposta).** Tools + ação + preview.

Não recomendado como substituto: ampliar o parse-guest para a reserva inteira; busca NL das abas (duplica RF); visão de documento; filtro genérico por coluna.

---

## 8. Decisões em aberto (o implementador não deve inventar calado)

1. Remover parse-guest por completo, ou deixar morto um release? **Recomendação: remover.**
2. `search_guests`: `ai` importa `hotel.guests.selectors` (legal no linter, fura a seta única do diagrama) ou `reservations` ganha um wrapper? **Recomendação: wrapper ou chamada só via reservations, para o copiloto ter uma costura.**
3. Resposta final: o UI confia no `reply` ou monta números a partir do tool result?
4. Extração de `preview_checkin` (early) para `reservations.services` — sim ou a ferramenta duplica a comparação de horário? **Recomendação: extrair, espelhando `preview_checkout`.**
5. Timeout global do loop (sugerido: da ordem de 8–12s no request HTTP, não 10s × 4).
6. `proposed_action` no v1 só `check_in` | `checkout` | `null`? **Recomendação: sim.**
7. Conversa multi-turno com contexto? **Recomendação: não no v1.** Desambiguação = nova fala auto-contida.

Fechadas por esta revisão (não reabrir):

- Onde mora o dry-run de checkout: **`hotel.reservations.services.preview_checkout`**, já implementado.
- Workers do gunicorn: **já** `-w 3 --threads 2`; não é pré-requisito do copiloto.

---

## 9. Como avaliar (roteiro para o outro agente)

Devolver um parecer com estas seções, nesta ordem:

1. **Cabe neste repo?** Sim / não / sim com recorte N da §7. Fundamentar no README §8 **e** em `ARQUITECTURE.md` §8/§10 (o copiloto já é evolução nomeada; a costura já existe).
2. **Nível de complexidade** para o recorte que você recomenda: baixa / média / média-alta / alta. Separar backend, frontend, testes, docs. Confrontar a tabela da §5 — em especial que a fatia D não é mais “criar preview”.
3. **O que está certo** no desenho (vale manter).
4. **O que está errado ou subestimado** (loop, T12 residual, encaixe no `useDashboardDialog`, PII, ambiguidade, extras do livro).
5. **Acoplamento:** o copiloto força `ai → billing` ou `ai → rooms`? Quebra `lint-imports`? `hotel.*` ganha awareness de IA?
6. **Testabilidade** sem rede: o loop é testável com a fita de `FakeResponse` de `test_ai.py`? O caso de dois João está coberto?
7. **Risco para a demo do desafio:** o avaliador humano vê RF/RN cobertos com testes, ou vê um chat que pode falhar ao vivo?
8. **Veredito em uma frase** + **próximo passo** (não implementar / implementar recorte 1 / implementar esta proposta / implementar com as alterações X, Y, Z).

Não implementar nesta avaliação. Não expandir para agentes genéricos, RAG, embeddings, Celery, streaming, nem filtro genérico por coluna. Não contradizer: LLM não calcula dinheiro; LLM não persiste; feature flag pela chave; ambiguidade não escolhe um alvo.

---

## 10. Critério de pronto (se for implementado depois)

- Sem `ANTHROPIC_API_KEY`: produto idêntico ao núcleo; painel ausente.
- `hotel.*` sem imports de `ai/`; `ai/` sem imports de `hotel.billing` / `hotel.rooms`.
- `uv run lint-imports` verde.
- Check-in antes das 14h e checkout depois das 12h com vaga no fim de semana: a fala **confere** com `preview_checkout` / o statement, e o clique usa as views atuais.
- Dois hóspedes com o mesmo nome no hotel: `reply` lista os dois, **sem** botão.
- Suítes backend e frontend verdes; OpenAPI sem `parse-guest`.
- README §5.4 e o guia reescritos (aviso de PII: listas de ocupação saem para o provedor).
- Timeout global do loop documentado; uma conversa não prende a API inteira (runtime atual já tem 3 workers × 2 threads).

# Arquitetura

## 1. Propósito e estilo

Monólito Django modular com **camada de serviço** e um **núcleo funcional puro**
onde a correção precisa ser auditável: `hotel/billing/engine.py` calcula o
dinheiro sem ORM, sem I/O e sem relógio. Não é hexagonal e não é DDD: o domínio
importa Django de propósito, e a única fronteira isolada é a do motor
financeiro.

Quatro apps de domínio aninhados em `hotel/`, um por pergunta do domínio, cada
um com seus models, migrações e rotas. Toda mutação passa por um service; toda
leitura não trivial, por um selector. Autenticação e papéis (`ADMIN`/atendente)
ficam em `accounts/`, fora do domínio.

```
backend/
├── config/       settings, health, urls raiz (includes dos apps + auth, health, schema/docs)
├── core/         sem models: erros, envelope, money (quantize), serializers comuns
├── accounts/     CustomUser + Role; o atendente nasce do seed
├── hotel/        pacote agregador (`__init__.py` vazio): quatro apps, um por pergunta do domínio
│   ├── guests/       QUEM: cadastro, normalização de PII, busca
│   ├── rooms/        ONDE: inventário, capacidade, operação
│   ├── billing/      QUANTO: engine.py (PURO) · PricingPolicy · Account/AccountLine/Payment
│   └── reservations/ QUANDO: agenda, transições, extrato, seed_demo
├── ai/           a Íris: importa só hotel.reservations e core/
└── tests/{unit,db,api}/

frontend/src/
├── app/          casca: providers, router, AppLayout, SessionGate
├── pages/        uma pasta por rota (Página.tsx + testes + index.ts)
├── lib/          sem UI: api, auth, errors, format, forms, hooks, notify, routing, utils
├── components/   ui/ (shadcn vendorizado) · common/ (DataTable, PageHeader, …) · ErrorBoundary/
├── features/     {auth,guests,reservations,rooms,pricing,ai}: api · hooks · schemas · components
└── test/         setup do Vitest, fixtures e helpers de render (renderPage, renderWithProviders)
```

## 2. Pacotes e camadas

| Pacote                | Responsabilidade                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `config/`             | settings, urls raiz, health. Só inclui; não conhece regra.                                                           |
| `core/`               | erros de domínio, envelope HTTP, `quantize_money`, serializers e tags comuns. Sem models.                            |
| `accounts/`           | `CustomUser`, papéis, login por cookie httpOnly, `IsHotelAdmin`.                                                     |
| `hotel.guests`        | **quem**: cadastro, normalização de PII, busca por fragmento.                                                        |
| `hotel.rooms`         | **onde**: inventário, capacidade, operação.                                                                          |
| `hotel.billing`       | **quanto**: tarifa versionada, motor de cálculo e o livro da conta.                                                  |
| `hotel.reservations`  | **quando**: agenda, estadia, transições e extrato.                                                                   |
| `ai/`                 | a Íris, copiloto opcional: laço de *tool use* sobre leituras do domínio. Importa só `hotel.reservations` e `core`.   |
| `tests/{unit,db,api}` | motor puro · PostgreSQL real · API ponta a ponta.                                                                    |

Dentro de cada app: `models` → `selectors` → `services` (recebem `now`/`today`
por parâmetro) → `serializers` → `views` (único lugar que lê o relógio) →
`urls`. `config/urls.py` inclui `hotel.reservations` **antes** de `guests` e
`rooms`: as leituras cruzadas moram em `reservations`, e o detail
`/guests/{pk}/` casa `[^/.]+`, engolindo `/guests/in-hotel/`.

No frontend as camadas são `lib → components → features → pages → app`,
cobradas por `no-restricted-imports` no ESLint: `lib` não importa ninguém,
`components` não importa features nem páginas, nenhuma feature alcança `pages`
ou `app`, e uma página não alcança `app`.

## 3. Grafo de dependências

```text
ai  ->  hotel.reservations  ->  hotel.guests | hotel.rooms | hotel.billing  ->  core | accounts
                            ^
        hotel.rooms.services --+ (única exceção: guardas de leitura da agenda)
```

Irmãos na mesma faixa não se importam, e nada em `hotel.*` importa `ai` ou
`config`. Um contrato `forbidden` fecha o outro lado: `ai` só alcança
`hotel.reservations`, a fachada das leituras cruzadas, nunca `billing`, `rooms`
ou `guests` direto (`allow_indirect_imports`, porque a cadeia via
`reservations` é legítima). `billing` não conhece nenhum irmão: a conta não
sabe que existe reserva.

A única exceção é `hotel.rooms.services → hotel.reservations.selectors`:
desativar ou excluir um quarto e reduzir capacidade precisam ler a agenda, e o
selector encapsula os status para que `rooms` não conheça o ciclo de vida da
reserva. O contrato vive em `backend/pyproject.toml` (`[tool.importlinter]`) e
o CI roda `uv run lint-imports`.

## 4. Domínios e invariantes de banco

Constraint nomeada é contrato: `core.errors.translate_integrity_error` casa o
`IntegrityError` pelo nome da constraint e devolve o erro de domínio registrado
para ela: `409 DUPLICATE_DOCUMENT` (`guest_document_unique`),
`409 ROOM_UNAVAILABLE` (`resv_room_no_overlap`) e `400 VALIDATION_ERROR` por
campo (`room_number_unique`).

| App            | Modelos                             | Constraints nomeadas                                                                                                                                                         | Autoridade                                    |
| -------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `guests`       | `Guest`                             | `guest_document_unique`                                                                                                                                                      | documento normalizado alfanumérico            |
| `rooms`        | `Room`                              | `room_number_unique`, `room_capacity_positive`                                                                                                                               | `capacity` freia o tamanho do grupo           |
| `billing`      | `PricingPolicy`                     | `policy_money_non_negative`, `policy_checkout_before_checkin`                                                                                                                | append-only; `effective_from`                 |
| `billing`      | `Account`, `AccountLine`, `Payment` | `account_closed_is_complete`, `account_total_non_negative`, `accountline_one_per_kind_date`, `accountline_quantity_non_negative`, `accountline_money_non_negative`, `payment_amount_non_negative` | `AccountLine.amount` e `Account.total_amount` |
| `reservations` | `Reservation`                       | `resv_checkout_after_checkin`, `resv_room_no_overlap` (EXCLUDE), `resv_one_active_per_room`, `resv_one_active_per_guest`, `resv_active_has_policy`, `resv_checked_out_complete`, `resv_account_matches_status` | status ⇔ conta                                |

`AccountLine` não tem CHECK aritmético ligando `amount` a
`quantity × unit_amount`: um fator como 0.3333 não fecha em `numeric`. `amount`
é a autoridade; os outros dois explicam como se chegou nela.

A tarifa do desafio (120/180/15/20, multa 50%, 14:00/12:00) tem três fontes
que precisam concordar: `hotel/billing/migrations/0001_initial.py` (bootstrap),
`backend/conftest.py` (fixture da suíte) e `engine.DEFAULT_RATES`.

## 5. Ciclo estadia × conta

| Momento         | O que acontece                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| check-in        | `billing.open_account(now=…)` na mesma transação do flip de status; `Reservation.account` OPEN                     |
| checkout        | `post_lines` (diárias, vaga, multa) + `close_account` na mesma transação do flip                                  |
| pagamento       | `register_payment`: `Payment` 1:1, conta vai a PAID; a reserva segue CHECKED_OUT                                  |
| a qualquer hora | `preview_checkout(reservation, now=…)` calcula sem lock e sem escrita; é a costura que a Íris consome             |

`statement()` hidrata das linhas gravadas e **nunca** chama o motor: o recibo
de uma estadia encerrada é um fato, não um recálculo. `calculate_bill` tem dois
chamadores: `_bill_for` (por trás de `check_out` e `preview_checkout` — o mesmo
cálculo com e sem efeito, e só `check_out` escreve) e `quote_scheduled_stay`,
que estima a estadia antes de existir reserva assumindo saída no limite, logo
nunca antecipa multa. Ordem de lock: **Guest (pk asc) → Room → Reservation →
Account**. `billing` não importa `reservations` e não registra admin: livro
append-only não se edita pela tela.

## 6. Invariantes do código

1. **Dinheiro é `Decimal`, sempre.** Nunca `float`, em lugar nenhum: o CI
   recusa `float(` em `backend/hotel`, `backend/accounts`, `backend/core` e
   `backend/ai`. `core.money.quantize_money` é o único ponto de arredondamento
   (meia unidade para cima). A API troca dinheiro como string decimal
   (`"120.00"`); o frontend só formata, e o CI recusa `Number(`, `parseFloat` e
   afins onde há dinheiro.
2. **Relógio injetável.** Regra de horário recebe `now`/`today` como parâmetro:
   a view injeta `timezone.now()`, o teste injeta o que quiser. `USE_TZ`
   ligado, fuso `America/Sao_Paulo`, banco em UTC, e **toda** comparação de
   regra (14h, 12h) acontece em hora local.
3. **Camadas, sem exceção.** Models enxutos → `selectors.py` (leitura) →
   `services.py` (**toda** mutação e todo dinheiro) → serializers (I/O) → views
   finas. View nunca calcula dinheiro, model nunca conhece request, serializer
   nunca lê o relógio.
4. **O cálculo mora no backend.** Nenhum teste de frontend re-prova
   aritmética: os fixtures são cópia literal da tabela T1–T9.

## 7. Contrato HTTP

Base `/api/`. Rotas de negócio com `Authorization: Bearer <access>` (JWT de 60
min, **em memória no cliente**). O refresh não trafega em JSON: sai num cookie
`HttpOnly; SameSite=Strict; Path=/api/auth/` (mais `Secure` atrás de TLS, via
`COOKIE_SECURE=1`; a demo em http usa `0`), e o `exp` fixado no login é o teto
de 12 h. As duas rotas que se autenticam por esse cookie exigem `X-CSRFToken`;
as de negócio não, porque header não é credencial ambiente.

Não existe CORS: tudo é a mesma origem, porque o Vite faz proxy de `/api` para o
backend (`VITE_API_PROXY_TARGET`) e, em produção, o Caddy encaminha `/api*` para
o Django e o resto para o nginx do SPA. O proxy repassa o `Origin` do navegador,
por isso `CSRF_TRUSTED_ORIGINS` continua obrigatória.

Datas `YYYY-MM-DD`; dinheiro sempre **string decimal**; paginação DRF
(`page_size=20`). A listagem de reservas ordena por `ordering=` (`checkin_date`
ou `checkout_date`, com `-` para inverter) e desempata por id, para a paginação
não repetir nem perder linha sobre datas iguais.

| Método & rota                                                             | Auth      | Função                                                                                      |
| ------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `POST /api/auth/token/`                                                   | pública   | Login → `{access}` no corpo + refresh no cookie                                             |
| `POST /api/auth/token/refresh/`                                           | pública   | Renova pelo cookie (exige `X-CSRFToken`)                                                    |
| `POST /api/auth/logout/`                                                  | pública   | Revoga na denylist e apaga o cookie (exige `X-CSRFToken`)                                   |
| `GET /api/auth/me/`                                                       | ✔         | `{id, username, role}`: o papel vem do servidor                                             |
| `GET /api/health/`                                                        | pública   | `{"status":"ok"}` (healthcheck do Compose)                                                  |
| `GET /api/guests/` · `POST`                                               | ✔         | Lista + busca (`?search=`) / cadastro                                                       |
| `GET /api/guests/{id}/`                                                   | ✔         | Detalhe (valor gravado, não mascarado)                                                      |
| `GET /api/guests/in-hotel/`                                               | ✔         | **RF4**: `CHECKED_IN`; `?search=` compõe com o status                                       |
| `GET /api/guests/pending-checkin/`                                        | ✔         | **RF5**: `PENDING`, inclui vencidas (RN19)                                                  |
| `GET /api/reservations/` · `POST`                                         | ✔         | Lista (`?status=&guest=&paid=&search=&checkin_date=&checkout_date=&ordering=`) / criação    |
| `GET /api/reservations/{id}/`                                             | ✔         | Detalhe, com a conta aninhada em `account`                                                  |
| `POST /api/reservations/{id}/companions/` · `DELETE …/companions/{guest_id}/` | ✔     | Acompanhantes, só em `PENDING` (RN22)                                                       |
| `POST /api/reservations/{id}/check-in/`                                   | ✔         | **RF6**: `{allow_early}` (RN11)                                                             |
| `POST /api/reservations/{id}/checkout/`                                   | ✔         | **RF7**: efetiva e devolve o extrato (**RN6**)                                              |
| `POST /api/reservations/{id}/cancel/`                                     | ✔         | `PENDING → CANCELLED` (RN17)                                                                |
| `POST /api/reservations/{id}/pay/`                                        | ✔         | Registra o pagamento único (RN15)                                                           |
| `GET /api/reservations/{id}/statement/`                                   | ✔         | 2ª via do extrato (só `CHECKED_OUT`)                                                        |
| `GET /api/rooms/` · `/{id}/` · `/available/`                              | ✔         | Inventário (`?search=` no número; só ativos, `?is_active=false` inclui desativados; `is_occupied` = hóspede `CHECKED_IN` agora) e disponibilidade (`/available/?checkin_date=&checkout_date=&people=`) |
| `POST /api/rooms/` · `PATCH /api/rooms/{id}/` · `DELETE /api/rooms/{id}/` | **admin** | Cadastro, ajuste de capacidade/situação e exclusão (só sem histórico de reserva)            |
| `GET /api/pricing-policies/` · `/current/`                                | ✔         | Histórico e tarifa vigente                                                                  |
| `GET /api/pricing-policies/quote/`                                        | ✔         | Estimativa de uma estadia agendada (`?checkin_date=&checkout_date=&has_vehicle=`)           |
| `POST /api/pricing-policies/`                                             | **admin** | Publica tarifa (append-only; vigência = agora)                                              |
| `GET /api/ai/status/` · `POST /api/ai/copilot/`                           | ✔         | A Íris (§10)                                                                                |
| `GET /api/schema/` · `/api/docs/`                                         | pública   | OpenAPI 3 + Swagger UI                                                                      |

A reserva expõe `account` aninhado (`null` fora de CHECKED_IN e CHECKED_OUT),
com `status`, `total_amount`, `opened_at`, `closed_at` e `payment`. O extrato
traz `lines`, `subtotal_daily`, `subtotal_parking`, `late_fee`, `total` e
`payment {paid_at, method, received_by}`. `?paid=true` filtra conta `PAID`;
`?paid=false` é o complemento, e inclui reserva sem conta.

Todo erro sai no **mesmo envelope**, para o cliente ramificar por código e
nunca por texto:

```json
{ "code": "EARLY_CHECKIN", "detail": "Check-in permitido a partir das 14:00.", "extra": { "server_time": "13:45", "opens_at": "14:00" } }
```

| Código               | HTTP | Quando                                                                                                                                  |
| -------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`   | 400  | Payload inválido (`extra` = erros por campo)                                                                                            |
| `NOT_AUTHENTICATED`  | 401  | Token ausente ou expirado                                                                                                               |
| `PERMISSION_DENIED`  | 403  | Atendente em rota restrita ao `ADMIN`                                                                                                   |
| `CSRF_FAILED`        | 403  | Rota de cookie sem `X-CSRFToken` válido, ou `Origin` fora da lista                                                                      |
| `NOT_FOUND`          | 404  | Recurso inexistente                                                                                                                     |
| `EARLY_CHECKIN`      | 409  | Check-in antes da abertura, sem `allow_early` (RN11). `extra`: `server_time`, `opens_at`                                                |
| `INVALID_STATUS`     | 409  | Transição ilegal, hóspede já hospedado, conta já paga (`extra.paid_at`), ou quarto com reserva (ativa na desativação; qualquer histórico na exclusão) |
| `DUPLICATE_DOCUMENT` | 409  | Documento já cadastrado (RN24)                                                                                                          |
| `ROOM_UNAVAILABLE`   | 409  | Agenda cruzada, quarto ainda ocupado, ou chegada antecipada que tomaria o quarto (RN20)                                                 |
| `THROTTLED`          | 429  | Login 10/min e refresh 60/min por IP; Íris 20/min por usuário                                                                           |
| `AI_UPSTREAM_ERROR`  | 502  | Provedor de IA indisponível ou resposta inutilizável                                                                                    |
| `AI_DISABLED`        | 503  | Íris sem chave configurada                                                                                                              |

O contrato navegável, com exemplos de request, resposta e erro de cada rota,
está no Swagger (`/api/docs/`).

## 8. Frontend: erros, formulários e contrato

**Cada falha tem um lugar na tela, e só um.** O roteamento está em
`frontend/src/lib/api/queryClient.ts`:

| Falha                                     | Onde aparece                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Validação de campo                        | No campo culpado (`aria-invalid` + mensagem, com a dica de formato ainda visível)     |
| `409 EARLY_CHECKIN`                       | Diálogo com a hora do servidor e botão de confirmar (RN11)                            |
| Mutation que nenhuma tela apresenta       | Toast — nunca boundary, que apagaria o que o atendente digitou                        |
| Erro de render, e `5xx` na 1ª carga        | ErrorBoundary; o da tabela é local, e mantém header, "Novo hóspede" e diálogos vivos |
| `4xx` e backend fora do ar                | Inline, com retry: recarregar a aplicação não traz o servidor de volta                |
| `401`                                     | Interceptor, não a tela que pediu: toast de sessão expirada, cache limpo, login       |

**Formulários.** Login, cadastro de hóspede e criação de reserva usam
**react-hook-form + zod**, com um schema por feature
(`frontend/src/features/<x>/schemas.ts`) que espelha as regras do servidor:
documento com ≥ 4 alfanuméricos e telefone internacional válido (RN24), entrada
não anterior a hoje e mínimo de 1 noite (RN16). O servidor continua
**autoritativo**: o `400 VALIDATION_ERROR` é remapeado campo a campo, e chave
que o formulário não declara (`non_field_errors`, `detail`) vai ao alerta de
topo em vez de sumir.

**Contrato validado em runtime.** Toda resposta da API passa por um schema zod
antes de chegar à tela, e dinheiro só é aceito como string decimal de duas casas
(`frontend/src/lib/api/schemas.ts`). Desvio de contrato vira `CONTRACT_ERROR`
visível, nunca um total plausível e errado na conta do hóspede.

## 9. Segurança, e o que continua em aberto

Em uma linha cada: JWT com permissão global fechada (`IsAuthenticated`) e
exceções explícitas; documento e telefone em claro normalizado, busca por
fragmento, PII fora de log; CSP estrita **nas respostas do Django**, montada por
middleware, com isenção pontual só na página do Swagger; headers de nosniff,
referrer-policy e clickjacking; imagens Docker do backend e do frontend de
desenvolvimento como usuário **non-root** (o nginx de produção e o Caddy sobem
como root, padrão das imagens oficiais); assets do Swagger servidos localmente.

**Nenhuma credencial mora em disco.** O access fica numa variável de módulo
(`frontend/src/lib/auth/session.ts`) e morre com a aba; o refresh vai num cookie
`HttpOnly; SameSite=Strict; Path=/api/auth/` (e `Secure` atrás de TLS) que o
navegador só anexa às duas rotas de sessão. Há teste em cada camada afirmando
que `localStorage` e `sessionStorage` ficam vazios. `POST /auth/logout/` revoga
o refresh na denylist, e o teto absoluto de sessão sai sem código próprio: o
`exp` fixado no login é o prazo, e renovar não o estende. O CSRF fica confinado
às rotas de cookie — rota autenticada por `Bearer` é imune por construção, já
que o navegador não anexa header sozinho.
[concepts/AUTH.md](./concepts/AUTH.md) explica cada decisão, incluindo por que a
denylist não foi para o Redis e por que a rotação de refresh foi recusada.

**Em aberto:** a CSP não cobre o documento HTML da aplicação, porque quem o
serve é o Vite (ou o nginx do compose de produção) e o cabeçalho vem do
middleware do Django. Com XSS ativo na página, `HttpOnly` impede a exfiltração
do refresh, não o abuso da sessão com a aba aberta. Uma CSP própria no servidor
do SPA é o próximo passo.

## 10. Íris

`ai/` hospeda a Íris: `POST /api/ai/copilot/` roda um laço de *tool use* contra
a Responses API da OpenAI (httpx cru, sem SDK) em que o modelo **pede** a
consulta e o Django a executa pelos mesmos selectors e serviços das telas.
Quatro leituras (`find_reservations`, `preview_checkout`, `available_rooms`,
`revenue_summary`) e uma função terminal `answer`, de onde a resposta sai
estruturada. Escrita, nenhuma: a ação proposta volta como um botão que chama os
endpoints de check-in e de checkout de sempre.

Saída de modelo é input não confiável em três frentes: **argumentos** validados
por serializer (erro volta ao modelo como resultado, não como 502);
**identidade** conferida contra um resultado real, isolado; **status** relido
antes de a ação sair. Orçamento de 15 s e no máximo sete rodadas; na última o
`tool_choice` força `answer`. Como `ai` importa um único app de domínio (§3),
desligar a chave ou apagar o pacote remove a feature sem tocar em regra de
negócio. O que ela faz e o que sai para o provedor:
[concepts/IRIS.md](./concepts/IRIS.md). O código, passo a passo:
[code/IRIS-CODE.md](./code/IRIS-CODE.md).

## 11. Testes e CI

`tests/unit` prova o motor puro sem banco; `tests/db` prova constraints,
services e selectors contra PostgreSQL real; `tests/api` prova o contrato HTTP
ponta a ponta. O job de backend roda, nesta ordem: guarda de `float(`,
`ruff check`, `lint-imports`, `makemigrations --check --dry-run` e `pytest` com
piso de 85% sobre `hotel`, `accounts`, `core` e `ai`. O job de frontend roda os
passos de `pnpm run check` um a um, mais as guardas de dinheiro, de ids
normativos e de pinos de cobertura; o de e2e sobe o backend real com o seed.
Doutrina e ferramental: [concepts/QUALITY.md](./concepts/QUALITY.md). A matriz
requisito → teste: [CHALLENGE.md](./CHALLENGE.md).

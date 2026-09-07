# Gestão de Hóspedes de Hotel

Sistema de recepção para o balcão de um hotel: cadastro de hóspedes, reservas,
localização por nome/documento/telefone, check-in com alerta antes das 14h e
checkout com extrato detalhado — diária a diária, taxa de vaga e multa de saída
após as 12h.

**Stack:** Python 3.13 · Django 5.2 LTS · DRF · PostgreSQL 17 · React 18 · Vite ·
TypeScript · Tailwind · Base UI (shadcn) · `uv` · Docker Compose · Playwright.

|                              |                                                             |
| ---------------------------- | ----------------------------------------------------------- |
| Aplicação                    | <http://localhost:5173>                                     |
| API                          | <http://localhost:8000/api/>                                |
| Swagger (contrato navegável) | <http://localhost:8000/api/docs/>                           |
| Credenciais do seed          | `atendente` / `atendente123` · `admin` / `admin123`         |

---

## 1. Subir

Pré-requisitos: **Docker** com Compose v2 e `git`. Nem Python, nem Node, nem
PostgreSQL na máquina.

```bash
git clone https://github.com/felipemalli/hotel-management.git
cd hotel-management
cp .env.example .env

# gere a SECRET_KEY e cole no .env (sem python3 na máquina: ver docs/COMO-RODAR.md)
python3 -c "import secrets; print(secrets.token_urlsafe(50))"

docker compose up --build
```

O Compose encadeia `migrate → createcachetable → collectstatic → seed_demo →
gunicorn` sem nenhum script `.sh` no repositório, e o frontend espera o
healthcheck do backend. Ao fim, o log do seed imprime as credenciais.

> Subindo sobre um volume antigo, rode `docker compose down -v` antes: o
> esquema mudou (quarto e nacionalidade obrigatórios).

**Produção num único host (EC2).** O `docker-compose.yml` é a demo (Vite na
5173, `seed_demo` no boot, portas do banco publicadas). No servidor:

```bash
# no .env: SECRET_KEY, COOKIE_SECURE=1, ALLOWED_HOSTS e CSRF_TRUSTED_ORIGINS
# do dominio (ou deixe COOKIE_SECURE=0 e DOMAIN=:80 para HTTP no IP da VM)
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml exec backend uv run python manage.py seed_demo
```

Caddy na 80/443 faz o papel do proxy do Vite (`/api` e `/static` → Django, o
resto → SPA). Postgres e Redis não saem na internet. Variáveis: `.env.example`.

**Porta 5432 ocupada, execução sem Docker, matriz completa de variáveis de
ambiente e um roteiro de demonstração de 5 minutos:**
[`docs/COMO-RODAR.md`](docs/COMO-RODAR.md).

### Dados de demonstração

O seed é idempotente e usa **datas relativas** — o cenário é válido em qualquer
dia. Ele nunca escreve `status` na mão: as transições passam pelos mesmos
services que a API usa, com o relógio injetado.

| Hóspede         | Situação                                              | Demonstra                                    |
| --------------- | ----------------------------------------------------- | -------------------------------------------- |
| **Ana Souza**   | `PENDING`, entrada hoje, com veículo                  | aba "Check-in pendente" e o fluxo de check-in |
| **Bruno Lima**  | `CHECKED_IN` no quarto 102, com a acompanhante Eva    | aba "No hotel", checkout, acompanhantes (D19) |
| **Eva Lima**    | Acompanhante do Bruno, argentina (`+54 11 5555-4444`) | telefone com DDI estrangeiro                  |
| **Carla Nunes** | `CHECKED_OUT` sex→dom, com vaga, saída 12:01          | extrato com diária de fds **e** multa de 90,00 |
| **Davi Rocha**  | Sem reserva                                           | busca por nome, documento e telefone          |

Quatro quartos — 101 (cap. 2), 102 (2), 103 (3), 201 (4). A capacidade é o
único freio ao número de pessoas numa reserva (D17).

Os dois usuários do seed são **usuários comuns** (`is_staff=False` nos dois): o
papel `ATTENDANT`/`ADMIN` é do produto e decide o acesso às rotas
administrativas. **O admin do Django não está instalado** — ele seria uma porta
que grava na base sem passar por service nenhum. Para inspecionar dados, use o
Swagger ou `docker compose exec db psql`.

---

## 2. Verificar

```bash
# backend — comando canônico, com o piso de cobertura
docker compose exec backend uv run pytest --cov=hotel --cov=accounts --cov=core --cov=ai --cov-fail-under=85 -q

# grafo de dependências entre os apps (o mesmo contrato que o CI cobra)
docker compose exec backend uv run lint-imports

# frontend — typecheck · lint · format:check · test:coverage · build
cd frontend && pnpm run check

# e2e — sobe gunicorn e Vite sozinho, contra o banco real
cd frontend && pnpm exec playwright install chromium && pnpm run e2e
```

Três suítes de backend (unitários puros do motor financeiro, testes de banco
com PostgreSQL real, testes de API ponta a ponta), Vitest + Testing Library no
frontend e Playwright contra o backend real. **Nenhum teste toca a rede**, e
isso é fiscalizado: dois fixtures `autouse` no `conftest.py` zeram a
`OPENAI_API_KEY` e bloqueiam o `httpx.post` na suíte inteira.

Doutrina de teste, política de cobertura e o ferramental do CI:
[`docs/QUALIDADE.md`](docs/QUALIDADE.md).

---

## 3. Rastreabilidade: cada requisito do briefing → a prova

Esta é a seção que responde "o que foi pedido está feito?". Os ids são
**normativos**: um arquivo pode mudar de pasta, mas o nome do arquivo e o id do
caso não mudam sem que esta matriz mude primeiro. O CI a guarda com um teste
próprio — ela não pode divergir do código sem que a suíte quebre.

| ID  | Requisito do briefing               | Prova backend                                     | Prova frontend                                     | e2e                     |
| --- | ----------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| RF1 | Cadastro persistente de hóspede     | `test_create_guest_persists_normalized_pii`       | `GuestForm.test.tsx::test_requires_name_document_phone`     | `reception.spec.ts`     |
| RF2 | Reservas persistentes               | `test_create_reservation_persists_pending`        | `ReservationForm.test.tsx::test_submits_dates_and_vehicle_flag` | `reception.spec.ts` |
| RF3 | Localizar por nome, documento, tel. | `test_search_name_fragment` e afins               | `GuestTable.test.tsx::test_search_input_debounces_and_queries` | `reception.spec.ts`  |
| RF4 | Hóspedes ainda no hotel             | `test_in_hotel_only_checked_in`                   | `GuestTable.test.tsx::test_tab_in_hotel_switches_dataset`   | —                       |
| RF5 | Com reserva, sem check-in           | `test_pending_checkin_lists_pending`              | `GuestTable.test.tsx::test_tab_pending_switches_dataset`    | `reception.spec.ts`     |
| RF6 | Atendente realiza o check-in        | `test_checkin_after_14_succeeds`                  | `EarlyCheckinFlow.test.tsx::test_checkin_success_updates_row` | `reception.spec.ts`   |
| RF7 | Atendente realiza o checkout        | `test_checkout_freezes_totals`                    | `CheckoutStatementDialog.test.tsx::test_T7_full_statement`  | `reception.spec.ts`, `checkout.spec.ts` |
| RF8 | Login                               | `test_login_returns_access_and_sets_refresh_cookie` | `ProtectedRoute.test.tsx::test_redirects_anonymous_to_login` | `login.spec.ts`, `admin.spec.ts` |
| RN1 | Diária útil R$ 120,00               | `test_truth_table[T1]`, `[T4]`                    | `test_T1_no_late_fee_line`                         | `checkout.spec.ts`      |
| RN2 | Diária de fim de semana R$ 180,00   | `test_truth_table[T2]`                            | `test_T7_full_statement`                           | `checkout.spec.ts`      |
| RN3 | Vaga R$ 15,00 / R$ 20,00            | `test_truth_table[T2]`, `[T3]`, `[T9]`            | `test_T7_full_statement`                           | `checkout.spec.ts`      |
| RN4 | Check-in a partir das 14h, c/ alerta | `test_early_checkin_boundaries`                  | `test_409_opens_dialog_and_retry_allow_early`      | `reception.spec.ts` (fronteira 14h não afirmada — relógio real) |
| RN5 | Checkout até 12h, multa de 50%      | `test_truth_table[T5]`, `[T7]`, `[T8]`            | `test_T7_full_statement`                           | `checkout.spec.ts`      |
| RN6 | Extrato detalhado no checkout       | `test_checkout_statement_matches_T7`              | `test_T7_full_statement`                           | `checkout.spec.ts`      |

`describe(...)` no frontend carrega a mesma tag, então dá para rodar uma fatia:
`pnpm test -- --run -t "RN5"`.

---

## 4. As regras de negócio em números

Calendário de referência **março/2025** (03=seg … 08=sáb, 09=dom, 10=seg). Esta
tabela é a fonte da verdade do dinheiro e é replicada **1:1** em
`backend/tests/unit/test_pricing.py` e em
`frontend/src/features/reservations/__fixtures__/bills.ts` — divergência entre
os três quebra a suíte.

| ID  | Check-in real | Checkout real       | Vaga | Diárias         | Vaga R$ | Multa | **TOTAL**  |
| --- | ------------- | ------------------- | ---- | --------------- | ------- | ----- | ---------- |
| T1  | Seg 03 15:00  | Qua 05 11:00        | Não  | 120+120=240     | 0       | 0     | **240,00** |
| T2  | Sáb 08 14:00  | Seg 10 10:00        | Sim  | 180+180=360     | 40      | 0     | **400,00** |
| T3  | Sex 07 16:00  | Seg 10 11:30        | Sim  | 120+180+180=480 | 55      | 0     | **535,00** |
| T4  | Ter 04 14:00  | Qui 06 **11:59**    | Não  | 240             | 0       | 0     | **240,00** |
| T5  | Ter 04 14:00  | Qui 06 **12:01**    | Não  | 240             | 0       | 60    | **300,00** |
| T6  | Sex 07 15:00  | Dom 09 **11:59**    | Não  | 120+180=300     | 0       | 0     | **300,00** |
| T7  | Sex 07 15:00  | Dom 09 **12:01**    | Sim  | 300             | 35      | 90    | **425,00** |
| T8  | Qua 05 18:00  | Sex 07 **12:00:00** | Não  | 240             | 0       | 0     | **240,00** |
| T9  | Seg 03 14:00  | Seg 03 18:00        | Sim  | mínimo 1: 120   | 15      | 60    | **195,00** |

Fronteiras que o briefing deixa em aberto e que os testes fixam: **12:00:00 em
ponto é isento** de multa (T8) e o check-in abre em **14:00:00** (13:59:59 →
`409 EARLY_CHECKIN`).

O briefing tem ambiguidades reais — como contar diárias, qual tarifa aplica em
cada uma, o que acontece às 12h em ponto. Cada uma foi resolvida com um id
citável (D1–D19), a leitura alternativa rejeitada e **o caso numérico em que as
duas divergem**: [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 5. Escopo: o que o briefing pede, e o que foi além

O briefing pede oito requisitos funcionais e seis regras de negócio. Os catorze
estão construídos, testados e rastreados na matriz da seção 3.

Além deles, sete expansões entraram — **nenhuma por antecipação**. Cada uma
resolve um problema que o próprio briefing cria, e cada uma tem tela e teste:

| Expansão                                    | O problema do briefing que ela resolve                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Room` + anti-overbooking (D16)             | "Realizar reservas" sem inventário reserva o quê? Sem quarto, duas reservas ocupam o mesmo lugar e nada impede. |
| `PricingPolicy` amarrada no check-in (D15)  | Onde vivem 120/180/15/20? Como constante, mudar a tarifa reescreveria a 2ª via de um extrato já emitido.        |
| Ator em cada transição (`checked_in_by`, …) | "Permitir ao atendente" pressupõe saber **qual** atendente. Uma coluna e um `*_at` por transição.               |
| Pagamento único da conta fechada (D18)      | "Total geral **a ser paga**" implica um fato de recebimento; sem ele o extrato nunca fecha.                     |
| Titular + acompanhantes (D19)               | "Localizar hóspedes que estão no hotel" — um número de pessoas não é uma pessoa, e não apareceria em busca.     |
| Nacionalidade e telefone com DDI (D9)       | "Localizar por telefone" exige normalizar; sem o `+`, `119…` é lido como EUA e o hóspede nunca volta ao dono.  |
| Papéis `ATTENDANT` / `ADMIN`                | Cadastrar quarto e publicar tarifa não são gestos de balcão.                                                   |

E uma **oitava, opcional e desacoplada**: a [Íris](docs/IRIS.md), copiloto que
responde em linguagem natural pedindo consultas ao Django, uma por vez, sem
nunca gravar nada. Desligada sem `OPENAI_API_KEY`, e removível por construção —
o núcleo do sistema não sabe que ela existe, e o import-linter cobra isso.

**O que ficou deliberadamente fora:** tarifa por quarto e vigência futura
agendada, troca de quarto no meio da estadia, estorno e pagamento parcial,
edição/exclusão de hóspede ou reserva via API (registros imutáveis após a
criação, exceto transições — o briefing pede armazenar e localizar, não
editar), no-show automático (D14), gestão de usuários via API, recuperação de
senha, Celery/Redis, WebSockets, i18n, multi-tenancy, tema dark, Storybook,
hexagonal, DDD tático, CQRS. O gatilho de cada um está em
[`ARCHITECTURE.md`](ARCHITECTURE.md); nenhum deles adicionaria ponto na
avaliação, e todos adicionariam superfície de bug.

---

## 6. API

Base `/api/`. Rotas de negócio com `Authorization: Bearer <access>` (JWT de 60
min, **em memória no cliente**). O refresh não trafega em JSON: sai num cookie
`HttpOnly; Secure; SameSite=Strict; Path=/api/auth/`, e o `exp` fixado no login
é o teto de 12 h — renovar não estende a sessão. As duas rotas que se
autenticam por esse cookie exigem `X-CSRFToken`; as de negócio não, porque
header não é credencial ambiente. Datas `YYYY-MM-DD`; dinheiro sempre **string
decimal** (`"120.00"`) — o frontend formata, nunca calcula. Paginação DRF
(`page_size=20`). A listagem de reservas ordena por `ordering=` — `checkin_date`
ou `checkout_date`, com `-` para inverter — e desempata por id, para a paginação
não repetir nem perder linha sobre datas iguais.

| Método & rota                                       | Auth      | Função                                                       |
| --------------------------------------------------- | --------- | ------------------------------------------------------------ |
| `POST /api/auth/token/`                             | —         | Login → `{access}` no corpo + refresh no cookie              |
| `POST /api/auth/token/refresh/`                     | —         | Renova pelo cookie (exige `X-CSRFToken`)                     |
| `POST /api/auth/logout/`                            | —         | Revoga na denylist e apaga o cookie (exige `X-CSRFToken`)    |
| `GET /api/auth/me/`                                 | ✔         | `{id, username, role}` — o papel vem do servidor             |
| `GET /api/health/`                                  | —         | `{"status":"ok"}` (healthcheck do Compose)                   |
| `GET /api/guests/` · `POST`                         | ✔         | Lista + busca (`?search=`) / cadastro                        |
| `GET /api/guests/{id}/`                             | ✔         | Detalhe (valor gravado, não mascarado)                       |
| `GET /api/guests/in-hotel/`                         | ✔         | **RF4** — `CHECKED_IN`; `?search=` compõe com o status       |
| `GET /api/guests/pending-checkin/`                  | ✔         | **RF5** — `PENDING`, inclui vencidas (D14)                   |
| `GET /api/reservations/` · `POST`                   | ✔         | Lista (`?status=&guest=&paid=&search=&checkin_date=&checkout_date=&ordering=`) / criação |
| `GET /api/reservations/{id}/`                       | ✔         | Detalhe, com a conta aninhada em `account`                   |
| `POST /api/reservations/{id}/check-in/`             | ✔         | **RF6** — `{allow_early}` (D4)                               |
| `POST /api/reservations/{id}/checkout/`             | ✔         | **RF7** — efetiva e devolve o extrato (**RN6**)              |
| `POST /api/reservations/{id}/cancel/`               | ✔         | `PENDING → CANCELLED` (D8)                                   |
| `POST /api/reservations/{id}/pay/`                  | ✔         | Registra o pagamento único (D18)                             |
| `GET /api/reservations/{id}/statement/`             | ✔         | 2ª via do extrato (só `CHECKED_OUT`)                         |
| `GET /api/rooms/` · `/{id}/` · `/available/`        | ✔         | Inventário e disponibilidade (`?search=` no número)          |
| `POST /api/rooms/` · `PATCH /api/rooms/{id}/`       | **admin** | Cadastro e ajuste de capacidade/situação                     |
| `GET /api/pricing-policies/` · `/current/`          | ✔         | Histórico e tarifa vigente                                   |
| `POST /api/pricing-policies/`                       | **admin** | Publica tarifa (append-only; vigência = agora)               |
| `GET /api/ai/status/` · `POST /api/ai/copilot/`     | ✔         | A Íris ([`docs/IRIS.md`](docs/IRIS.md))                      |
| `GET /api/schema/` · `/api/docs/`                   | —         | OpenAPI 3 + Swagger UI                                       |

Todo erro sai no **mesmo envelope**, para o cliente ramificar por código e
nunca por texto:

```json
{ "code": "EARLY_CHECKIN", "detail": "Check-in permitido a partir das 14:00.", "extra": { "server_time": "13:45", "opens_at": "14:00" } }
```

| Código               | HTTP | Quando                                                                                    |
| -------------------- | ---- | ----------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`   | 400  | Payload inválido (`extra` = erros por campo)                                              |
| `NOT_AUTHENTICATED`  | 401  | Token ausente ou expirado                                                                 |
| `PERMISSION_DENIED`  | 403  | Atendente em rota restrita ao `ADMIN`                                                     |
| `CSRF_FAILED`        | 403  | Rota de cookie sem `X-CSRFToken` válido, ou `Origin` fora da lista                        |
| `NOT_FOUND`          | 404  | Recurso inexistente                                                                       |
| `EARLY_CHECKIN`      | 409  | Check-in antes da abertura, sem `allow_early` (D4). `extra`: `server_time`, `opens_at`    |
| `INVALID_STATUS`     | 409  | Transição ilegal, hóspede já hospedado, ou conta já paga (`extra.paid_at`)                |
| `DUPLICATE_DOCUMENT` | 409  | Documento já cadastrado (D12)                                                             |
| `ROOM_UNAVAILABLE`   | 409  | Agenda cruzada, quarto ainda ocupado, ou chegada antecipada que tomaria o quarto (D16)    |
| `THROTTLED`          | 429  | Login 10/min e refresh 60/min por IP; Íris 20/min por usuário                             |
| `AI_UPSTREAM_ERROR`  | 502  | Provedor de IA indisponível ou resposta inutilizável                                      |
| `AI_DISABLED`        | 503  | Íris sem chave configurada                                                                |

O contrato navegável, com exemplos de request, resposta e erro de cada rota,
está no Swagger: <http://localhost:8000/api/docs/>.

---

## 7. Arquitetura

Monólito Django modular com **camada de serviço** (Django Styleguide) e um
**núcleo funcional puro** no lugar exato onde a correção precisa ser auditável.
Não é hexagonal e não é DDD, por decisão: o domínio importa Django de propósito,
porque a única fronteira que paga aqui é a do motor financeiro —
`hotel/billing/engine.py`, sem ORM, sem I/O e sem relógio, o único módulo que
sobreviveria intacto a uma troca de framework.

```
backend/
├── config/       settings, urls (só includes)
├── core/         sem models: erros, envelope, money (quantize), serializers comuns
├── accounts/     CustomUser + Role; o atendente nasce do seed
├── hotel/        pacote namespace: quatro apps, um por pergunta do domínio
│   ├── guests/       QUEM  — cadastro, normalização de PII, busca
│   ├── rooms/        ONDE  — inventário, capacidade, operação
│   ├── billing/      QUANTO— engine.py (PURO) · PricingPolicy · Account/AccountLine/Payment
│   └── reservations/ QUANDO— agenda, transições, extrato, seed_demo
├── ai/           a Íris: importa só hotel.reservations e core/
└── tests/{unit,db,api}/

frontend/src/
├── app/          casca: providers, router, AppLayout, SessionGate
├── pages/        uma pasta por rota (Página.tsx + testes + index.ts)
├── lib/          sem UI: api, auth, errors, format, forms, notify, routing
├── components/   ui/ (shadcn vendorizado) · common/ (DataTable, PageHeader, …)
└── features/     {auth,guests,reservations,rooms,pricing,ai}: api · hooks · schemas · components
```

O grafo de dependências entre os apps não é convenção: é **fiscalizado** por
import-linter (`uv run lint-imports`, passo do CI). As camadas do frontend
(`lib → components → features → pages → app`) são cobradas por
`no-restricted-imports` no ESLint.

Quatro invariantes atravessam o código inteiro e explicam a maior parte das
escolhas de estrutura:

1. **Dinheiro é `Decimal`, sempre.** Nunca `float`, em lugar nenhum — há uma
   guarda de texto no CI. Serializado como string; o frontend só formata.
2. **Relógio injetável.** Regra de horário recebe `now`/`today` como parâmetro:
   a view injeta `timezone.now()`, o teste injeta o que quiser. Fuso
   `America/Sao_Paulo`, banco em UTC, e **toda** comparação de regra (14h, 12h)
   acontece em hora local.
3. **Camadas, sem exceção.** models enxutos → `selectors.py` (leitura) →
   `services.py` (**toda** mutação e todo dinheiro) → serializers (I/O) → views
   finas. View nunca calcula dinheiro, model nunca conhece request, serializer
   nunca lê o relógio.
4. **O cálculo mora no backend.** Nenhum teste de frontend re-prova aritmética:
   os fixtures são cópia literal da tabela da seção 4.

O mapa dos quatro apps, o grafo, as invariantes por domínio e o gatilho de cada
coisa ainda não construída estão em [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 8. Documentação

| Documento                                                        | Responde                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Este README**                                                  | O que é, como subir, como verificar, e onde cada requisito está provado.  |
| [`docs/COMO-RODAR.md`](docs/COMO-RODAR.md)                       | Execução sem Docker, variáveis de ambiente, roteiro de demonstração.     |
| [`docs/DECISOES.md`](docs/DECISOES.md)                           | D1–D19: cada ambiguidade do briefing, a leitura rejeitada e o caso que as separa. |
| [`docs/QUALIDADE.md`](docs/QUALIDADE.md)                         | Doutrina de teste, política de cobertura, ferramental do CI.             |
| [`docs/IRIS.md`](docs/IRIS.md)                                   | A Íris: laço de ferramentas, fronteira de PII, fallback sem chave.       |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                             | Os quatro apps, o grafo fiscalizado, e o gatilho do que não foi feito.   |
| [`backend/docs/`](backend/docs/)                                 | Regras de negócio, autenticação, envelope de exceções, guia técnico.     |

Desenvolvido com agentes de codificação sob revisão humana; todo commit passou
pela suíte completa.

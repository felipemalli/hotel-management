# Guia do projeto — para quem sabe programar e nunca usou Django

**Para quem é este documento.** Você programa bem, provavelmente em
JavaScript/TypeScript, talvez Java ou C#, e nunca escreveu backend em Python nem
tocou em Django. Este guia não ensina Django: ele ensina **este projeto**, e
explica cada conceito de Python/Django no momento em que ele aparece num arquivo
real, com o `arquivo:linha` na frente.

**O que este documento não é.** Existem outros dois documentos e eles não se
repetem:

| Documento | Responde |
|---|---|
| `README.md` (raiz) | **Como rodar.** Quickstart, variáveis de ambiente, geração de chaves, mapa da API, decisões de interpretação do briefing. |
| `docs/GUIA-DO-PROJETO.md` (este) | **Como entender e onde mexer.** |
| `docs/ARQUITETURA-BACKEND.md` | **Onde dói quando cresce.** Análise para arquiteto sênior: 13 tensões nomeadas, 5 opções de arquitetura, recomendação. Ignore-o até ter entendido este guia; depois ele é a leitura seguinte. |

Toda afirmação aqui tem `arquivo:linha` conferido por leitura. Os números de
teste e as saídas de API foram obtidos rodando, não inferidos.

> **Leia os `arquivo:linha` como de 03/09/2026**, quando foram reconferidos um
> por um. Números deslocam alguns pontos a cada mudança; nomes de função, classe
> e módulo continuam exatos, e são eles que localizam o trecho.

---

## 1. O que o sistema faz

É o sistema de recepção de um hotel, usado por um **atendente** no balcão.

O atendente entra com login e senha. Cadastra o **hóspede** (nome, documento,
telefone) e abre uma **reserva** para ele: data de entrada, data de saída, e se
o hóspede vai usar **vaga** de estacionamento. A reserva nasce *pendente*.

Quando o hóspede chega, o atendente faz o **check-in** — permitido a partir das
14h; antes disso o sistema emite um alerta que o atendente pode confirmar. Na
saída, o **checkout** fecha a conta e mostra o extrato: uma linha por **diária**
(R$ 120,00 de segunda a sexta, R$ 180,00 no fim de semana), a taxa de vaga do
dia (R$ 15,00 / R$ 20,00), e a **multa** de 50% da diária se a saída passar das
12h. O total é congelado na reserva.

Três listagens cobrem o dia do balcão: todos os hóspedes (busca por nome,
documento ou telefone), quem **está no hotel** agora, e quem **tem reserva e
ainda não fez check-in**.

Depois da primeira entrega o sistema ganhou **inventário de quartos** (a reserva
aloca um quarto, e a capacidade freia o número de pessoas), **tarifa versionada**
(um admin publica; a estadia amarra a vigente no seu check-in), **acompanhantes**,
**pagamento da conta fechada** e os papéis atendente/admin.

Continua não existindo tarifa por quarto, troca de quarto no meio da estadia,
estorno nem edição de hóspede — de propósito (`README.md` §8).

---

## 2. Subir, entrar, e provar que funciona

O passo a passo completo (incluindo a geração da `SECRET_KEY` no `.env`) está
na **seção 1 do `README.md`**. O mínimo para não sair daqui:

```bash
cp .env.example .env          # depois preencha SECRET_KEY
docker compose up --build     # sobe db + backend + frontend
```

Aplicação em <http://localhost:5173>, login **`atendente` / `atendente123`**.
API em <http://localhost:8000/api/>, contrato navegável em
<http://localhost:8000/api/docs/>.

As duas suítes — é assim que você sabe que não quebrou nada:

```bash
# backend (dentro do container)
docker compose exec backend uv run pytest -q
# → 369 passed

# frontend (de dentro de frontend/)
cd frontend && npm run test -- --run
# → Test Files 54 passed (54) / Tests 372 passed (372)
```

Os números acima são os da execução em 04/09/2026; o total sobe a cada teste
novo, e o que importa é estar verde, não o número. Os 369 do backend se dividem
em três camadas, e a divisão importa para o §7:

| Suíte | Testes | Precisa de banco? | Prova |
|---|---|---|---|
| `backend/tests/unit/` | 44 | não | o motor financeiro e a normalização de PII, isolados |
| `backend/tests/db/` | 69 | sim (PostgreSQL real) | models, constraints, selectors, services |
| `backend/tests/api/` | 78 | sim | os endpoints ponta a ponta, com HTTP de verdade |

O banco de demonstração já vem povoado por um *seed* com quatro hóspedes, um
deles com extrato fechado — veja a tabela em `README.md` §1.3.

---

## 3. O mapa do repositório

```
hotel-management/
├── docker-compose.yml       # 3 serviços: db (PG 17), backend (gunicorn), frontend (Vite)
├── .env / .env.example      # segredos e configuração; .env NÃO está no git
├── .github/workflows/ci.yml # 2 jobs: backend (pytest) e frontend (vitest)
├── README.md                # como RODAR
├── docs/                    # este guia + a análise de arquitetura
├── backend/                 # a aplicação Python/Django
└── frontend/                # a aplicação React/TypeScript
```

### 3.1 `backend/` — a raiz do projeto Python

```
backend/
├── pyproject.toml   # o "package.json": nome, deps de runtime e de dev
├── uv.lock          # o "package-lock.json": versões exatas resolvidas
├── .python-version  # a versão do interpretador, como um .nvmrc
├── Dockerfile
├── manage.py        # o CLI do projeto
├── conftest.py      # fixtures globais do pytest
├── config/          # o "projeto" Django  (configuração e roteamento)
├── accounts/        # app: o usuário
├── hotel/           # app: o domínio (hóspede, reserva, dinheiro)
├── ai/              # feature opcional, isolada
└── tests/           # unit / db / api
```

**`uv` é o gerenciador de pacotes**, o `npm` deste projeto. `pyproject.toml` +
`uv.lock` são o `package.json` + `package-lock.json`. `uv run <comando>` é o
`npx`: ele resolve o ambiente virtual do projeto (uma pasta `.venv/` com o
interpretador e as dependências, isolada do Python do sistema) e roda o comando
dentro dele. Por isso todo comando de backend neste repositório começa com
`uv run`.

As dependências estão declaradas em dois blocos em `backend/pyproject.toml:6-17`
(runtime) e `:19-27` (desenvolvimento — o equivalente a `devDependencies`).
`backend/Dockerfile:25` instala com `uv sync --frozen`, que é o `npm ci`: falha
alto se o lock divergir do `pyproject.toml`, em vez de resolver silenciosamente
outra versão.

**`manage.py` é o CLI do Django.** Ele não tem lógica: `backend/manage.py:9`
aponta a variável de ambiente `DJANGO_SETTINGS_MODULE` para `config.settings` e
entrega o resto ao Django. Todo comando administrativo passa por ele:

| Comando | O que faz |
|---|---|
| `uv run python manage.py migrate` | aplica as migrações pendentes no banco |
| `uv run python manage.py makemigrations` | **gera** um arquivo de migração a partir das mudanças nos models |
| `uv run python manage.py seed_demo` | comando custom deste projeto: popula o cenário de demonstração |
| `uv run python manage.py shell` | REPL com o Django já carregado |

**`config/` é o que o Django chama de "projeto"**: a configuração e o
roteamento raiz. Não há domínio aqui.

| Arquivo | Papel |
|---|---|
| `config/settings.py` | Um módulo Python de constantes maiúsculas que o Django lê. É a configuração inteira: apps instalados (`:51-64`), middlewares (`:66-86`), banco (`:110-119`), fuso (`:136-138`), JWT (`:204-209`), cabeçalhos de segurança (`:229-244`). |
| `config/urls.py` | O roteador raiz — o `app.use(...)` do Express. |
| `config/wsgi.py` | Três linhas (`:1-7`) que expõem a aplicação para o servidor. |
| `config/health.py` | `GET /api/health/`, usado pelo healthcheck do Compose. |

**Por que existe um servidor separado do Django.** Django não é um servidor
HTTP; é uma aplicação que fala **WSGI** — uma interface padronizada em que o
servidor entrega um dicionário com a requisição e recebe a resposta. Em
produção, quem escuta a porta é o **gunicorn**, que roda vários processos
*worker* e chama a aplicação de `config/wsgi.py:7` em cada requisição. É o que
`backend/Dockerfile:30` faz, com 3 workers configurados em
`docker-compose.yml:36`. Em desenvolvimento existe o `manage.py runserver`, que
é conveniente e explicitamente não é o runtime entregue (`README.md` §2).
Analogia: Django é o `app` do Express, gunicorn é o `node cluster` + o listener.

**`accounts/` e `hotel/` são o que o Django chama de "apps".** Um app é apenas
um pacote Python com um `models.py`, registrado em `INSTALLED_APPS`
(`config/settings.py:62-63`). Não há nada mágico: é a unidade de modularidade do
Django, e a unidade da qual as migrações são derivadas.

```
accounts/            # 41 linhas de código (fora a migração gerada)
├── models.py        # CustomUser — 5 linhas
├── views.py         # login e refresh com limite de taxa
├── admin.py         # registra o usuário no /admin/
├── apps.py          # metadados do app
└── migrations/0001_initial.py

hotel/               # o domínio inteiro
├── models.py        # Guest, Reservation, ReservationStatus
├── normalization.py # documento alfanumérico, telefone dígitos (D9)
├── selectors.py     # LEITURA: consultas nomeadas
├── services/
│   ├── pricing.py       # o motor financeiro, PURO (sem banco, sem relógio)
│   ├── guests.py        # ESCRITA: cadastro de hóspede (unicidade de documento)
│   └── reservations.py  # ESCRITA: check-in, checkout, cancelamento
├── serializers/     # a fronteira de entrada/saída (JSON ↔ Python)
│   ├── common.py        # dinheiro como string, envelope de erro
│   ├── guests.py        # cadastro e as duas abas
│   ├── reservations.py  # reserva, criação, override de check-in
│   └── statement.py     # o extrato
├── views/           # HTTP: rotas, status codes, delegação
│   ├── guests.py        # GuestViewSet
│   ├── reservations.py  # ReservationViewSet
│   └── openapi.py       # respostas e exemplos de erro compartilhados
├── exceptions.py    # o envelope único de erro
├── management/commands/seed_demo.py   # `manage.py seed_demo`
└── migrations/
```

**`__init__.py`.** Cada pasta que é um pacote Python tem um arquivo
`__init__.py`, muitas vezes vazio (`hotel/__init__.py` tem 0 bytes) — ele é o
que faz `from hotel.models import Guest` funcionar. É o `index.js` de uma pasta,
sem os re-exports. Quando tem conteúdo, vale ler: `ai/__init__.py:1-16` é a
documentação do isolamento daquele app.

**`hotel/migrations/`.** Uma migração é um arquivo Python versionado que descreve
uma mudança de esquema do banco. Você não escreve migrações à mão: você muda o
`models.py` e roda `makemigrations`, que compara os models com o estado descrito
pelas migrações existentes e **gera** o arquivo. `migrate` aplica.
`hotel/migrations/0001_initial.py` tem 132 linhas, praticamente todas geradas —
e uma escrita à mão que vale ver: `:20` habilita a extensão `pg_trgm` do PostgreSQL
**antes** de criar os índices que dependem dela.

**`ai/`** é uma feature opcional: preenche o formulário de cadastro a partir de
texto livre, chamando um modelo de linguagem. O isolamento é deliberado e
documentado em `ai/__init__.py:1-16`: `hotel/` não importa nada de `ai/`, e o app
nem entra em `INSTALLED_APPS` — ele é alcançado apenas pela rota de
`config/urls.py:33`. Sem a chave `ANTHROPIC_API_KEY`, `ai/config.py:32-34`
desliga a feature inteira, `/api/ai/status/` responde `enabled: false` e o
frontend nem renderiza o botão (`frontend/src/features/ai/AiFillGuest.tsx:25`).
O sistema é 100% funcional nesse estado.

### 3.2 `frontend/src/` — organizado por feature

```
frontend/src/
├── main.tsx              # ponto de entrada: createRoot(...).render(<App />)
├── app/                  # a casca; é o único lugar que compõe mais de uma feature
│   ├── App.tsx           # AppProviders > BrowserRouter > AppRoutes
│   ├── providers.tsx     # ErrorBoundary raiz, QueryClientProvider, Toaster, devtools (dev)
│   ├── router.tsx        # /login eager; as páginas protegidas sob uma rota de layout, em chunks lazy
│   ├── AppLayout.tsx     # skip-link, <header> com o menu e o chip do papel, <main id="main">
│   └── PageFallback.tsx  # o fallback do Suspense, dentro do <main>
├── pages/                # uma composição fina por rota; não conhece `app/`
│   ├── DashboardPage.tsx # recepção: GuestTable + ações + os quatro diálogos
│   ├── useDashboardDialog.ts   # qual diálogo está aberto, em união discriminada
│   ├── ReservationsPage.tsx    # lista com filtros na URL
│   ├── ReservationDetailPage.tsx  # ficha, histórico com ator, conta e ações
│   ├── RoomsPage.tsx     # inventário; escrita só para o admin
│   └── PricingPage.tsx   # tarifa vigente, histórico e publicação
├── lib/                  # infraestrutura sem UI (nada aqui importa componente ou feature)
│   ├── apiClient.ts      # axios: baseURL /api, Bearer, refresh-once em 401, parseResponse
│   ├── errors.ts         # ApiError com união de códigos fechada, a partir do envelope
│   ├── errorLogger.ts    # destino dos erros: console em DEV, silencioso em produção
│   ├── schemas.ts        # zod compartilhado: moneyString, isoDate, isoDateTime, paginated
│   ├── forms.ts          # requiredString + applyServerErrors (erro do servidor → campo)
│   ├── normalize.ts      # documento alfanumérico, telefone dígitos (espelho de D9)
│   ├── money.ts          # formatBRL — formata, nunca calcula
│   ├── pii.ts            # máscara de exibição de CPF e telefone
│   ├── dates.ts          # formatação de data por manipulação de string
│   ├── queryKeys.ts      # as raízes de cache, só constantes
│   ├── queryClient.ts    # a política de roteamento de erro (toast × inline × boundary)
│   ├── useInvalidateServerState.ts   # a invalidação cruzada, num hook só
│   ├── session.ts        # store observável dos tokens
│   ├── toast.ts          # store observável dos avisos
│   └── useDebouncedValue.ts    # o atraso de 300 ms da busca
├── components/
│   ├── ErrorBoundary/    # ErrorBoundary + ErrorFallback ("Algo deu errado" com retry)
│   ├── icons/            # AlertIcon, CloseIcon, RefreshIcon, SpinnerIcon
│   └── ui/               # primitivos: Button, Input, Checkbox, Textarea, Dialog, Table,
│                         #   Tabs, Alert, Toaster, DismissButton, States, + index.ts
├── features/
│   ├── auth/             # LoginPage, ProtectedRoute, useAuth, api, hooks, schemas
│   ├── guests/           # GuestTable, GuestForm, tabs.ts, components/, __fixtures__
│   ├── reservations/     # ReservationForm, ReservationActions, os três diálogos, __fixtures__
│   └── ai/               # AiFillGuest, api, hooks, schemas, types
└── test/                 # renderWithProviders, fixtures, setup
```

Cada `features/<x>/` segue o mesmo **quinteto**: `types.ts` (o contrato tipado),
`schemas.ts` (os schemas zod de onde esses tipos saem, por `z.infer`), `api.ts`
(as chamadas HTTP), `hooks.ts` (as queries e mutations do TanStack Query), e os
componentes. Os testes moram ao lado do arquivo testado (`GuestTable.test.tsx`
vizinho de `GuestTable.tsx`).

Três regras de importação, impostas por lint e não por combinado: um único alias
(`@/`), com relativo apenas dentro da própria pasta; barrel (`index.ts`) só na
camada compartilhada — `components/ui`, `components/icons` e
`components/ErrorBoundary` —, nunca em `lib/` nem nas features; e camadas em uma
direção só, `lib` → `components` → `features` → `pages` → `app`. Entre as
features o grafo também é dirigido e sem ciclo: `rooms` é folha (não importa
ninguém), `guests` lê `rooms` (o quarto vem embutido no resumo da reserva) e
`ai`, e `reservations` lê `guests` e `rooms` (o seletor de acompanhantes e o de
quartos). O que compõe features irmãs sem uma conhecer a outra é a camada
`pages`.

**Não existe CORS neste projeto.** O Vite serve o frontend em `:5173` e faz
proxy de tudo sob `/api` para o backend (`frontend/vite.config.ts:19-25`). No
browser, portanto, tudo é a mesma origem — uma superfície de configuração a
menos.

#### Decisões do frontend

Nove escolhas que um revisor pergunta, com o motivo — que é o que não está
escrito no código:

- **A recepção é uma tela com abas; o que não é o turno do balcão virou rota.**
  As três listagens (todos, no hotel, check-in pendente) são recortes do mesmo
  trabalho, e o atendente alterna entre elas dezenas de vezes por turno: rota
  separada custaria uma navegação a cada troca e não ganharia nada. Reservas,
  quartos e tarifas são trabalhos diferentes, consultados de vez em quando e
  compartilháveis por link — esses ganharam `/reservas`, `/quartos` e
  `/tarifas`.
- **Nem Redux nem Zustand.** O servidor é a fonte de estado e o TanStack Query é
  o cache dessa fonte (`frontend/src/app/providers.tsx:22-46`); o que sobra de
  estado de cliente é qual diálogo está aberto e o conteúdo dos formulários, e
  isso mora no componente. Os dois únicos stores globais — sessão e avisos — são
  lidos por `useSyncExternalStore`, porque quem escreve neles é o interceptor de
  401, que roda fora do React.
- **Toast × inline × boundary.** Erro de *mutation* vira toast: o gesto é
  repetível e o formulário precisa continuar na tela com o que foi digitado.
  Erro de *query* vira estado inline com "Tentar novamente", que é o que o
  briefing pede para uma listagem que não carregou. Só erro de render e `5xx` na
  primeira carga vão ao ErrorBoundary — quando não há nada na tela para
  preservar. A tabela completa está em `frontend/src/lib/queryClient.ts:9-22`.
- **Invalidação cruzada, sempre nas duas raízes.** Check-in e checkout movem o
  hóspede de uma aba para outra, e cadastrar hóspede muda o universo de
  reservas; por isso toda mutation invalida `["guests"]` **e**
  `["reservations"]` (`frontend/src/lib/useInvalidateServerState.ts:8-15`).
  Invalidar só a raiz "óbvia" deixava a outra aba mentindo até o `staleTime`
  vencer.
- **O portão da IA é um `return null`.** `AiFillGuest` consulta
  `/api/ai/status/` e não renderiza nada quando a feature está desligada
  (`frontend/src/features/ai/AiFillGuest.tsx:25`), em vez de a página de
  cadastro conhecer a existência da chave. É o que faz o diferencial ser
  removível apagando a pasta (`README.md` §5.4).
- **A validação do cliente espelha o servidor; o servidor decide.** Os schemas
  de `features/<x>/schemas.ts` repetem as regras de D9, D11 e D13 para o erro
  aparecer antes da rede — e o `400 VALIDATION_ERROR` continua sendo remapeado
  campo a campo quando chega (`frontend/src/lib/forms.ts:24-56`). Duplicidade
  deliberada, com a autoridade em um lado só.
- **Abas com o padrão ARIA completo, e o extrato fora da linha.** As abas usam
  `role="tablist"` com *roving tabindex* e navegação por setas
  (`frontend/src/components/ui/Tabs.tsx:25-64`), porque meia implementação de
  ARIA é pior que nenhuma. E os diálogos disparados por uma linha — extrato de
  checkout, confirmação de cancelamento — vivem na página, não na linha: o
  checkout tira o hóspede da aba, a linha desmonta, e um diálogo montado dentro
  dela iria embora no meio da mutation
  (`frontend/src/pages/DashboardPage.tsx`).
- **Uma camada `pages` entre as features e a casca.** Uma página compõe várias
  features — a reserva usa `reservations`, `rooms` e `guests` ao mesmo tempo —
  e nenhuma feature pode importar outra para isso sem virar um novelo. `pages/`
  é onde essa composição mora, e `app/` fica só com casca, roteador e
  providers. A regra é imposta por lint, não por combinado: `pages` não importa
  `@/app`. É dela que sai a rota de layout — uma página não pode importar
  `AppLayout`, então o layout a envolve de cima, com `<Outlet/>`.
- **O papel vem do servidor, nunca do token.** `GET /api/auth/me/` decide se os
  controles de escrita existem (`frontend/src/features/auth/hooks.ts`). O token
  é opaco para o cliente, e uma claim de papel não expiraria junto com uma
  mudança feita fora desta sessão. Enquanto a resposta não chega, `useIsAdmin()`
  é `false`: um botão que o atendente não pode usar não pode piscar na tela
  dele. Um `403` inesperado vira toast — e é inesperado justamente porque o
  botão não deveria estar ali.

---

## 4. O caminho de uma requisição: o checkout, do clique ao `UPDATE`

Este é o fluxo mais rico do sistema. Ele atravessa todas as camadas dos dois
lados. Cada peça é explicada na hora em que aparece.

```
[ NAVEGADOR ]
 clique em "Checkout"
   ReservationActions.tsx:70-72   ─ botão
   ReservationActions.tsx:53-55   ─ runCheckOut() → checkOut.mutate(id)
   reservations/hooks.ts:37-47    ─ useCheckOut: a mutation do TanStack Query
   reservations/api.ts:23-26      ─ apiClient.post(`/reservations/${id}/checkout/`)
   lib/apiClient.ts:34-42         ─ interceptor injeta Authorization: Bearer <access>
        │
        │  POST /api/reservations/2/checkout/
        ▼
[ VITE DEV SERVER :5173 ]  proxy /api → http://backend:8000   vite.config.ts:19-25
        │
        ▼
[ GUNICORN → WSGI ]  config/wsgi.py:7
        │
        ├─ middlewares, em ordem                          settings.py:66-86
        │    SecurityMiddleware → WhiteNoise → CSP → Session → ... 
        ├─ JWT valida o token e resolve request.user      settings.py:172-174
        └─ IsAuthenticated: fechado por padrão            settings.py:177
        │
        ▼
[ ROTEAMENTO ]  config/urls.py:19-21 → :30
        router.register("reservations", ReservationViewSet)
        → casa a action `checkout` declarada em views/reservations.py:205
        │
        ▼
[ VIEW ]  ReservationViewSet.checkout()    views/reservations.py:205-208
        ├─ self.get_object()  → busca a reserva  views/reservations.py:103-108
        ├─ now = timezone.now()   ◄── o ÚNICO ponto do sistema que lê o relógio
        └─ delega
        │
        ▼
[ SERVICE ]  services/reservations.py:95-128  check_out(reservation, now=now)
        ├─ transaction.atomic()                                        :97
        ├─ _lock() → SELECT ... FOR UPDATE (relê a linha travada)  :98, :153-155
        ├─ _assert_transition(CHECKED_OUT) → InvalidStatusError    :99, :181-186
        ├─ timezone.localtime(...)  UTC no banco → hora local na regra  :105-106
        │
        ▼
[ MOTOR PURO ]  services/pricing.py:112-141  calculate_bill(...)
        ┌────────────────────────────────────────────────────────────┐
        │ sem ORM, sem I/O, sem relógio próprio. Só Decimal.         │
        │ stay_dates → daily_rate/parking_fee por data → late_fee    │
        └────────────────────────────────────────────────────────────┘
        ▼  devolve um Bill (dataclass congelada)
        │
        ├─ congela na linha e salva, na MESMA transação    reservations.py:110-125
        │     UPDATE hotel_reservation SET status='CHECKED_OUT',
        │       checked_out_at=..., total_daily=300.00, total_parking=35.00,
        │       late_fee=90.00, total_amount=425.00  WHERE id=2
        └─ COMMIT
        │
        ▼
[ SERIALIZER ]  build_statement(reservation, bill)  serializers/statement.py:50-66
                StatementSerializer                 serializers/statement.py:36-47
                Decimal(425.00) → a string "425.00"
        │
        ▼  200 OK  {"lines":[...], "subtotal_daily":"300.00", ..., "total":"425.00"}
        │
[ NAVEGADOR ]
   reservations/api.ts:25      ─ parseResponse(checkoutStatementSchema, …): valida o extrato
   reservations/hooks.ts:42-45 ─ onSuccess: invalida o cache e chama onCheckedOut
   lib/useInvalidateServerState.ts:11-14  ─ invalida ["guests"] E ["reservations"]
   app/DashboardPage.tsx:40         ─ open({ kind: 'statement', statement })
   app/DashboardPage.tsx:115-123    ─ monta o CheckoutStatementDialog
   reservations/CheckoutStatementDialog.tsx:62-69  ─ uma linha por diária, via formatBRL
```

Agora, o papel de cada peça.

**`urls.py` — roteamento.** `config/urls.py:19-21` registra dois recursos num
*router*:

```python
router = SimpleRouter()
router.register("guests", GuestViewSet, basename="guest")
router.register("reservations", ReservationViewSet, basename="reservation")
```

O router deriva as rotas REST convencionais a partir da classe (`GET
/reservations/`, `POST /reservations/`) e adiciona as *actions* customizadas que
a classe declarou. `config/urls.py:23-43` monta a lista final; note em `:28-29`
que o login fica fora do router — ele tem view própria, para poder ser anônimo e
ter limite de taxa (`accounts/views.py:13-24`).

**View — resolve HTTP e delega.** `hotel/views/reservations.py:205-208` é a action inteira:

```python
@action(detail=True, methods=["post"], url_path="checkout")
def checkout(self, request: Request, pk: str | None = None) -> Response:
    reservation = self.get_object()
    bill = reservations_service.check_out(reservation, now=timezone.now())
    return Response(StatementSerializer(build_statement(reservation, bill)).data)
```

Três linhas. Não há cálculo, não há SQL escrito à mão, não há tratamento de
erro — o erro sobe (§7). Isso é a invariante "views finas"
(`hotel/views/__init__.py:4-6`).

Duas convenções de Python visíveis nessas três linhas, para não estranhar:
**snake_case** (`check_out`, `get_object`, `url_path`) é a convenção de nomes de
funções, variáveis e argumentos em Python, e é só isso — o equivalente do
`camelCase` em JS, sem nenhuma diferença semântica. E as anotações
`request: Request`, `pk: str | None = None`, `-> Response` são **type hints**:
sintaxe de tipo idêntica em espírito à do TypeScript, mas **não verificada em
runtime** e sem compilador obrigatório — o Python ignora as anotações ao
executar. Elas existem para o leitor e para o editor. Não confunda com o
`typecheck` do frontend: aqui não há um `tsc` no CI do backend, e um type hint
errado não quebra nada — o que vigia o backend é a suíte.

**`@action` e `@extend_schema` são decoradores.** Um decorador em Python é uma
função que recebe a função de baixo e devolve outra no lugar dela — o mesmo
conceito de um decorator de TypeScript ou de um HOF que envolve um handler.
`@action(detail=True, methods=["post"], url_path="checkout")` não muda o corpo do
método; ele **marca** o método com metadados que o router lê para criar a rota
`POST /reservations/{id}/checkout/`. `@extend_schema(...)`, o bloco de 48 linhas
em `hotel/views/reservations.py:185-203`, marca o método com o request, as respostas e os
exemplos que aparecem no Swagger. Nenhum dos dois participa da execução da
requisição.

**Serializer — o que é "serializar" e por que existe.** Serializar é converter
entre a representação interna (objetos Python, `Decimal`, `datetime`) e a
representação de transporte (JSON, strings). No DRF o serializer faz os dois
sentidos e, na entrada, é também onde mora a **validação**.

Na saída: `hotel/serializers/statement.py:36-47` declara a forma do extrato, e
o `DecimalField` de `money_field` (`serializers/common.py:20-22`) é o que
garante que `Decimal("425.00")` sai como a string `"425.00"` e nunca como o
número `425.0` — o invariante do §6.1 tipado na fronteira. `build_statement`
(`statement.py:50-66`) só remapeia o `Bill` para um dicionário; ele não calcula
nada.

Na entrada, o mesmo mecanismo valida:

```python
# hotel/serializers/reservations.py (versão anterior)
    def validate_checkin_date(self, value):
        # D11: reserva e compromisso futuro. O passado entra no sistema pelos
        # fatos (check-in/checkout reais), nunca pelo agendamento.
        today = timezone.localdate()
        if value < today:
            raise serializers.ValidationError("Data de check-in não pode ser no passado.")
        return value
```

A convenção é do DRF: um método `validate_<campo>` valida aquele campo, e
`validate(self, attrs)` (`:233-239`) valida o objeto inteiro, quando a regra
envolve dois campos. Um `ValidationError` levantado aqui vira `400` com o
envelope de erro — verificado ao vivo:

```console
$ curl -w "\nHTTP %{http_code}\n" -X POST localhost:8000/api/reservations/ \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"guest_id":4,"checkin_date":"2020-01-01","checkout_date":"2020-01-03","has_vehicle":false}'
{"code":"VALIDATION_ERROR","detail":"Dados inválidos.","extra":{"checkin_date":["Data de check-in não pode ser no passado."]}}
HTTP 400
```

O mesmo serializer decide **o que sai**. Listagem e detalhe devolvem o valor
**gravado** — já normalizado (D9), sem máscara: `GuestSerializer` (`:54-60`). A
máscara de CPF/telefone na tabela é formatação de exibição no frontend
(`frontend/src/lib/pii.ts`). Ao vivo:

```console
# só os dois campos de PII de cada resposta:
$ curl "localhost:8000/api/guests/?search=ana"   # listagem
  "document": "12345678901",  "phone": "21988887777"

$ curl "localhost:8000/api/guests/1/"            # detalhe — o mesmo serializer
  "document": "12345678901",  "phone": "21988887777"
```

**Model e ORM.** Um *model* é uma classe Python que descreve uma tabela; cada
atributo de classe é uma coluna. `hotel/models.py:66-92` descreve
`hotel_reservation`. O **ORM** traduz operações sobre essas classes em SQL, e o
objeto intermediário é o **QuerySet**: uma consulta *preguiçosa* e componível.

```python
# hotel/selectors.py:85-89
    queryset = Reservation.objects.select_related("guest")
    if status:
        queryset = queryset.filter(status=status)
    if guest_id is not None:
        queryset = queryset.filter(guest_id=guest_id)
```

Nenhuma dessas linhas executa SQL. O QuerySet só vira `SELECT` quando alguém o
itera, indexa, conta, ou chama `.first()` / `.exists()`. Isso é o que permite
compor a consulta em pedaços — e é a pegadinha número um para quem vem de um
ORM que executa na hora. `Reservation.objects` é o *manager* padrão, o ponto de
entrada de consultas do model.

Você pode ver o SQL de qualquer QuerySet:

```console
$ uv run python manage.py shell -c "from hotel.models import Guest; \
    print(Guest.objects.filter(full_name__icontains='ana').query)"

# saída real, com a lista de colunas elidida e quebras de linha adicionadas:
SELECT ... FROM "hotel_guest"
 WHERE UPPER("hotel_guest"."full_name"::text) LIKE UPPER(%ana%)
 ORDER BY "hotel_guest"."full_name" ASC, "hotel_guest"."id" ASC
```

`full_name__icontains` é a sintaxe de *lookup* do ORM: `campo__operador`. O
duplo sublinhado é o `.`; `icontains` é `LIKE` sem diferenciar maiúsculas.
Esse SQL exato é o motivo de o índice em `hotel/models.py:44-47` ser um índice
**funcional** sobre `Upper("full_name")`: um índice comum sobre a coluna não
casaria a expressão `UPPER(...)` e viraria peso morto. Há um teste que faz
`EXPLAIN` e falha se o plano deixar de usar o índice
(`backend/tests/db/test_models.py:151-165`).

**`transaction.atomic` e `select_for_update`.** `services/reservations.py:97`
abre uma transação; `:98` relê a linha da reserva com `SELECT ... FOR UPDATE`,
que trava a linha no banco até o commit. Sem isso, dois atendentes clicando
"Checkout" ao mesmo tempo passariam os dois pela checagem de status e o segundo
sobrescreveria os totais. O `check_in` (`:78`) trava o **hóspede**, não a
reserva, porque a invariante que ele protege ("no máximo uma estadia ativa por
hóspede") vale *entre* linhas.

**O caminho de leitura é o mesmo, mais curto.** `GET /api/guests/in-hotel/`:
view (`views/guests.py:114-116`) → selector (`selectors.py:45-61`) →
serializer (`serializers/guests.py:86-99`). Sem service, porque não há mutação
nem dinheiro.

---

## 5. Onde vivem as regras de negócio

Não estão na view e não estão no model. A divisão é explícita e vale entendê-la
antes de escrever a primeira linha:

| Camada | Arquivo | Pode | Não pode |
|---|---|---|---|
| **Model** | `hotel/models.py` | descrever colunas, índices e constraints | conhecer HTTP; calcular dinheiro |
| **Selector** | `hotel/selectors.py` | ler: consultas nomeadas, sem efeito colateral | mutar estado; calcular dinheiro |
| **Service** | `hotel/services/reservations.py` | mutar: transições de status, transação, congelar totais | conhecer HTTP; ler o relógio por dentro |
| **Motor puro** | `hotel/services/pricing.py` | calcular dinheiro e avaliar horário | tocar banco, I/O ou relógio |
| **Serializer** | `hotel/serializers/` | validar entrada, formatar saída | calcular dinheiro |
| **View** | `hotel/views/` | resolver HTTP, ler o relógio, delegar | tudo o resto |

Por que não na view: uma regra na view só é alcançável por HTTP. O
`seed_demo.py:67-94` precisa fazer check-in e checkout sem passar por HTTP, e
faz — chamando os mesmos services que a API chama, com o relógio injetado. Um
teste de service (`backend/tests/db/test_services.py`) roda sem
cliente HTTP e sem congelar o tempo do processo.

Por que não no model: o cálculo do extrato depende de três valores
(`checked_in_at`, `checked_out_at`, `has_vehicle`) e de nenhum banco. Como
função pura ele é testável 9 vezes em milissegundos; como método de model,
exigiria uma linha no banco para cada caso. A única lógica que sobrou no model é
a normalização de documento/telefone em `hotel/models.py:82-86`, e ela está lá
justamente porque precisa valer para **todo** caminho de escrita (API, seed,
admin, shell).

### 5.1 O motor financeiro, com o caso T7 na mão

`hotel/services/pricing.py` é 141 linhas sem um único import de Django. As
constantes (`:19-26`):

```python
WEEKDAY_RATE = Decimal("120.00")
WEEKEND_RATE = Decimal("180.00")
WEEKDAY_PARK = Decimal("15.00")
WEEKEND_PARK = Decimal("20.00")
LATE_FEE_FACTOR = Decimal("0.5")

CHECKIN_OPENS = time(14, 0, 0)  # check-in permitido se hora local >= isto (D4)
CHECKOUT_LIMIT = time(12, 0, 0)  # multa se hora local > isto; 12:00:00 e isento (D3)
```

O algoritmo, em quatro funções pequenas:

1. **Quais datas cobrar** — `stay_dates` (`:90-99`): uma diária por data no
   intervalo semiaberto `[data(check-in), data(checkout))`. Se o intervalo der
   vazio (entrou e saiu no mesmo dia), cobra-se o mínimo de 1 diária.
2. **Quanto vale cada data** — `daily_rate` (`:75-77`) e `parking_fee`
   (`:80-83`): a tarifa é a **do próprio dia da diária**, não a do dia em que a
   noite termina.
3. **Multa** — `late_checkout` (`:107-109`) e `:127-131`: se a hora local da
   saída for **estritamente maior** que 12:00:00, cobra-se 50% da tarifa **do
   dia da saída**. `12:00:00` em ponto é isento.
4. **Total** — `quantize_money` (`:66-68`): duas casas, `ROUND_HALF_UP`. É a
   única função que arredonda no sistema inteiro.

Agora o caso **T7**, que exercita tudo de uma vez. Entrada: check-in sexta
07/03/2025 às 15:00, checkout domingo 09/03/2025 às **12:01**, com vaga.

| Passo | Resultado |
|---|---|
| `stay_dates(07/03, 09/03)` | `[07/03, 08/03]` — o dia 09 **não** entra (intervalo semiaberto) |
| `daily_rate(07/03)` — sexta | `120.00` |
| `daily_rate(08/03)` — sábado | `180.00` |
| `subtotal_daily` | **300.00** |
| `parking_fee(07/03)` — sexta, com vaga | `15.00` |
| `parking_fee(08/03)` — sábado, com vaga | `20.00` |
| `subtotal_parking` | **35.00** |
| `late_checkout(09/03 12:01)` | `True` — 12:01 > 12:00:00 |
| base da multa = `daily_rate(09/03)` — **domingo** | `180.00` |
| `late_fee` = `0.5 × 180.00` | **90.00** |
| `total` | **425.00** |

Duas coisas nesse cálculo são decisões, não obviedades, e cada uma tem um caso
na tabela para provar que continua valendo:

- **A vaga do dia da saída não é cobrada.** O domingo gera multa mas não gera
  diária nem vaga: a taxa de vaga acompanha as diárias. Fossem cobrados os R$
  20,00 do domingo, T7 daria 445,00.
- **A multa usa a tarifa do domingo (180,00), não a da última diária dormida.**
  Se usasse a do sábado daria os mesmos 90,00 aqui — mas no caso simétrico
  (sábado → segunda 12:30) a diferença aparece: 420,00 e não 450,00.

Essa tabela de 9 casos é **a fonte da verdade dos números do projeto** e está
replicada literalmente em dois arquivos:

- `backend/tests/unit/test_pricing.py:29-142` — os 9 casos como parâmetros de
  teste; T7 é `:106-117`. O teste (`:152-174`) confere linha a linha, subtotais,
  base da multa e total.
- `frontend/src/features/reservations/__fixtures__/bills.ts:169-192` — o mesmo
  T7 na forma do payload JSON, usado para provar o *render* do extrato.

E o seed produz o caso ao vivo: `seed_demo.py:78-94` cria a hóspede Carla Nunes
com estadia sexta→domingo passada, saída 12:01, com vaga. No banco de demo:

```console
$ docker compose exec db psql -U hotel -d hotel \
    -c 'SELECT id, status, total_daily, total_parking, late_fee, total_amount FROM hotel_reservation;'
 id |   status    | total_daily | total_parking | late_fee | total_amount
----+-------------+-------------+---------------+----------+--------------
  1 | PENDING     |             |               |          |
  2 | CHECKED_IN  |             |               |          |
  3 | CHECKED_OUT |      300.00 |         35.00 |    90.00 |       425.00
(3 rows)
```

Os campos financeiros são `NULL` até o checkout e congelados nele — por isso
`ReservationSerializer` os declara todos como `null`áveis
(`hotel/serializers/reservations.py:29-32`) e o schema do frontend também
(`frontend/src/features/reservations/schemas.ts:21-24`, de onde o tipo sai por
`z.infer`).

---

## 6. Três cuidados que vão parecer estranhos

Estes três não são preferência de estilo. Se você mexer sem saber, quebram —
e dois deles quebram silenciosamente, que é pior.

### 6.1 `Decimal`, nunca `float`

```python
# hotel/services/pricing.py:19
WEEKDAY_RATE = Decimal("120.00")
```

`float` em Python é ponto flutuante binário IEEE-754, igual ao `number` do
JavaScript: não representa `0.1` exatamente, e o erro acumula. Rodado agora, em
Python puro:

```console
>>> 0.1 + 0.2
0.30000000000000004
>>> 120.10 * 3                  # três diárias hipotéticas de R$ 120,10
360.29999999999995
>>> Decimal("120.10") * 3
Decimal('360.30')
```

O resíduo do segundo caso é o modo de falha real: `360.29999999999995` exibido
como está, ou arredondado por uma função que não é a do sistema, é um centavo
que ninguém consegue explicar ao hóspede. Duas regras seguem disso:

- **Construa a partir de string**, nunca de float: `Decimal(0.1)` já nasce com o
  erro do float embutido (`Decimal('0.1000000000000000055511151231…')`). Todas
  as constantes do módulo são `Decimal("...")`.
- **Arredonde num só lugar**: `quantize_money` (`:66-68`), com
  `ROUND_HALF_UP` — que é o arredondamento comercial, e não o
  banker's rounding que é o default de `Decimal`.

O tipo é vigiado nas duas pontas. No backend,
`backend/tests/unit/test_pricing.py:182-190` roda os 9 casos e afirma que cada
valor devolvido é `Decimal` com exatamente 2 casas decimais. E o **CI tem uma
guarda de texto** que barra o `float` antes de qualquer teste rodar:

```yaml
# .github/workflows/ci.yml:52-54 — o passo "Guard", antes de instalar qualquer coisa
run: '! grep -RnE "float\(" backend/hotel backend/accounts'
```

Se você escrever `float(` em qualquer arquivo de `hotel/` ou `accounts/`, o job
falha no terceiro passo. É grosseiro de propósito: é uma guarda, não um
analisador.

Do lado do frontend a proteção é o **schema**: todo campo monetário é validado
em runtime como string decimal de duas casas
(`frontend/src/lib/schemas.ts:6-8`, usado por
`frontend/src/features/reservations/schemas.ts:21-24` e `:28-53`), e a única
função que toca dinheiro formata por manipulação de string, sem nenhuma
conversão numérica:

```typescript
// frontend/src/lib/money.ts:4-19
const MONEY = /^(-?)(\d+)\.(\d{2})$/
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g

function groupThousands(digits: string): string {
  return digits.replace(THOUSANDS, '.')
}

export function formatBRL(value: string): string {
  const parts = MONEY.exec(value)
  if (!parts) throw new TypeError(`Valor monetário fora do contrato: ${JSON.stringify(value)}`)

  const [, sign = '', reais = '', centavos = ''] = parts
  return `R$ ${sign}${groupThousands(reais)},${centavos}`
}
```

Nenhuma conversão para número, em lugar nenhum — e há uma guarda de texto no CI
para os dois arquivos que tocam dinheiro na tela, espelhando a do `float` no
backend. Note também que entrada fora do contrato **lança**, em vez de devolver
um valor plausível: um total errado que "parece certo" ninguém confere. O
frontend **nunca** soma; se um subtotal parecer errado na tela, o bug é do
backend.

### 6.2 Relógio injetável: `now` é parâmetro, nunca chamada interna

Compare as duas formas. A que o projeto **não** usa:

```python
def early_checkin() -> bool:
    return timezone.now().time() < time(14, 0)     # lê o relógio por dentro
```

E a que ele usa:

```python
# hotel/services/pricing.py:102-104
def early_checkin(now: datetime) -> bool:
    """True se a tentativa e antes das 14:00 locais; 14:00:00 em ponto NAO e cedo (D4)."""
    return now.time() < CHECKIN_OPENS
```

A diferença é quem decide "agora". Na primeira forma, a única maneira de testar
a regra das 14h é congelar o relógio do processo inteiro ou aplicar
monkeypatch em `timezone.now`. Na segunda, o teste **passa o horário como
argumento** — e a função nem sabe que está sendo testada.

A regra é aplicada em cadeia: a view é o único lugar do sistema que lê o
relógio (`hotel/views/reservations.py:131`, `:207`), e o valor é passado adiante como
parâmetro nomeado por todos os services (`services/reservations.py:71`, `:95`).

O ganho fica visível no teste que prova a parte mais escorregadia da regra — que
14h é **hora local**, e o banco guarda UTC:

```python
# backend/tests/db/test_services.py:216-223 (docstring omitida: 16:30 UTC
# é 13:30 em São Paulo — é cedo, mesmo parecendo tarde)
def test_check_in_rule_is_evaluated_in_local_time():
    reservation = t7_reservation()
    now_utc = datetime(2025, 3, 7, 16, 30, tzinfo=UTC)

    with pytest.raises(service.EarlyCheckinError) as exc:
        service.check_in(reservation, now=now_utc, allow_early=False)

    assert exc.value.extra == {"server_time": "13:30"}
```

Nenhuma biblioteca de tempo, nenhum mock: o teste escolhe 16:30 UTC e afirma que
o sistema o entende como 13:30 local. A conversão acontece em
`services/reservations.py:83` (`timezone.localtime(now)`), antes de a regra ser
avaliada — e no checkout em `:105-106`.

No checkout a conversão faz mais do que decidir se houve multa: ela decide
**quais diárias entram na conta**. São Paulo é UTC-3, então um check-in às 21:00
locais é 00:00 UTC do dia seguinte, e ler as datas em UTC pularia uma diária
inteira. `backend/tests/db/test_services.py:417-441` prova isso passando os
timestamps em UTC, como a produção faz: sexta 21:00 → domingo 11:00 dá R$ 300,00
em datas locais e R$ 180,00 em UTC.

**Congelar o tempo é usado, mas só na borda HTTP.** Ali a view chama
`timezone.now()` de verdade, então não há como injetar; a biblioteca
`freezegun` congela o relógio do processo:

```python
# backend/tests/api/test_reservation_flow.py:171-192
def test_checkin_before_14_returns_409_and_override(auth_client):
    """RN4/D4: alerta com override -- 409 primeiro, `allow_early: true` depois."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 13, 59, 59)):
        blocked = auth_client.post(checkin_url(reservation), {"allow_early": False}, format="json")

        assert blocked.status_code == 409
        assert blocked.data == {
            "code": "EARLY_CHECKIN",
            "detail": "Check-in permitido a partir das 14:00.",
            "extra": {"server_time": "13:59"},
        }
        reservation.refresh_from_db()
        assert reservation.status == ReservationStatus.PENDING
        assert reservation.checked_in_at is None

        confirmed = auth_client.post(checkin_url(reservation), {"allow_early": True}, format="json")

    assert confirmed.status_code == 200
    assert confirmed.data["status"] == ReservationStatus.CHECKED_IN
```

`local(...)` (`backend/tests/api/conftest.py:18-20`) monta um `datetime` ciente
no fuso `America/Sao_Paulo`. Note que o teste prova o **protocolo inteiro** do
alerta: 409 sem override, nada persistido, e 200 no reenvio com `allow_early`.
Do outro lado, `frontend/src/features/reservations/EarlyCheckinFlow.test.tsx:51-104`
prova a outra metade: o 409 abre o diálogo com o `server_time`, cancelar não
dispara segunda chamada, confirmar reenvia com `allow_early: true`.

O `409` não é falha, é um ramo de protocolo — e o frontend o trata assim em três
lugares: `features/reservations/ReservationActions.tsx:41-51` intercepta apenas
esse código, `lib/errors.ts:77-81` extrai o horário do envelope, e
`lib/queryClient.ts:17-26` mantém `EARLY_CHECKIN` fora do toast global de erro.

### 6.3 PII em claro normalizada, com busca por fragmento

`document` e `phone` ficam em claro no banco, **já normalizados** (D9): a coluna
guarda `12345678901` e `21988887777`, não a máscara digitada. Prova, lendo a
coluna crua:

```console
$ docker compose exec db psql -U hotel -d hotel \
    -c 'SELECT id, full_name, document, phone FROM hotel_guest;'
 id |  full_name  |   document   |    phone
----+-------------+--------------+-------------
  1 | Ana Souza   | 12345678901  | 21988887777
  2 | Bruno Lima  | 98765432100  | 11977776666
  … | …           | …            | …
```

Quem garante isso é o `save()` do model, autoridade de qualquer caminho de
escrita (API, seed, admin, shell):

```python
# hotel/models.py:82-86
def save(self, *args, **kwargs):
    self.document = normalize_document(self.document)  # alfanumerico maiusculo
    self.phone = normalize_phone(self.phone)            # so digitos
    super().save(*args, **kwargs)
```

A normalização mora em `hotel/normalization.py` e é **por tipo**, não uma regra
só: documento vira alfanumérico maiúsculo porque os passaportes `AB123456` e
`CD123456` são documentos diferentes — normalizar por dígitos gravaria o mesmo
valor nos dois e o segundo cadastro seria recusado como duplicata (D9). Telefone
é só dígitos, porque só a máscara varia.

A busca (`?search=`) acha por **fragmento** nos três campos. O termo de
documento/telefone é normalizado *antes* do `icontains`, então `789` e `789-01`
casam a coluna `12345678901`:

```python
# hotel/selectors.py:32-40  (comentários à direita são deste guia)
    predicate = Q(full_name__icontains=term)          # nome: fragmento (trigram)

    document = normalize_document(term)
    if document:
        predicate |= Q(document__icontains=document)  # documento: fragmento

    phone = normalize_phone(term)
    if phone:
        predicate |= Q(phone__icontains=phone)        # telefone: fragmento
```

(`Q` é um objeto de condição do ORM, combinável com `|` e `&` — é o que permite
montar um `OR` de três predicados.) Três índices GIN funcionais
(`Upper("coluna") gin_trgm_ops`) casam o SQL real do `icontains` no Postgres.

Ao vivo, o mesmo hóspede por nome, documento inteiro, fragmento e máscara:

```console
$ curl "localhost:8000/api/guests/?search=ana"            → 1 ['Ana Souza']
$ curl "localhost:8000/api/guests/?search=12345678901"    → 1 ['Ana Souza']
$ curl "localhost:8000/api/guests/?search=789"            → 1 ['Ana Souza']
$ curl "localhost:8000/api/guests/?search=123.456.789-01" → 1 ['Ana Souza']
$ curl "localhost:8000/api/guests/?search=98888"          → 1 ['Ana Souza']
```

A API devolve o valor gravado. A máscara `123.456.789-01` / `(21) 98888-7777`
na tabela é formatação de exibição no frontend (`frontend/src/lib/pii.ts`):
CPF se o documento tem exatamente 11 dígitos, telefone se tem 10 ou 11;
passaporte e demais tamanhos saem crus. Logs não contêm PII.

Cifra em repouso (Fernet + blind index) foi a alternativa rejeitada: cifra e
`LIKE '%…%'` são objetivos incompatíveis, e criptografia de campo é excesso
que o negócio não usa (D5).

**A armadilha que sobra**, e está documentada como teste:
`Guest.objects.bulk_create(...)` **não chama `save()`**, logo não normaliza, e
o hóspede nasceria com a máscara digitada — invisível para a busca por
fragmento e para a unicidade de documento, sem erro nenhum. O manager recusa
a operação. O teste `backend/tests/db/test_models.py:181-192` existe para que
a próxima pessoa que pensar em `bulk_create` descubra isso ali e não em
produção.

---

## 7. Como fazer uma mudança sem quebrar nada

### 7.1 Onde escrever o código

Decida pela natureza da mudança, não pelo arquivo que você abriu primeiro:

| A mudança é... | Vai em | E o teste vai em |
|---|---|---|
| um número ou uma regra de horário | `hotel/services/pricing.py` | `tests/unit/test_pricing.py` (sem banco) |
| uma transição de status, ou congelamento de valor | `hotel/services/reservations.py` | `tests/db/test_services.py` |
| uma consulta / filtro / listagem nova | `hotel/selectors.py` | `tests/db/test_selectors.py` |
| uma coluna, índice ou constraint | `hotel/models.py` **+ migração** | `tests/db/test_models.py` |
| validação de entrada, ou forma da resposta | `hotel/serializers/` | `tests/api/test_guests.py` ou `test_reservation_flow.py` |
| uma rota, um status code, um parâmetro de query | `hotel/views/` (+ `config/urls.py` se for rota nova) | `tests/api/` |
| a forma de um erro | `hotel/exceptions.py` | `tests/api/` |
| tela, tabela, diálogo | `frontend/src/features/<x>/` | `<Componente>.test.tsx` ao lado |
| uma página nova (rota) | `frontend/src/pages/<Página>.tsx` + rota em `app/router.tsx` + `ROUTES` em `lib/routes.ts` | `<Página>.test.tsx` ao lado, montada com `renderPage` |
| normalização de valor digitado (dinheiro, fator) | `frontend/src/lib/money.ts` (`toDecimalString`) | `lib/money.test.ts` |
| uma regra de formulário (campo obrigatório, mínimo, comparação de datas) | `frontend/src/features/<x>/schemas.ts` | `schemas.test.ts` ao lado, sem montar componente |
| a forma de uma resposta da API | `frontend/src/features/<x>/schemas.ts` (+ `types.ts` por `z.infer`) | `schemas.test.ts`, e o teste do componente que a consome |
| onde um erro do servidor aparece na tela | `frontend/src/lib/forms.ts` (campo × alerta) ou `frontend/src/lib/queryClient.ts` (toast × inline × boundary) | `lib/forms.test.ts` · `lib/errors.test.ts` |
| formatação de dinheiro, data ou PII | `frontend/src/lib/` | `lib/*.test.ts` |
| um primitivo de UI novo, ou um ícone | `frontend/src/components/ui/` (+ `index.ts`) ou `frontend/src/components/icons/` | `<Primitivo>.test.tsx` ao lado |

Regra prática: se a sua mudança precisa de banco para ser testada, ela
provavelmente está na camada errada. A camada `tests/unit/` tem 44 testes e
nenhum toca no PostgreSQL.

### 7.2 Onde escrever o teste

**Backend — pytest.** Um teste é uma função cujo nome começa com `test_`
(`backend/pyproject.toml:42`); a asserção é o `assert` nativo do Python. Não há
classe, não há `describe`. Três ferramentas que você vai encontrar:

- **`pytest.mark.django_db`** — marca o módulo (ou o teste) como precisando de
  banco. Sem essa marca o acesso ao banco é bloqueado; é o que separa
  `tests/unit/` de `tests/db/`. Cada teste roda dentro de uma transação que é
  revertida no fim, então os testes não se contaminam.
- **`@pytest.mark.parametrize`** — roda a mesma função com N conjuntos de
  argumentos, cada um aparecendo como um teste separado. É como a tabela de 9
  casos vira 9 testes (`tests/unit/test_pricing.py:145-174`), com os ids `T1`…`T9`.
- **Fixtures** — funções decoradas com `@pytest.fixture` que o pytest injeta em
  qualquer teste que declare um parâmetro com aquele nome. É injeção de
  dependência por nome de argumento: `def test_x(auth_client)` recebe um cliente
  HTTP já autenticado, montado em `backend/tests/api/conftest.py:35-38`. O
  arquivo `conftest.py` é onde fixtures moram; o da raiz
  (`backend/conftest.py:22-38`) vale para a suíte inteira.

Fábricas de dados ficam em `backend/tests/factories.py`: `GuestFactory`
(`:45-52`), `ReservationFactory` (`:55-83`) com os *traits* `checked_in` e
`checked_out`. O trait `checked_out` congela os totais chamando o **motor de
verdade** (`:86-92`) — uma fixture que recalculasse dinheiro por conta própria
mentiria sobre o sistema.

**Frontend — Vitest + React Testing Library.** `describe`/`it`/`expect`, como
Jest, com uma diferença que surpreende quem vem do Jest: os globais estão
**desligados** (`globals: false` em `frontend/vite.config.ts:26-46`), então todo
arquivo de teste importa o que usa — `import { describe, expect, it, vi } from 'vitest'`.
É mais uma linha por arquivo, e em troca o programa de tipos da aplicação não
enxerga nenhum global de teste. Cinco convenções locais:

- As chamadas de API são **mockadas por módulo**: `vi.mock('@/features/reservations/api')`.
  Não há MSW nem servidor de teste.
- A montagem passa por `renderWithProviders`
  (`frontend/src/test/renderWithProviders.tsx:18-37`), que cria um `QueryClient`
  novo por render — cache compartilhado entre testes vaza dado de um caso para o
  outro. Quem precisa de rota passa a opção `route`, e só então o
  `MemoryRouter` entra na árvore; `signInForTest()` grava uma sessão, e
  `resetGlobalStores()` roda em `beforeEach` global
  (`frontend/src/test/setup.ts`).
- Dados de teste vêm de **fixtures compartilhadas**, não de literais copiados:
  `frontend/src/test/fixtures.ts` (o envelope paginado do DRF),
  `frontend/src/features/guests/__fixtures__/guests.ts` (Ana, Bruno, Carla,
  Davi, com os helpers `inHotel()` e `pendingCheckin()`) e
  `frontend/src/features/reservations/__fixtures__/bills.ts` (T1–T9).
- Os dublês se limpam sozinhos: `mockReset` e `restoreMocks` estão ligados na
  configuração do Vitest, então nenhum teste herda o estado do vizinho e nenhum
  `beforeEach` precisa repetir isso à mão.
- **Formulário se testa pela regra, não pela tela, quando dá.** O par
  react-hook-form + zod deixa a regra em `features/<x>/schemas.ts`, que é
  função pura e tem teste próprio; o teste de componente fica com o que só o
  componente prova — foco no primeiro campo inválido, erro do servidor
  remapeado por `applyServerErrors` (`frontend/src/lib/forms.ts:24-56`) e
  desaparecendo ao editar.

E uma doutrina que vale respeitar: **teste de frontend não recalcula
aritmética.** Os fixtures são cópia literal da tabela de casos
(`frontend/src/features/reservations/__fixtures__/bills.ts`), então o que o
teste prova é que o valor certo aparece no lugar certo — não que a conta fecha.
A conta é do backend.

### 7.3 Rodar

```bash
# backend, tudo
docker compose exec backend uv run pytest -q

# backend, só uma camada (muito mais rápido: unit não sobe banco)
docker compose exec backend uv run pytest tests/unit -q

# backend, um teste só, por nome
docker compose exec backend uv run pytest -q -k test_checkout_statement_matches_T7

# backend, com o piso de cobertura que o CI aplica
docker compose exec backend uv run pytest --cov=hotel --cov=accounts --cov-fail-under=85 -q

# frontend (de dentro de frontend/) — tudo, na ordem em que o CI cobra
npm run check              # typecheck && lint && format:check && test:coverage && build

# frontend, uma peça por vez
npm run test -- --run      # o -- passa o --run para o vitest: uma execução, sem watch
npm run test               # modo watch, para desenvolver
npm run test:coverage      # a suíte com o piso de cobertura que o CI aplica
npm run typecheck          # tsc -b: os três programas (aplicação, testes, vite.config.ts)
npm run lint               # eslint . --max-warnings 0   (lint:fix corrige o que dá)
npm run format             # prettier --write .          (format:check apenas confere)
```

O `npm run check` é o comando único a rodar antes de commitar: se ele passa, o
job de frontend do CI passa, porque são os mesmos passos na mesma ordem.

Alterou `pyproject.toml`? O container precisa ser reconstruído
(`docker compose up -d --build backend`) — as dependências são instaladas na
imagem, no passo `uv sync --frozen` de `backend/Dockerfile:25`.

### 7.4 O que o CI checa

`.github/workflows/ci.yml` tem **dois jobs**, ambos em `ubuntu-latest` a partir
do checkout — o que é, por construção, a simulação de um clone limpo.

**Job `backend`** (`:13-60`):

1. sobe um serviço PostgreSQL 17 com healthcheck (`:19-32`);
2. **a guarda de `float`** (`:52-54`) — roda **antes** de instalar qualquer coisa;
3. `uv sync --frozen` (`:56-57`) — falha se `uv.lock` divergir;
4. `pytest --cov=hotel --cov=accounts --cov-fail-under=85 -q` (`:59-60`) — a
   suíte inteira mais o piso de 85% de cobertura.

**Job `frontend`** (`:62-109`): cada verificação é um **passo nomeado**, para
que a aba do CI diga o que quebrou sem ninguém abrir o log:

1. `npm ci` (`:81-82`) — falha se `package-lock.json` divergir;
2. **Typecheck** (`:84-85`) — `tsc -b`; type error é falha de CI;
3. **Lint** (`:87-88`) — `eslint . --max-warnings 0`, type-aware, com as
   fronteiras de camada;
4. **Format check** (`:90-91`) — `prettier --check .`;
5. **a guarda de dinheiro** (`:93-95`) — espelho da do backend: nem
   `src/lib/money.ts` nem o diálogo do extrato podem conter `Number(`,
   `parseFloat`, `parseInt`, `toLocaleString` ou `Intl.NumberFormat`;
6. **Tests with coverage floor** (`:97-98`) — a suíte mais o piso de cobertura
   declarado em `frontend/vite.config.ts:44`;
7. **Build** (`:100-101`) — o `vite build` de produção;
8. o `lcov.info` sobe como artefato (`:103-109`), inclusive quando a suíte
   falha.

O job roda com `TZ: America/Sao_Paulo` (`:69-71`): os testes de data comparam
com o relógio local, então o CI usa o fuso de produção. A versão do Node vem de
`frontend/.nvmrc` (`:75-79`), a mesma da imagem Docker e do caminho híbrido.

### 7.5 Migrações: o que são e quando você precisa de uma

Toda vez que você mudar `models.py` de um jeito que afete o esquema — nova
coluna, mudança de tipo, novo índice, nova constraint — o banco precisa de uma
migração. O ciclo:

```bash
# 1. edite hotel/models.py
# 2. gere o arquivo de migração (o Django diffa os models contra as migrações existentes)
docker compose exec backend uv run python manage.py makemigrations
# 3. leia o arquivo gerado em hotel/migrations/000X_*.py  — ele é revisável, e às vezes precisa de ajuste à mão
# 4. aplique
docker compose exec backend uv run python manage.py migrate
```

Quatro pontos práticos:

- **Migração é código versionado**, não artefato descartável: ela entra no
  commit junto com a mudança do model. `docker compose up` roda `migrate` na
  cadeia de subida (`docker-compose.yml:36`), então uma migração faltando
  derruba a subida do avaliador.
- **`makemigrations` sem mudança de model não gera nada.** Se ele gerar um
  arquivo que você não esperava, algo mudou que você não notou — leia antes de
  aceitar.
- **Mudar um `Meta.constraints` ou `Meta.indexes` também exige migração.** Eles
  viram DDL, não são checagens em Python.
- **Nem toda mudança de model exige migração.** `hotel/models.py:53-63`
  (`save()`) é comportamento em Python, não esquema.

Este projeto tem exatamente duas migrações, ambas iniciais
(`accounts/migrations/0001_initial.py` e `hotel/migrations/0001_initial.py`) — e
a segunda tem uma linha escrita à mão que `makemigrations` não geraria:
`TrigramExtension()` em `:20`, que habilita `pg_trgm` no PostgreSQL antes de
criar o índice trigram que depende dela.

### 7.6 A regra que não se negocia: a tabela de casos é imutável

Os 9 casos numéricos (T1–T9) e os ids de teste da matriz de rastreabilidade são
a especificação, não uma consequência do código. **Se um teste seu discorda da
tabela, o erro está no seu código.**

Isso é operacional: a tabela vive replicada em `test_pricing.py:29-142` e em
`__fixtures__/bills.ts`, e qualquer divergência entre os três quebra a suíte.
Mudar um número exige mudar os dois arquivos **e** a tabela — nessa ordem, e
nunca em silêncio. O comentário em
`frontend/src/features/reservations/__fixtures__/bills.ts:1-2` diz exatamente
isso.

Na prática, o roteiro quando um teste fica vermelho depois de uma mudança sua:

1. o teste é da tabela (`test_truth_table[T7]`)? → seu código está errado;
2. o teste é de contrato de API (`test_checkout_statement_matches_T7`)? → você
   mudou a forma do payload; ou reverta, ou atualize o fixture do frontend
   junto, ou os dois lados divergem;
3. o teste é de constraint (`tests/db/test_models.py`)? → falta uma migração,
   ou a invariante do banco mudou sem intenção.

---

## 8. Glossário Python/Django → JS/TS

Só os termos que apareceram acima.

| Termo | O que é aqui | Equivalente mental |
|---|---|---|
| `uv` | gerenciador de pacotes e de ambiente | `npm` |
| `pyproject.toml` | manifesto do projeto e das dependências | `package.json` |
| `uv.lock` | versões exatas resolvidas | `package-lock.json` |
| `uv sync --frozen` | instala travado; falha se o lock divergir | `npm ci` |
| `uv run <cmd>` | roda no ambiente do projeto | `npx <cmd>` |
| **ambiente virtual** (`.venv/`) | interpretador + dependências isolados do sistema | `node_modules/`, mas incluindo o runtime |
| `manage.py` | CLI do projeto Django | um `bin/cli.js` de scaffolding |
| `__init__.py` | marca a pasta como pacote importável | `index.js` de uma pasta, sem re-exports |
| **snake_case** | convenção de nomes de funções e variáveis em Python | `camelCase` em JS — a diferença é só convenção |
| **decorador** (`@action`) | função que envolve/anota outra função | decorator do TS, ou um HOF que envolve um handler |
| **type hint** (`now: datetime`) | anotação de tipo, **não** verificada em runtime | tipo do TS — mas aqui não há compilador obrigatório |
| **dataclass** (`@dataclass(frozen=True)`) | classe de dados; `frozen` = imutável | `type` + `Object.freeze()`, com construtor |
| `Decimal` | decimal exato, sem erro de ponto flutuante | `decimal.js` / `BigDecimal` — nunca `number` |
| **projeto** (`config/`) | configuração e roteamento raiz | o arquivo que monta o `app` do Express |
| **app** (`hotel/`) | módulo do domínio, unidade das migrações | um "módulo" do Nest, sem os decoradores |
| **model** | classe que descreve uma tabela | entidade do TypeORM / model do Prisma |
| **ORM** | traduz classes em SQL | TypeORM, Prisma |
| **QuerySet** | consulta **preguiçosa** e componível | query builder do Knex — não executa até ser consumido |
| **manager** (`.objects`) | ponto de entrada de consultas de um model | o repository |
| **lookup** (`campo__icontains`) | operador de filtro; `__` faz o papel do `.` | `{ where: { campo: { contains: ... } } }` |
| `Q(...)` | objeto de condição, combinável com `\|` e `&` | um predicado componível de query builder |
| **migração** | arquivo versionado que altera o esquema | migration do TypeORM / Prisma Migrate |
| **view** | handler de uma rota | controller |
| **ViewSet** | classe que agrupa as views de um recurso | controller de recurso com rotas derivadas |
| **serializer** | valida a entrada, formata a saída | Zod (validação) + DTO (forma da saída) |
| **middleware** | camada na entrada/saída de toda requisição | middleware do Express |
| **settings** | módulo de constantes que o Django lê | `config.ts` exportando um objeto |
| **WSGI** | interface padrão entre servidor e app Python | a assinatura `(req, res)` que o servidor chama |
| **gunicorn** | servidor HTTP multiprocesso que roda o app WSGI | `node cluster` + o listener do Express |
| **fixture** (pytest) | valor injetado num teste pelo nome do argumento | `beforeEach` + injeção de dependência |
| `conftest.py` | onde as fixtures compartilhadas moram | `setupFiles` / `test-utils.ts` |
| `@pytest.mark.parametrize` | mesma função, N conjuntos de argumentos | `it.each` |
| `pytest.mark.django_db` | libera acesso ao banco no teste | não tem equivalente direto |

# Arquitetura

## 1. Propósito e estilo

Monólito Django modular: quatro apps de domínio aninhados em `hotel/`, cada um com seus próprios
models, migrações e rotas. Toda mutação passa por um service; toda leitura não trivial, por um
selector. O cálculo do dinheiro é um motor puro (`hotel/billing/engine.py`), sem ORM e sem relógio.
Autenticação e papéis (`ADMIN`/atendente) ficam em `accounts/`, fora do domínio.

## 2. Pacotes e camadas

| Pacote               | Responsabilidade                                                        |
| -------------------- | ----------------------------------------------------------------------- |
| `config/`            | settings, urls raiz, health. Só inclui; não conhece regra.               |
| `core/`              | erros de domínio, envelope HTTP, `quantize_money`, serializers e tags comuns. Sem models. |
| `accounts/`          | `CustomUser`, papéis, login por cookie httpOnly, `IsHotelAdmin`.          |
| `hotel.guests`       | **quem**: cadastro, normalização de PII, busca por fragmento.            |
| `hotel.rooms`        | **onde**: inventário, capacidade, operação.                              |
| `hotel.billing`      | **quanto**: tarifa versionada, motor de cálculo e o livro da conta.       |
| `hotel.reservations` | **quando**: agenda, estadia, transições e extrato.                       |
| `ai/`                | a Íris, copiloto opcional: laço de *tool use* sobre leituras do domínio. Importa só `hotel.reservations` e `core`. |
| `tests/{unit,db,api}` | motor puro · PostgreSQL real · API ponta a ponta.                        |

Dentro de cada app: `models` → `selectors` → `services` (recebem `now`/`today` por parâmetro) →
`serializers` → `views` (único lugar que lê o relógio) → `urls`. `config/urls.py` inclui
`hotel.reservations` **antes** de `guests` e `rooms`: as leituras cruzadas moram em `reservations`,
e o detail `/guests/{pk}/` casa `[^/.]+`, engolindo `/guests/in-hotel/`.

## 3. Grafo de dependências

```text
ai  ->  hotel.reservations  ->  hotel.guests | hotel.rooms | hotel.billing  ->  core | accounts
                            ^
        hotel.rooms.services --+ (única exceção: guardas de leitura da agenda)
```

Irmãos na mesma faixa não se importam. Nada em `hotel.*` importa `ai` nem `config`. Um quarto
contrato (`forbidden`) fecha o outro lado: `ai` não pode importar `hotel.billing`, `hotel.rooms` nem
`hotel.guests` direto — só `hotel.reservations`, que já é a fachada das leituras cruzadas. É
`allow_indirect_imports`, porque `reservations` importa as folhas e a cadeia é legítima. `billing` não
conhece nenhum irmão — a conta não sabe que existe reserva. A exceção é
`hotel.rooms.services → hotel.reservations.selectors`: desativar ou excluir um quarto e reduzir capacidade
precisam ler a agenda, e o selector encapsula os status para que `rooms` não conheça o ciclo de vida
da reserva. O contrato vive em `backend/pyproject.toml` (`[tool.importlinter]`) e o CI roda
`uv run lint-imports`.

## 4. Domínios e invariantes

Constraint nomeada é contrato: `core.errors.translate_integrity_error` casa o `IntegrityError` pelo
nome e devolve o 409 do domínio.

| App            | Modelos                          | Constraints nomeadas                                                                             | Autoridade                          |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `guests`       | `Guest`                          | `guest_document_unique`                                                                            | documento normalizado alfanumérico  |
| `rooms`        | `Room`                           | `room_number_unique`, `room_capacity_positive`                                                     | `capacity` freia o tamanho do grupo |
| `billing`      | `PricingPolicy`                  | `policy_money_non_negative`, `policy_checkout_before_checkin`                                       | append-only; `effective_from`       |
| `billing`      | `Account`, `AccountLine`, `Payment` | `account_closed_is_complete`, `account_total_non_negative`, `accountline_one_per_kind_date`, `accountline_quantity_non_negative`, `payment_amount_non_negative` | `AccountLine.amount` e `Account.total_amount` |
| `reservations` | `Reservation`                    | `resv_room_no_overlap` (EXCLUDE), `resv_one_active_per_room`, `resv_one_active_per_guest`, `resv_active_has_policy`, `resv_checked_out_complete`, `resv_account_matches_status` | status ⇔ conta                      |

`AccountLine` não tem CHECK aritmético ligando `amount` a `quantity × unit_amount`: um fator como
0.3333 não fecha em `numeric`. `amount` é a autoridade; os outros dois explicam como se chegou nela.

A tarifa do briefing (120/180/15/20, multa 50%, 14:00/12:00) tem três fontes que precisam concordar:
`hotel/billing/migrations/0001_initial.py` (bootstrap), `backend/conftest.py` (fixture da suíte) e
`engine.DEFAULT_RATES`.

## 5. Ciclo estadia × conta

| Momento         | O que acontece                                                                              |
| --------------- | ------------------------------------------------------------------------------------------- |
| check-in        | `billing.open_account(now=…)` na mesma transação do flip de status; `Reservation.account` OPEN |
| checkout        | `post_lines` (diárias, vaga, multa) + `close_account` na mesma transação do flip             |
| pagamento       | `register_payment` — `Payment` 1:1, conta vai a PAID; a reserva segue CHECKED_OUT             |
| a qualquer hora | `preview_checkout(reservation, now=…)` calcula sem lock e sem escrita — é a costura que a Íris consome |

`statement()` hidrata das linhas gravadas e **nunca** chama o motor: o recibo de uma estadia
encerrada é um fato, não uma função. Ordem de lock: **Guest (pk asc) → Room → Reservation → Account**.
`billing` não importa `reservations` e não registra admin — livro append-only não se edita pela tela.

## 6. Dinheiro e tempo

`Decimal` sempre, `float` nunca — o CI recusa `float(` em `backend/hotel`, `backend/accounts`,
`backend/core` e `backend/ai`. `core.money.quantize_money` é o único ponto de arredondamento (meia
unidade para cima). A API troca dinheiro como string decimal (`"120.00"`). `USE_TZ` ligado,
`America/Sao_Paulo`; as regras de horário (check-in às 14h, checkout às 12h) são avaliadas em hora
local.

## 7. Contrato HTTP

Todo erro sai no envelope `{code, detail, extra}`; os códigos são `VALIDATION_ERROR`,
`INVALID_STATUS`, `ROOM_UNAVAILABLE`, `EARLY_CHECKIN`, `DUPLICATE_DOCUMENT`, `PERMISSION_DENIED`,
`NOT_AUTHENTICATED`, `NOT_FOUND`. A reserva expõe `account` aninhado (`null` fora de CHECKED_IN e
CHECKED_OUT), com `status`, `total_amount`, `opened_at`, `closed_at` e `payment`. O extrato traz
`lines`, `subtotal_daily`, `subtotal_parking`, `late_fee`, `total` e
`payment {paid_at, method, received_by}`. `?paid=true` filtra conta `PAID`; `?paid=false` é o
complemento, e inclui reserva sem conta.

## 8. IA

`ai/` hospeda a Íris: `POST /api/ai/copilot/` roda um laço de *tool use* contra a Responses API da
OpenAI (httpx cru, sem SDK) em que o modelo **pede** a consulta e o Django a executa pelos mesmos
selectors e serviços das telas. Quatro leituras (`find_reservations`, `preview_checkout`,
`available_rooms`, `revenue_summary`) e uma função terminal `answer`, de onde a resposta sai
estruturada. Escrita, nenhuma: a ação proposta volta como um botão que chama os endpoints de check-in
e de checkout de sempre.

Saída de modelo é input não confiável em três frentes. **Argumentos**: ferramenta declarada no modo
estrito da OpenAI, e o serializer cobre o que o JSON Schema não expressa (data real, saída depois da
entrada, mínimos), devolvendo `{"error"}` ao modelo em vez de derrubar a requisição. **Identidade**:
a reserva precisa ter aparecido num resultado e estado isolada nele; id visto ao lado de outro fica
travado pelo resto da requisição. **Status**: relido antes de a ação sair, então um check-in
concorrente a zera.

Orçamento de 15 s e no máximo sete rodadas; na última o `tool_choice` força `answer`, senão um modelo
que fica repetindo consultas gasta o teto e vira 502. `ai` importa um único app de domínio,
`hotel.reservations` (§3): desligar a chave, ou apagar o pacote, remove a feature sem tocar em regra
de negócio. Documento e telefone nunca saem, e nada do conteúdo entra em log ([`docs/IRIS.md`](docs/IRIS.md)).

## 9. Testes e CI

`tests/unit` prova o motor puro sem banco; `tests/db` prova constraints, services e selectors contra
PostgreSQL real; `tests/api` prova o contrato HTTP ponta a ponta. Os ids normativos da matriz RF/RN
são imutáveis. O job de backend roda, nesta ordem: guard de `float(`, `ruff check`, `lint-imports`,
`makemigrations --check --dry-run` e `pytest` com piso de 85% sobre `hotel`, `accounts`, `core` e `ai`. O
job de frontend roda `pnpm run check`; o de e2e sobe o backend real com o seed.

## 10. Gatilhos de evolução

| Quando                                         | O que muda                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| lançamento avulso vira feature                 | `LineKind.EXTRA` de volta + `accountline_one_per_kind_date` volta a ser parcial (avulso repete data) + endpoint em `billing` + `extras`/`subtotal_extras` no extrato |
| uma estadia precisar de mais de uma conta      | `Reservation.account` OneToOne → FK                                            |
| pagamento parcial ou estorno                   | `Payment.account` OneToOne → FK, status da conta derivado da soma              |
| multi-hotel                                    | `UniqueConstraint(hotel, document)` em `guests`                                 |
| tarifa que varia por quarto, e não só por dia da semana | `RoomType` (ou preço no `Room`), consumido por `hotel.billing.services.rate_table_of` |
| vigência futura agendada de tarifa | `effective_from` no futuro já é suportado pelo modelo; falta a tela e a leitura por data |
| troca de quarto no meio da estadia | tabela de ocupação por trecho — a reserva deixa de ser a unidade de alocação |
| segundo cliente da API (mobile, integrador) | versionar a rota antes de ele existir, nunca depois |
| efeito externo que não pode ser perdido (e-mail, channel manager) | outbox transacional — não um broker no caminho crítico |
| consumidor do domínio fora do processo Django | aí sim, considerar inversão de dependência: `billing/engine.py` já é o hexágono |

Hexagonal, DDD tático e CQRS foram avaliados e recusados **para este tamanho**.
O resumo da recusa: `hotel/billing/engine.py` já é o hexágono, e o que sobra em
`hotel/reservations/services.py` é orquestração de transação — justamente a coisa
que *ports & adapters* abstrai pior. Comprar essas camadas agora seria vender
curva de aprendizado como robustez. Discordar exige um caso concreto que quebre
aqui e não quebre no desenho proposto.

## 11. Frontend: erros, formulários e contrato

**Cada falha tem um lugar na tela, e só um.** Erro de validação de campo vai ao
**campo culpado** (`aria-invalid` + mensagem, com a dica de formato ainda
visível ao lado). O `409 EARLY_CHECKIN` abre o **diálogo** de alerta com a hora
do servidor e o botão de confirmar (D4). Erro de mutation que nenhuma tela
apresenta vira **toast** — nunca um boundary, que apagaria o formulário e o que
o atendente digitou. Erro de render, e `5xx` na **primeira** carga de uma query,
caem no **ErrorBoundary** ("Algo deu errado", com "Tentar novamente" e
"Recarregar"); o boundary da tabela é local, então uma quebra nela mantém o
header, o "Novo hóspede" e os diálogos vivos. `4xx` e backend fora do ar seguem
inline, com retry, porque recarregar a aplicação não traz o servidor de volta.
E a **sessão expirada** é anunciada pelo interceptor de 401, não pela tela que
por acaso pediu a requisição: toast "Sua sessão expirou. Entre novamente.",
cache limpo e volta ao login. A tabela desse roteamento está em
`frontend/src/lib/api/queryClient.ts`.

**Formulários.** Login, cadastro de hóspede e criação de reserva usam
**react-hook-form + zod**, com um schema por feature
(`frontend/src/features/<x>/schemas.ts`) que **espelha as regras do servidor** —
documento com ≥ 4 alfanuméricos e telefone internacional válido (D9), entrada não
anterior a hoje e mínimo de 1 noite (D11/D13) — para o balcão errar antes da
rede. Espelhar não é confiar: o servidor continua **autoritativo**, e o
`400 VALIDATION_ERROR` que ele devolver é remapeado campo a campo; chave que o
formulário não declara (`non_field_errors`, `detail`) aparece no alerta de topo
em vez de sumir em silêncio.

**Contrato validado em runtime.** Toda resposta da API passa por um schema zod
antes de chegar à tela, e dinheiro só é aceito como string decimal de duas casas
(`frontend/src/lib/api/schemas.ts`). Um desvio de contrato vira `CONTRACT_ERROR`
visível — nunca um total plausível e errado na conta do hóspede.

## 12. Segurança, e o que continua em aberto

Segurança, em uma linha cada: JWT com permissão global fechada
(`IsAuthenticated`) e exceções explícitas; documento e telefone em claro
normalizado, busca por fragmento, PII fora de log; CSP estrita **nas respostas
do Django**, montada por middleware do backend, com isenção pontual só na página
do Swagger; headers de nosniff, referrer-policy e clickjacking; imagens Docker
rodando como usuário **non-root**; assets do Swagger servidos localmente
(funciona offline).

**Nenhuma credencial mora em disco**, o que fecha o trade-off clássico "os tokens
vivem em `localStorage`, logo um XSS os lê". O access fica numa variável de módulo
(`frontend/src/lib/auth/session.ts`) e morre com a aba; o refresh saiu do
alcance de qualquer script, num cookie `HttpOnly; Secure; SameSite=Strict;
Path=/api/auth/` que o navegador só anexa às duas rotas de sessão. Há teste em
cada camada afirmando que `localStorage` e `sessionStorage` ficam vazios.

Junto vêm `POST /auth/logout/`, que revoga o refresh na denylist do servidor, e um
teto absoluto de sessão, sem código próprio: o `exp` fixado no login é o prazo, e
renovar devolve um access novo sem estendê-lo. O CSRF ficou confinado às rotas de
cookie: rota autenticada por `Bearer` é imune por construção, já que o navegador
não anexa header sozinho.
`backend/docs/TECHNICAL_GUIDE.md` explica cada uma dessas decisões, incluindo
por que a denylist não foi para o Redis e por que a sessão nativa do Django foi
avaliada e recusada.

O que **continua** em aberto, dito com o nome certo: a CSP não cobre o
documento HTML da aplicação, porque quem o serve é o Vite e o cabeçalho vem do
middleware do Django. Com XSS ativo na página, `HttpOnly` impede a exfiltração
do refresh, não o abuso da sessão enquanto a aba está aberta. Servir a aplicação
por nginx com CSP própria trocaria o caminho canônico do Compose, e fica
registrado como o próximo passo — não escondido como defeito.


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
`hotel.rooms.services → hotel.reservations.selectors`: desativar um quarto e reduzir capacidade
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
| `billing`      | `Account`, `AccountLine`, `Payment` | `account_closed_is_complete`, `account_total_non_negative`, `accountline_one_per_kind_date`, `accountline_one_late_fee`, `accountline_quantity_non_negative`, `payment_amount_non_negative` | `AccountLine.amount` e `Account.total_amount` |
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
| durante         | `billing.post_line(kind=EXTRA, …)` — o livro aceita lançamento avulso; sem endpoint hoje      |
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
`lines`, `subtotal_daily`, `subtotal_parking`, `late_fee`, `extras`, `subtotal_extras`, `total` e
`payment {paid_at, method, received_by}`. `?paid=true` filtra conta `PAID`; `?paid=false` é o
complemento, e inclui reserva sem conta.

## 8. IA

`ai/` hospeda a Íris: `POST /api/ai/copilot/` roda um laço de *tool use* contra a Interactions API do
Gemini (httpx cru, sem SDK) em que o modelo **pede** uma consulta e o Django a executa pelos mesmos
selectors e serviços das telas. Quatro leituras (`find_reservations`, `preview_checkout`,
`available_rooms`, `revenue_summary`) e uma função terminal `answer`, de onde sai a resposta
estruturada — nenhum JSON é extraído de prosa. Escrita, nenhuma: a ação proposta volta ao frontend
como um botão que chama os endpoints de check-in e de checkout de sempre.

Nenhum app de domínio importa `ai`, e `ai` só alcança o domínio por `hotel.reservations` (§3):
desligar a chave, ou apagar o pacote, remove a feature sem tocar em regra de negócio.

Saída de modelo é input não confiável em três frentes: **argumentos** passam por serializer (e são
tolerantes onde o modelo omite, para que a falta de um campo custe uma rodada com `{"error"}` e não
um 502); **identidade** exige que a reserva tenha aparecido num resultado e tenha sido isolada nele
(um id visto ao lado de outro fica travado pelo resto da requisição, mesmo que o modelo afunile
depois); **status** é relido antes de a ação sair, então um check-in concorrente a zera. O laço tem
orçamento de 15 s e no máximo quatro rodadas, com folga sobre o timeout do worker.

Duas chaves e um fallback: `GEMINI_API_KEY` (projeto sem billing, tier gratuito) e, opcional,
`GEMINI_API_KEY_PAID`; no `429` da primeira o cliente repete a chamada com a segunda e segue com ela
até o fim daquele request. O que sai para o provedor: nomes, quartos, datas, o extrato projetado e
agregados de faturamento. **Documento e telefone nunca saem**, e nada do conteúdo entra em log.

## 9. Testes e CI

`tests/unit` prova o motor puro sem banco; `tests/db` prova constraints, services e selectors contra
PostgreSQL real; `tests/api` prova o contrato HTTP ponta a ponta. Os ids normativos da matriz RF/RN
são imutáveis. O job de backend roda, nesta ordem: guard de `float(`, `ruff check`, `lint-imports`,
`makemigrations --check --dry-run` e `pytest` com piso de 85% sobre `hotel`, `accounts`, `core` e `ai`. O
job de frontend roda `pnpm run check`; o de e2e sobe o backend real com o seed.

## 10. Gatilhos de evolução

| Quando                                         | O que muda                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| lançamento avulso vira feature                 | endpoint em `billing` + render de `extras` no extrato; `reservations` não muda  |
| uma estadia precisar de mais de uma conta      | `Reservation.account` OneToOne → FK                                            |
| pagamento parcial ou estorno                   | `Payment.account` OneToOne → FK, status da conta derivado da soma              |
| multi-hotel                                    | `UniqueConstraint(hotel, document)` em `guests`                                 |

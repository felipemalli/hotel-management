# O desafio e a prova de conclusão

O projeto foi construído para o desafio abaixo. Este documento numera o
enunciado e aponta, item a item, onde cada parte está implementada e provada.
As regras de negócio completas, incluindo as adicionadas, estão em
[BUSINESS_RULE.md](./BUSINESS_RULE.md).

## 1. O desafio, numerado

**Objetivo.** Desenvolver uma aplicação para realizar a gestão de hóspedes em
um hotel. Deverá permitir a realização de reservas, check-in, checkout. A
aplicação deverá conter login.

### Requisitos funcionais

| ID  | Requisito                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------- |
| RF1 | Armazenar de forma persistente o cadastro de hóspedes (informações mínimas: nome, documento, telefone) |
| RF2 | Armazenar de forma persistente as reservas geradas                                                   |
| RF3 | Deve ser possível localizar hóspedes por: nome, documento e telefone                                  |
| RF4 | Localizar hóspedes que ainda estão no hotel                                                          |
| RF5 | Localizar hóspedes que têm reservas, mas ainda não realizaram o check-in                              |
| RF6 | Permitir ao atendente realizar o check-in                                                            |
| RF7 | Permitir ao atendente realizar o checkout                                                            |
| RF8 | A aplicação deverá conter login *(do objetivo)*                                                      |

### Regras de negócio

| ID  | Regra                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN1 | Diárias de segunda à sexta-feira terão um valor fixo de R$ 120,00                                                                                               |
| RN2 | Diárias em finais de semana terão um valor fixo de R$ 180,00                                                                                                    |
| RN3 | Caso o hóspede tenha carro e necessite utilizar as vagas disponíveis no estabelecimento, será cobrada uma taxa adicional de R$ 15,00 de segunda à sexta-feira e R$ 20,00 nos finais de semana |
| RN4 | O horário para a realização do check-in será a partir das 14h00min. Ao tentar realizar o procedimento antes do horário previsto, o sistema deverá emitir um alerta |
| RN5 | O horário para a realização do checkout será até as 12h00min. Caso o procedimento seja realizado posteriormente, deverá ser cobrada uma taxa adicional de 50% do valor da diária (respeitando a variação para dias úteis e finais de semana) |
| RN6 | Durante o processo de checkout, deverá ser exibido em detalhes o total geral da reserva a ser paga                                                               |

### Requisitos técnicos

| ID  | Requisito                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| RT1 | Python, Django e PostgreSQL para backend e React para frontend. Demais frameworks e/ou recursos podem ser adicionados, desde que julgue adequado para a solução do problema |
| RT2 | **IMPORTANTE:** é imprescindível a apresentação dos testes unitários tanto no frontend quanto no backend para validar os requisitos funcionais e regras de negócio |

## 2. Onde cada requisito está provado

Os ids abaixo são **normativos**: um arquivo pode mudar de pasta, mas o nome
do arquivo e o id do caso não mudam sem que esta matriz mude primeiro. O CI
tem uma guarda própria para os ids do frontend (`Guard - normative test ids
exist` em `.github/workflows/ci.yml`).

| ID  | Requisito                            | Prova backend                                       | Prova frontend                                                   | e2e                                     |
| --- | ------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| RF1 | Cadastro persistente de hóspede      | `test_create_guest_persists_normalized_pii`         | `GuestForm.test.tsx::test_requires_name_document_phone`           | `reception.spec.ts`                     |
| RF2 | Reservas persistentes                | `test_create_reservation_persists_pending`          | `ReservationForm.test.tsx::test_submits_dates_and_vehicle_flag`   | `reception.spec.ts`                     |
| RF3 | Localizar por nome, documento, tel.  | `test_search_name_fragment` e afins                 | `GuestTable.test.tsx::test_search_input_debounces_and_queries`    | `reception.spec.ts`                     |
| RF4 | Hóspedes ainda no hotel              | `test_in_hotel_only_checked_in`                     | `GuestTable.test.tsx::test_tab_in_hotel_switches_dataset`         | (nenhum e2e próprio)                    |
| RF5 | Com reserva, sem check-in            | `test_pending_checkin_lists_pending`                | `GuestTable.test.tsx::test_tab_pending_switches_dataset`          | `reception.spec.ts`                     |
| RF6 | Atendente realiza o check-in         | `test_checkin_after_14_succeeds`                    | `EarlyCheckinFlow.test.tsx::test_checkin_success_updates_row`     | `reception.spec.ts`                     |
| RF7 | Atendente realiza o checkout         | `test_checkout_freezes_totals`                      | `CheckoutStatementDialog.test.tsx::test_T7_full_statement`        | `reception.spec.ts`, `checkout.spec.ts` |
| RF8 | Login                                | `test_login_returns_access_and_sets_refresh_cookie` | `ProtectedRoute.test.tsx::test_redirects_anonymous_to_login`      | `login.spec.ts`, `admin.spec.ts`        |
| RN1 | Diária útil R$ 120,00                | `test_truth_table[T1]`, `[T4]`                      | `test_T1_no_late_fee_line`                                        | `checkout.spec.ts`                      |
| RN2 | Diária de fim de semana R$ 180,00    | `test_truth_table[T2]`                              | `test_T7_full_statement`                                          | `checkout.spec.ts`                      |
| RN3 | Vaga R$ 15,00 / R$ 20,00             | `test_truth_table[T2]`, `[T3]`, `[T9]`              | `test_T7_full_statement`                                          | `checkout.spec.ts`                      |
| RN4 | Check-in a partir das 14h, c/ alerta | `test_early_checkin_boundaries`                     | `test_409_opens_dialog_and_retry_allow_early`                     | `reception.spec.ts` (a fronteira das 14h não é afirmada: relógio real) |
| RN5 | Checkout até 12h, multa de 50%       | `test_truth_table[T5]`, `[T7]`, `[T8]`              | `test_T7_full_statement`                                          | `checkout.spec.ts`                      |
| RN6 | Extrato detalhado no checkout        | `test_checkout_statement_matches_T7`                | `test_T7_full_statement`                                          | `checkout.spec.ts`                      |

Os `describe(...)` do frontend carregam a mesma tag, então dá para rodar uma
fatia: `pnpm test -- --run -t "RN5"`.

## 3. As regras em números (T1–T9)

Calendário de referência **março/2025** (03 = seg … 08 = sáb, 09 = dom, 10 =
seg). Esta tabela é a fonte da verdade do dinheiro e é replicada **1:1** em
`backend/tests/unit/test_pricing.py` e em
`frontend/src/features/reservations/__fixtures__/bills.ts`. Divergência entre
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

Nos nove casos a saída contratada coincide com a real. Fronteiras que o
enunciado deixa em aberto e que os testes fixam: **12:00:00 em ponto é
isento** de multa (T8) e o check-in abre em **14:00:00** (13:59:59 →
`409 EARLY_CHECKIN`).

## 4. Onde o enunciado era ambíguo

Cada leitura abaixo é uma regra em [BUSINESS_RULE.md](./BUSINESS_RULE.md) e
tem um caso numérico em que a alternativa daria outro valor.

| Ambiguidade                                     | Leitura adotada                                                                                                                                                  | Caso que separa as leituras                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Como contar diárias                             | Uma por data, do menor entre entrada real e contratada até o maior entre saída real e contratada; mínimo de 1 (RN7)                                              | T9 (day-use com vaga) = **195,00**; contar só noites dormidas daria 60,00                                                            |
| Qual tarifa aplica em cada diária               | A do dia da própria data (RN9)                                                                                                                                   | Qui 06 → Sáb 08: pela data, 120 + 120 = 240,00; pela noite que termina, 120 + 180 = 300,00. Nos T1–T9 as duas leituras coincidem (T3 dá 480,00 em ambas) |
| "Até as 12h00min"                               | Inclusivo: 12:00:00 em ponto é isento (RN10)                                                                                                                     | T8 (12:00:00) = 240,00; T5 (12:01) = 300,00                                                                                          |
| Base da multa: útil ou fim de semana?           | 50% da tarifa do dia da saída (RN10)                                                                                                                             | T7: saída no domingo → 90,00, não 60,00                                                                                              |
| Permanência de vários dias além do contratado   | Uma multa **por dia** (RN10). O enunciado diz "uma taxa"; a leitura por dia é deliberada e indiferente nos T1–T9, que têm um só dia de multa                        | Contratado 10→15/09, saída 17/09 13:00: 7 diárias, 7 vagas e 3 multas                                                                |
| Vaga no dia da saída tardia                     | Não se cobra: a vaga acompanha as diárias, e o enunciado enumera a penalidade de forma exaustiva (RN10)                                                           | T7 = 425,00, não 445,00                                                                                                              |
| "Emitir um alerta" antes das 14h                | Alerta com confirmação, não bloqueio: `409 EARLY_CHECKIN` e reenvio com `allow_early` (RN11)                                                                      | 13:59:59 → 409; 14:00:00 → 200                                                                                                       |
| Saída antecipada ou chegada atrasada            | Não devolve diária: paga-se o período contratado (RN8)                                                                                                            | Agendado seg→qua, saída ter 11:00: 240,00                                                                                            |
| "Localizar por documento e telefone"            | Por fragmento, sobre valores normalizados (RN25)                                                                                                                 | `789` e `123.456.789-01` acham a mesma ficha                                                                                         |
| "Total geral a ser paga"                        | O extrato congela no checkout; o pagamento é um fato posterior, único e integral (RN14, RN15)                                                                     | A 2ª via é idêntica antes e depois do pagamento                                                                                      |

## 5. Requisitos técnicos

**RT1: stack.**

| Pedido      | Entregue                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Python      | 3.13, dependências travadas com `uv`                                                                            |
| Django      | 5.2 LTS + Django REST Framework, SimpleJWT, drf-spectacular (OpenAPI 3 + Swagger)                              |
| PostgreSQL  | 17 (constraints nomeadas, `EXCLUDE` gist para a agenda, trigram para a busca)                                   |
| React       | 18 + TypeScript, Vite, TanStack Query e Table, react-hook-form + zod, Tailwind, shadcn (Base UI)                |
| Adicionados | Docker Compose, Redis (cache de throttle), Caddy (TLS em produção), Pytest, Vitest + Testing Library, Playwright |

**RT2: testes unitários no frontend e no backend.** Unitários no sentido
estrito: `backend/tests/unit/` (motor de cálculo com T1–T9, fronteiras
11:59 / 12:00:00 / 12:01, day-use e normalização de PII, sem banco) e, no
frontend, `src/lib/**/*.test.ts` e `src/features/*/schemas.test.ts` (dinheiro,
datas, PII, schemas com regra). Além deles: testes de banco (PostgreSQL real),
de API ponta a ponta, de integração de UI e e2e. Comandos no
[README](../README.md); doutrina, cobertura e ferramental em
[concepts/QUALITY.md](./concepts/QUALITY.md).

## 6. Além do enunciado

Os catorze requisitos (RF1–RF8, RN1–RN6) estão construídos e rastreados na
matriz do §2. Sete expansões entraram, cada uma resolvendo um problema que o
próprio enunciado cria, e cada uma com tela e teste:

| Expansão                                     | O problema do enunciado que ela resolve                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Room` + anti-overbooking (RN20)             | "Realizar reservas" sem inventário reserva o quê? Sem quarto, duas reservas ocupam o mesmo lugar e nada impede.             |
| `PricingPolicy` amarrada no check-in (RN13)  | Onde vivem 120/180/15/20? Como constante, mudar a tarifa reescreveria a 2ª via de um extrato já emitido.                    |
| Ator em cada transição (RN26)                | "Permitir ao atendente" pressupõe saber **qual** atendente.                                                                |
| Pagamento único da conta fechada (RN15)      | "Total geral **a ser paga**" implica um fato de recebimento; sem ele o extrato nunca fecha.                                 |
| Titular + acompanhantes (RN22)               | "Localizar hóspedes que estão no hotel": um número de pessoas não é uma pessoa, e não apareceria em busca.                  |
| Nacionalidade e telefone com DDI (RN24)      | "Localizar por telefone" exige normalizar; sem o `+`, `119…` é lido como EUA e o hóspede nunca volta ao dono.               |
| Papéis `ATTENDANT` / `ADMIN` (RN27)          | Cadastrar quarto e publicar tarifa não são gestos de balcão.                                                               |

E uma oitava, **opcional e desacoplada**: a [Íris](./concepts/IRIS.md),
copiloto que responde em linguagem natural pedindo consultas ao Django, uma por
vez, sem nunca gravar nada. Desligada sem `OPENAI_API_KEY`; o núcleo do sistema
não sabe que ela existe, e o import-linter cobra isso.

**Deliberadamente fora:** tarifa por quarto e vigência futura agendada, troca de
quarto no meio da estadia, estorno e pagamento parcial, edição e exclusão
genéricas de hóspede e reserva, no-show automático, gestão de usuários via API,
recuperação de senha, Celery, WebSockets, i18n, multi-tenancy, tema dark,
Storybook, hexagonal, DDD tático, CQRS. Os que têm caminho de evolução previsto
(tarifa por quarto, vigência futura, troca de quarto, estorno e pagamento
parcial, multi-tenancy, hexagonal/DDD/CQRS) têm o gatilho em
[ARCHITECTURE.md §12](./ARCHITECTURE.md); os demais ficaram fora por não terem
sido pedidos nem criados pelo enunciado. O no-show automático, em particular,
porque o sistema não muda estado sem gesto humano (RN19).

## 7. Dados de demonstração

O `seed_demo` roda na subida do Compose (e uma vez, por comando, em produção).
É idempotente e usa **datas relativas**, então o cenário vale em qualquer dia; as
transições passam pelos mesmos services que a API usa, com o relógio injetado.

| Hóspede         | Situação                                              | Demonstra                                        |
| --------------- | ----------------------------------------------------- | ------------------------------------------------ |
| **Ana Souza**   | `PENDING`, entrada hoje, com veículo                  | aba "Check-in pendente" e o fluxo de check-in     |
| **Bruno Lima**  | `CHECKED_IN` no quarto 102, com a acompanhante Eva    | aba "No hotel", checkout, acompanhantes (RN22)    |
| **Eva Lima**    | Acompanhante do Bruno, argentina (`+54 11 5555-4444`) | telefone com DDI estrangeiro                      |
| **Carla Nunes** | `CHECKED_OUT` sex→dom, com vaga, saída 12:01          | extrato com diária de fim de semana **e** multa de 90,00 |
| **Davi Rocha**  | Sem reserva                                           | busca por nome, documento e telefone              |

Quatro quartos: 101 (cap. 2), 102 (2), 103 (3), 201 (4). Dois usuários,
`atendente` / `atendente123` e `admin` / `admin123`, ambos usuários comuns do
Django: o papel `ATTENDANT`/`ADMIN` é do produto. O admin do Django não está
instalado, porque gravaria na base sem passar por service nenhum; para
inspecionar dados, use o Swagger ou `docker compose exec db psql -U hotel -d hotel`.

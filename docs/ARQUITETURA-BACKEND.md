# Arquitetura do backend — retrato, tensões e opções

**Escopo:** apenas o backend (`backend/`), o compose e o CI. Frontend fora.
**Objetivo:** dar base para decidir, não prescrever reescrita.
**Data da análise:** 2026-09-01. Commit base: `2a9caea`.

> **Atualização 2026-09.** A cifra Fernet de `document`/`phone` foi revertida.
> Campo cifrado + `LIKE` são objetivos incompatíveis; o briefing pede localizar
> por fragmento, e criptografia de campo é excesso que o negócio não usa (D5).
> As colunas guardam o valor já normalizado (D9); a busca é `icontains` nos
> três campos; unicidade de documento é `unique=True` na própria coluna. T6
> (rotação de chave) deixa de existir. Os `arquivo:linha` abaixo que citam
> `fields.py` / `crypto.py` descrevem o estado de 2026-09-01, não o código
> atual. Os dossiês em `ai-plans/arquitetura/` ficam como retrato da revisão.

---

## 0. Método e o que foi de fato verificado

Toda afirmação sobre o código abaixo tem `arquivo:linha`. Toda afirmação sobre
comportamento foi medida na stack de pé, não inferida.

> **Leia os `arquivo:linha` como do commit `0478737`**, que era o `HEAD` quando
> esta análise foi escrita. A rodada de correções da seção 0.1 mexeu em vários
> desses arquivos, então parte dos números deslocou alguns pontos — os nomes de
> função, classe e módulo continuam exatos, e são eles que localizam o trecho.
> Os números medidos abaixo (suíte, cobertura, workers) também são daquele
> commit; os atuais estão em `README.md` e no `docs/GUIA-DO-PROJETO.md`.

O que rodei:

| Verificação | Comando | Resultado |
|---|---|---|
| Suíte completa | `pytest -q` (no container) | **179 passed em 82 s** |
| Suíte por camada | `pytest -q tests/{unit,db,api}` | unit 57/0,44 s · db 51/4,1 s · **api 71/74 s** |
| Cobertura | `pytest --cov=hotel --cov=accounts --cov=ai` | **98 %** (763 statements, 18 sem cobertura) |
| Custo de hash de senha | `make_password("x")` no container | **0,557 s** (PBKDF2, sem override em settings) |
| Índice trigram (V5 da SPEC) | `EXPLAIN` com `enable_seqscan=off` | `Bitmap Index Scan on guest_name_trgm_upper` — **confere** |
| Schema real da tabela | `\d+ hotel_guest` | `document`/`phone` = `text`; 6 índices; FK `PROTECT` |
| Processos do gunicorn | leitura de `/proc/*/cmdline` | **master + 1 worker** (default; não há `-w`) |
| Duplo check-in do mesmo hóspede | `POST /api/reservations/8/check-in/` | **HTTP 500, corpo HTML** — ver T3 |
| Mascaramento e busca | `GET /api/guests/`, `/guests/1/`, `?search=` | histórico: mascaramento existia; hoje valor gravado + fragmento |
| Rota de detalhe de reserva | `GET /api/reservations/1/` | **404 HTML** — não existe `retrieve` |

> **Nota sobre uma sujeira que existiu.** A sonda do duplo check-in (T3) rodou
> via `manage.py shell` esperando rollback por savepoint; em autocommit o
> savepoint e no-op, e ela persistiu `Guest id=8 "Probe Concorrencia"` no banco
> de demo. **Ja foi removida** com `docker compose down -v`: o banco atual tem
> as 4 fichas do seed e 3 reservas. A nota fica como registro de que os numeros
> desta secao foram medidos com aquele ruido presente, sem efeito sobre eles.

---

## 0.1 Estado das tensões após a rodada de correções (2026-09-01)

Este documento foi escrito com o backend no estado do commit `0478737`. A
leitura dele motivou uma rodada de correções imediatas, então **as tensões
abaixo já não descrevem o código atual**. O diagnóstico continua valendo como
registro do porquê de cada mudança; as Partes 3 e 4 continuam valendo
integralmente, porque tratam do que ainda não foi feito.

| Tensão / achado | Estado | Onde |
|---|---|---|
| **T3** — invariante entre linhas virava HTTP 500 | **corrigido** | `62c7167` — trava passou para a linha do hóspede e há checagem explícita; 2 testes que falham se a checagem sair |
| **T12** — gunicorn com 1 worker sync | **corrigido** | `629fff0` — `-w ${GUNICORN_WORKERS:-3}`, 3 workers confirmados em `/proc` |
| **T13** — 90 % do relógio da suíte em hash de senha | **corrigido** | `52e92af` — hash duplicado removido e hasher rápido no teste: **82 s → ~7 s** |
| Apêndice 2 — `SECRET_KEY` com default silencioso | **corrigido** | `d650d47` — obrigatória com `DEBUG=0`, processo recusa subir sem ela |
| Apêndice 3 — seed criava superusuário | **corrigido** | `d650d47` — atendente é `CustomUser` comum, como manda a §1.1 |
| Apêndice 4/5 — sem throttling em login e IA | **corrigido** | `629fff0` — 10/min por IP no login, 20/min por usuário na IA, saindo como `429 THROTTLED` no envelope da §4.1 |
| Apêndice 6 — `document`/`phone` sem máximo | **corrigido** | `1ceca82` — `max_length` na entrada |
| Apêndice 8 — lookup em campo cifrado devolvia vazio | **superado** | cifra removida em 2026-09; `document`/`phone` são `CharField` buscáveis |
| Apêndice 9 — `desafio.md` fora do `.gitignore` | **corrigido** | `037072d` |
| Apêndice 10 — 122 erros numa execução da suíte | **causa confirmada** | não é flakiness do código: dois `pytest` concorrentes no mesmo banco. A mensagem exata é `database "test_hotel" is being accessed by other users` no `DROP DATABASE` |
| Apêndice 7 — `bulk_create` corrompe o blind index | **superado** | manager recusa `bulk_create`; a razão atual é normalização, não hash |
| **T1, T2, T4, T5, T6, T7, T8, T9, T10, T11** | **abertos, por decisão** | são as tensões de longo prazo; a Parte 4 dá o gatilho de cada uma |

Uma consequência não óbvia da rodada, que vale como lição de arquitetura: as
correções de T12 e do apêndice 4 **se anulavam**. Passar o gunicorn a 3 workers
tornou o throttling decorativo, porque o `LocMemCache` é por processo e o
histórico de tentativas se dividia — 12 senhas erradas, 12 respostas `401`,
medido. Como a §0.1 da SPEC tira Redis do escopo, o armazenamento compartilhado
virou o próprio Postgres (`DatabaseCache` + `createcachetable` na cadeia de
subida). Rate limiting é uma propriedade do *sistema*, não do processo.

A sujeira do probe (`Guest id=8`) foi removida com `docker compose down -v`.

---

# Parte 1 — Retrato honesto da arquitetura atual

## 1.1 Qual é o estilo, com nome próprio

Não é "fat models". Não é hexagonal. É um **monólito Django modular com
camadas explícitas e um núcleo funcional puro no lugar exato onde importa**.
Concretamente:

- **Models anêmicos por decisão** (`hotel/models.py`): campos, `Meta`
  (índices e constraints), `__str__`. O único comportamento que sobrevive no
  model é a normalização de documento/telefone em `Guest.save()` — e a
  justificativa está no docstring do módulo: tem de valer para qualquer
  caminho de escrita. Zero dinheiro no model.
- **Leitura em `selectors.py`** (90 linhas): 4 consultas nomeadas, nenhum
  efeito colateral. Nenhuma view monta QuerySet à mão — exceto os
  `select_related` triviais de `get_queryset` (`views.py:240,249`).
- **Mutação em `services/reservations.py`** (164 linhas): máquina de estados
  (`ALLOWED_TRANSITIONS`, `reservations.py:25-32`), transação, trava, conversão
  de fuso, congelamento de totais.
- **Núcleo puro em `services/pricing.py`** (141 linhas): sem ORM, sem I/O, sem
  relógio próprio. Funções e dois `@dataclass(frozen=True)`. É o único módulo
  do repositório que sobreviveria intacto a uma troca de framework.
- **I/O em `serializers.py`** (304 linhas) e **HTTP em `views.py`** (398
  linhas). As views são finas de verdade: `checkout` tem 4 linhas
  (`views.py:374-378`), o resto do arquivo é `@extend_schema`.
- **Envelope único de erro** em `hotel/exceptions.py` (118 linhas), plugado em
  `REST_FRAMEWORK["EXCEPTION_HANDLER"]` (`settings.py:154`).

Isso é o padrão que a comunidade Django chama de *service layer* /
"Django styleguide": camadas dentro do framework, sem inversão de dependência.
O domínio **importa Django** (`models.TextChoices` em `models.py:21`,
`django.utils.timezone` em `reservations.py:18`) e isso é deliberado — não há
`Protocol`, nem repositório, nem adaptador. A única fronteira arquitetural real
é `pricing.py`, e ela é mantida por ausência de imports, não por interface.

## 1.2 Fluxo de ponta a ponta — `POST /api/reservations/{id}/checkout/`

```
HTTP POST /api/reservations/7/checkout/     Authorization: Bearer <access>
   │
   ├─ SecurityMiddleware → WhiteNoise → CSPMiddleware        settings.py:52-72
   ├─ SimpleJWT autentica (DEFAULT_AUTHENTICATION_CLASSES)   settings.py:145-147
   └─ IsAuthenticated global — fechado por padrão            settings.py:150
   │
   ▼
ReservationViewSet.checkout(request, pk)                      views.py:374-378
   ├─ self.get_object()  →  get_queryset() → select_related("guest")   :247-253
   └─ now = timezone.now()      ◄── ÚNICO ponto do sistema que lê o relógio
   │
   ▼
services.reservations.check_out(reservation, now=now)      reservations.py:89-122
   ├─ transaction.atomic()                                              :91
   ├─ _lock()  →  SELECT … FOR UPDATE  (relê a linha)               :147-149
   ├─ _assert_transition(CHECKED_OUT) → InvalidStatusError          :152-157
   └─ timezone.localtime(...)   UTC no banco → hora local na regra    :99-100
   │
   ▼
services.pricing.calculate_bill(checkin, checkout, has_vehicle)  pricing.py:112-141
   │   ┌───────────────────────────────────────────────────────────┐
   │   │ NÚCLEO PURO: sem ORM, sem relógio, sem I/O. Só Decimal.   │
   │   │ stay_dates (D1) → daily_rate/parking_fee por data (D2)    │
   │   │ → late_fee pela tarifa do dia da saída (D3) → quantize    │
   │   └───────────────────────────────────────────────────────────┘
   ▼  Bill (frozen dataclass) — lines[], subtotais, multa, total
   │
   ├─ congela na linha: total_daily / total_parking / late_fee / total_amount
   │  save(update_fields=[...])  dentro da MESMA transação            :104-119
   └─ COMMIT
   │
   ▼
build_statement(reservation, bill)   remapeia, não calcula      serializers.py:288-304
StatementSerializer                  Decimal → string "425.00"  serializers.py:274-285
   ▼
200 OK   {"lines":[…], "subtotal_daily":"300.00", …, "total":"425.00"}


Erro em qualquer ponto ▶  hotel.exceptions.api_exception_handler   exceptions.py:61-79
     ReservationError (domínio)  → 409 {"code","detail","extra"}         :63-69
     exceções do DRF             → 400/401/404 no mesmo envelope         :71-79
     qualquer outra exceção      → return None → 500 HTML do Django  :73-75  ◄── T3
```

O caminho de leitura é análogo e mais curto: view → `selectors.*` → serializer.
`GET /api/guests/in-hotel/` (`views.py:168-170`) chama
`selectors.guests_in_hotel()` (`selectors.py:46-62`), que usa `Prefetch(...,
to_attr=...)` para que o serializer leia uma lista já materializada
(`serializers.py:156-160`) — 2 queries, sem N+1.

## 1.3 Onde vive cada preocupação

| Preocupação | Onde vive | Nota |
|---|---|---|
| Regra de dinheiro | `services/pricing.py:112-141` | Puro. Único lugar que conhece tarifas. |
| Arredondamento | `pricing.py:66-68` (`quantize_money`) | Ponto único, `ROUND_HALF_UP`. |
| Máquina de estados | `reservations.py:25-32` + `_assert_transition:152-157` | Espelha SPEC §1.5. |
| Transação / trava | `reservations.py:73,91,127` + `_lock:147-149` | `atomic` + `select_for_update`. |
| Relógio | `views.py:321,377` (`timezone.now()`) | **Uma exceção:** `serializers.py:222`. |
| Conversão de fuso | `reservations.py:77,99-100,141-142` | `localtime` antes da regra. |
| Normalização de PII | `hotel/normalization.py` | Por tipo (D9); `Guest.save()` persiste o valor normalizado. |
| Busca por fragmento | `selectors.search_guests` | `icontains` em nome, documento e telefone. |
| Unicidade de documento | `document` unique + `services/guests.py` | D12: leitura prévia + constraint. |
| Integridade | `models.py` (3 constraints) | No banco, não só em Python. |
| Envelope de erro | `exceptions.py:61-79` | Um ponto. |
| Validação de agendamento (D11/D13) | `serializers.py:219-233` | **Vaza para o I/O** — ver T11. |
| Guarda de documento duplicado (D12) | `services/guests.py` + constraint única | Leitura + corrida. |
| Criação de Guest | `services/guests.py` | Toda escrita passa por serviço. |

## 1.4 O dinheiro

Disciplina real, não declarada:

- `Decimal` em todo lugar; as constantes são literais de string
  (`pricing.py:19-23`), nunca `float`.
- Uma única função de arredondamento (`pricing.py:66-68`), aplicada nos
  subtotais e no total (`pricing.py:124-125,131,140`).
- Saída como **string** decimal, garantida pelo `DecimalField` do DRF via um
  único helper (`serializers.py:36-41`) — o cliente não faz aritmética.
- Guarda no CI contra regressão: `! grep -RnE "float\(" backend/hotel
  backend/accounts` (`.github/workflows/ci.yml:48-50`).
- Congelamento na linha da reserva dentro da transação
  (`reservations.py:104-119`), com uma `CheckConstraint` que impede o estado
  terminal existir sem total (`models.py:115-119`).
- A tabela §3.3 da SPEC está parametrizada 1:1 em `tests/unit/test_pricing.py`
  (57 testes, 0,44 s, 100 % de cobertura em `pricing.py`).

Isso é o ponto mais forte do backend. É também o único lugar onde a arquitetura
foi escolhida pela propriedade que se queria (auditabilidade aritmética) e não
por convenção de framework.

## 1.5 O tempo

O invariante do relógio injetável é real e verificável:

- `pricing.early_checkin(now)` / `late_checkout(now)` recebem `datetime`
  (`pricing.py:102-109`) e leem `.time()`. Não chamam nada.
- `check_in`/`check_out`/`statement` recebem `now` como keyword obrigatório
  (`reservations.py:71,89`) e convertem com `timezone.localtime` **antes** de
  aplicar a regra (`reservations.py:77,99-100`).
- A view é o único lugar que materializa "agora" (`views.py:321,377`).
- Consequência prática: os 51 testes de `tests/db` cobrem regra de horário sem
  `freezegun` e sem monkeypatch de domínio — `freezegun` aparece só na borda
  HTTP, como a SPEC §6.1 previu. Existe teste explícito de que a regra é
  avaliada em hora local (`tests/db/test_services.py:75`).

Uma frouxidão honesta: `early_checkin`/`late_checkout` **confiam** que o
chamador já localizou o `datetime`. O contrato está no docstring
(`pricing.py:5-7`), não no tipo. Passar um `datetime` em UTC produz resposta
errada silenciosamente. Hoje há um único chamador e ele acerta.

## 1.6 A PII

`document` e `phone` são `CharField` em claro. `Guest.save()` normaliza por
tipo (D9) em qualquer caminho de escrita: documento alfanumérico maiúsculo,
telefone só dígitos. A coluna guarda `12345678901`, não `123.456.789-01`. Há
teste de que dois passaportes distintos não colidem
(`tests/db/test_selectors.py`) — a alternativa rejeitada em §0.5/D9 era um
bug real, e ela está coberta.

Busca (`selectors.search_guests`) é `icontains` nos três campos, com o termo
de documento/telefone normalizado antes do predicado — `789` e `789-01`
acham a Ana. Três índices GIN funcionais (`Upper(...) gin_trgm_ops`) casam
o SQL real do `icontains`. Unicidade de documento é `unique=True` na própria
coluna; a guarda D12 mora em `services.guests.create_guest`.

A API devolve o valor gravado (listagem e detalhe são o mesmo serializer).
Máscara de CPF/telefone é formatação de exibição no frontend. O handler de
erro não ecoa o body (`exceptions.py`), e há dois testes de que o texto
livre da IA não vai para log (`tests/api/test_ai.py`).

`Guest.objects.bulk_create` é recusado: sem `save()`, a linha entra com a
máscara digitada e fura unicidade e busca em silêncio.

A cifra Fernet + blind index HMAC existiu até 2026-09 e foi revertida: cifra
e `LIKE` são objetivos incompatíveis, e criptografia de campo é excesso que
o negócio não usa (D5). Sem ciphertext não há chave para girar; sem hash não
há pepper. T6 desta lista está superada.

## 1.7 As fronteiras que existem de fato

```
┌─────────────────────────── config/ ────────────────────────────┐
│  settings.py · urls.py · health.py                             │
│  a única amarra do app opcional: path("api/ai/", …)  urls.py:33│
└────────────────────────────────────────────────────────────────┘
        │                                          │
        ▼                                          ▼
┌──────────── hotel/ ─────────────┐      ┌──────── ai/ ─────────┐
│ views → serializers            │      │ views → serializers   │
│   ↓         ↓                  │      │   ↓                   │
│ selectors  services/           │      │ client.py (httpx)     │
│              reservations.py   │◄─────┤ exceptions.py         │
│                   ↓            │ usa  │ (herda ApiError)      │
│         ╔══════════════════╗   │      └───────────────────────┘
│         ║  pricing.py      ║   │       dependência de UMA via:
│         ║  PURO — sem ORM  ║   │       ai/ → hotel/, nunca o inverso
│         ╚══════════════════╝   │       não está em INSTALLED_APPS
│ models.py · normalization.py   │
└─────────────────────────────────┘
                │
        ┌───── accounts/ ─────┐   CustomUser vazio (AbstractUser)
        └─────────────────────┘
```

Quatro fronteiras, com força muito diferente:

1. **`pricing.py` ↔ resto** — forte e real. Mantida por ausência de imports.
2. **`ai/` ↔ `hotel/`** — real e unidirecional (`ai/exceptions.py:19` importa
   `hotel.exceptions.ApiError`; `ai/views.py:27` importa o
   `ErrorEnvelopeSerializer`). Não está em `INSTALLED_APPS`
   (`settings.py:37-50`) porque não tem models. O corte de escopo previsto em
   §8.4/C1 é literalmente apagar o pacote e uma linha de `urls.py`. Verificado:
   `GET /api/ai/status/` → `{"enabled": false}` com a stack funcionando 100 %.
3. **`views` ↔ `services`/`selectors`** — real. As views não calculam nada.
4. **`hotel/` ↔ Django** — inexistente, por escolha. O domínio *é* Django.

Ainda: não existe `hotel/admin.py`. O admin registra só o `CustomUser`
(`accounts/admin.py:6`), então o admin **não é** um caminho de escrita do
domínio. Isso é um acerto silencioso — fecha uma superfície inteira.

## 1.8 O que essa arquitetura acerta, e por quê

Sem generosidade e sem strawman: para o tamanho do problema, este backend está
acima da média. Os acertos que eu defenderia num comitê:

1. **Núcleo puro exatamente onde a correção é auditável.** A escolha não foi
   "vamos fazer camadas"; foi "a aritmética do briefing tem 9 casos de
   fronteira, então ela vira função pura com tabela-verdade". `pricing.py` tem
   100 % de cobertura e 57 testes que rodam em 0,44 s. Isso é o padrão
   *functional core, imperative shell* aplicado com parcimônia — não ao sistema
   todo, só à parte que paga.
2. **Relógio injetável.** É a decisão que mais retorna por linha escrita. Sem
   ela, todo teste de horário viraria `freezegun` global e o domínio ficaria
   acoplado a um patch. Com ela, `tests/db` (51 testes, 4,1 s) testa regra de
   14h/12h passando `datetime` na mão.
3. **Constraints no banco, não só em Python.** As três constraints de
   `models.py:100-120` existem no PostgreSQL (confirmei no `\d+`), e há testes
   que provam que disparam `IntegrityError`
   (`tests/db/test_models.py:89,101,115`). Regra que só vive na aplicação é
   regra que a próxima migração de dados vai violar.
4. **Normalização por tipo no armazenamento.** Documento alfanumérico
   maiúsculo, telefone só dígitos, persistidos em `Guest.save()`. Resolve um
   bug concreto (colisão de passaportes) que a leitura "óbvia" (só dígitos)
   teria introduzido — e é o que faz a unicidade e o `icontains` casarem a
   máscara digitada.
5. **Envelope de erro com `code`.** O cliente ramifica por código
   (`EARLY_CHECKIN`), não por texto. Isso é contrato, e é o que permite o
   protocolo alerta→override do D4 existir sem gambiarra ("200 que não muta").
6. **Escopo.** 763 statements de código de produção para cobrir o briefing
   inteiro, com 179 testes e 98 % de cobertura. A melhor decisão arquitetural do
   repositório é o tamanho dele. As §0.1/§0.5 da SPEC não são preguiça
   documentada: são recusas argumentadas, cada uma com o caso concreto onde a
   leitura alternativa divergiria.

Onde eu discordo da SPEC, discordo pontualmente e digo abaixo — não no atacado.

---

# Parte 2 — Onde dói quando cresce

Cada tensão com um cenário concreto que a expõe. Ordenei por gravidade
prática, não por sofisticação conceitual.

## T3 (primeiro por gravidade) — Invariante entre linhas cai como 500, não como 409

**Cenário, sem concorrência nenhuma.** O hóspede Ana tem duas reservas
`PENDING` (perfeitamente legal: `pending_reservations` é plural por decisão,
SPEC §4.3). O atendente faz check-in na primeira. Depois, por engano, faz
check-in na segunda.

**O que acontece hoje:** `check_in` valida a transição da *linha* que recebeu
(`PENDING → CHECKED_IN`, ok), grava, e o PostgreSQL rejeita pela
`UniqueConstraint` parcial `resv_one_active_per_guest` (`models.py:109-113`).
`IntegrityError` não é exceção do DRF, então `api_exception_handler` cai no
`return None` (`exceptions.py:73-75`) e o Django devolve **HTTP 500 com corpo
HTML**.

**Verificado ao vivo**, não deduzido:

```
POST /api/reservations/8/check-in/  {"allow_early": true}   →  HTTP 500
<!doctype html><html><head><title>Server Error (500)</title>…
```

Três consequências, em ordem de gravidade:

1. Um cenário de balcão trivial retorna 500. O frontend ramifica por
   `code` (SPEC §5.3) e recebe HTML — o handler global de erro não tem o que
   ler.
2. O envelope de erro, que é um contrato da §4.1, **não** é universal. Além
   deste caso, verifiquei que URL não roteada também devolve HTML
   (`GET /api/reservations/1/` → 404 HTML, porque não existe `retrieve`).
3. A cobertura conta a história: a **única** linha não coberta de
   `hotel/exceptions.py` que importa é a 75 — o `return None`. O caminho que a
   produção exercita hoje é exatamente o que nenhum teste toca. Existe teste da
   constraint no nível do banco (`tests/db/test_models.py:101`, com
   `pytest.raises(IntegrityError)`), mas nenhum no nível de serviço ou de HTTP.

**A raiz é arquitetural, não um esquecimento.** `_assert_transition` valida o
estado de *uma linha*; a invariante é *entre linhas do mesmo hóspede*. O
`select_for_update` (`reservations.py:147-149`) trava a reserva, não o hóspede —
então não há nem trava nem consulta que enxergue a irmã. O banco enxerga, e
ninguém traduz o veredicto do banco de volta para o envelope.

**Por que isso cresce mal:** é o primeiro membro de uma família. Toda invariante
futura entre linhas — quarto ocupado, reservas sobrepostas, limite de crédito —
vai chegar pelo mesmo caminho (constraint do PG → `IntegrityError` → 500) a menos
que a camada de serviço adote a política de *ler antes e traduzir depois*.

## T1 — A reserva não reserva nada

`Reservation` tem hóspede, datas, veículo, status e dinheiro
(`models.py:66-92`). Não tem quarto. Não existe tabela de quartos. A única
constraint de exclusividade é sobre o **hóspede**
(`resv_one_active_per_guest`), não sobre o inventário.

**Cenário:** dois atendentes criam, no mesmo minuto, reservas para 12–15/09. O
hotel tem 10 quartos. Nada impede a 11ª, a 50ª ou a 500ª reserva para a mesma
noite. Overbooking não é apenas permitido: é **indetectável** — não há consulta
que possa responder "há vaga?".

A SPEC §0.1 tira isso de escopo, e para o briefing está certa: o cliente pediu
armazenar, localizar, check-in, checkout e tarifa. Mas registro a assimetria com
franqueza: é a única tensão desta lista que muda o **significado** do agregado.
Hoje `Reservation` é um *compromisso comercial*; com inventário ela passa a ser
uma *alocação de recurso escasso*, e alocação é problema de concorrência por
natureza.

**Custo de introduzir depois** (aditivo, mas não trivial):

- `Room` + `RoomType`; FK anulável em `Reservation` + backfill.
- Exclusão de sobreposição no banco — em PG isso é uma linha (mais a extensão
  `btree_gist`, necessária para o operador `=` sobre `room_id` dentro de um
  índice GiST) e resolve a corrida de verdade:
  `EXCLUDE USING gist (room_id WITH =, daterange(checkin_date, checkout_date, '[)') WITH &&) WHERE (status IN ('PENDING','CHECKED_IN'))`.
- Selector de disponibilidade e um novo `code` no envelope (`NO_VACANCY`).
- **Quebra do contrato:** `POST /api/reservations/` ganha campo obrigatório.
  Sem versionamento (T6), quebra o cliente.
- E o T3 volta multiplicado: a `EXCLUDE` vira `IntegrityError` → 500, se a
  política de tradução não estiver em pé antes.

## T2 — Tarifa é constante de módulo, e o extrato é recomputado

```python
# hotel/services/pricing.py:19-23
WEEKDAY_RATE = Decimal("120.00")
WEEKEND_RATE = Decimal("180.00")
WEEKDAY_PARK = Decimal("15.00")
WEEKEND_PARK = Decimal("20.00")
```

**Cenário:** em 01/01/2027 a diária de semana vai para R$ 140,00. Alguém edita a
constante.

O que se rompe não é o preço novo — é o passado. A SPEC §1.3 registra que "o
extrato linha a linha é **recomputável deterministicamente** de
`checked_in_at`/`checked_out_at` — sem JSON no banco", e
`services.statement()` (`reservations.py:136-144`) implementa exatamente isso.
Depois da troca da constante, `statement()` de uma reserva de 2026 devolve
R$ 140,00/noite enquanto `total_amount` congelado na linha diz R$ 120,00. Os dois
números discordam, o sistema não percebe, e **nenhum teste pega**: a tabela
T1–T9 é a fixture da própria constante — ela muda junto.

Essa é a tensão mais subestimada do repositório. A decisão "não guardar JSON,
recomputar" é elegante e está certa **enquanto a tabela de tarifas for imutável
para sempre**. É uma hipótese sobre o negócio embutida numa escolha de
persistência, e ela não está anotada como hipótese.

Há um agravante silencioso: `statement()` não é exposto por nenhuma rota. Só é
chamado pelos testes (`tests/db/test_services.py:202,209`). Ou seja, hoje a
divergência é latente; ela vira visível no dia em que alguém adicionar
`GET /reservations/{id}/statement/` — que é justamente o que falta (T5).

**Correção mais barata que preserva a pureza:** parametrizar as tarifas em vez
de importá-las.

```python
@dataclass(frozen=True)
class RateTable:
    weekday_rate: Decimal; weekend_rate: Decimal
    weekday_park: Decimal; weekend_park: Decimal
    late_fee_factor: Decimal

def calculate_bill(*, checkin, checkout, has_vehicle, rates: RateTable = DEFAULT_RATES) -> Bill
```

`pricing.py` continua puro (ganha um parâmetro, não uma dependência), a tabela
T1–T9 continua valendo com o default, e a `Reservation` passa a guardar
`rate_table_version` — o extrato volta a ser recomputável **de verdade**.

## T4 — Auditoria: os totais moram numa linha mutável e ninguém assina nada

Os quatro campos financeiros são colunas de `Reservation`
(`models.py:88-91`). Isso significa:

- Qualquer `save(update_fields=[...])` futuro sobrescreve o total. Não há
  histórico, não há linha imutável, não há trilha.
- Não há `updated_at` em `Reservation` (só `created_at`, `models.py:92`). Não se
  sabe *quando* a linha foi tocada por último.
- **Não há ator.** `request.user` nunca chega ao serviço:
  `check_in`/`check_out`/`cancel` recebem `reservation` e `now`, nada mais
  (`reservations.py:71,89,125`; chamadas em `views.py:319,377,397`). O sistema
  sabe que houve checkout às 12:01 e não sabe quem o fez.

**Cenário:** três meses depois, o hóspede contesta R$ 90,00 de multa. As
perguntas do gerente são "quem fez o checkout?", "o horário registrado foi
alterado?", "quem cadastrou a vaga?" — e não há resposta possível. A
`CheckConstraint` `resv_checked_out_complete` (`models.py:115-119`) garante que
o total *existe*; nada garante que ele é o original.

Para um projeto de avaliação isso é irrelevante. Para um hotel de verdade,
"quem" é requisito de auditoria antes de ser requisito de software.

## T11 — Só as *transições* têm serviço; a *criação* não tem

Este é o defeito de simetria da camada, e ele produz consequências reais.

- `check_in`/`check_out`/`cancel` passam por `services/reservations.py`.
- Criar `Guest` e criar `Reservation` **não têm serviço**. As regras vivem no
  serializer: D11 (`checkin_date >= hoje`) em `serializers.py:219-225`, D13
  (mínimo 1 noite) em `serializers.py:227-233`, D12 (documento único) em
  `serializers.py:119-132`.
- Pior: **D11 lê o relógio dentro do serializer** —
  `today = timezone.localdate()` em `serializers.py:222`. É o único ponto fora
  das views que materializa "agora", violando o espírito do invariante §0.3.
  Consequência prática: não se testa a regra de data de criação sem subir HTTP.

E há duas escritas de fato divergentes:

1. `seed_demo.py:130-135` cria reservas com `Reservation.objects.get_or_create`,
   **sem passar pelo serializer**. É por isso que a estadia passada da Carla
   (`seed_demo.py:81`) pode existir — e ela *deve* existir, o cenário de demo
   depende dela. Ou seja: hoje há um caminho validado (API) e um não validado
   (seed), e o não validado é necessário. Isso não é bug; é dívida de desenho
   ainda invisível.
2. `Guest.save()` normaliza PII (`models.py`), mas `bulk_create` e
   `QuerySet.update()` **não chamam `save()`**. Sem o guarda do manager, um
   `Guest.objects.bulk_create([...])` gravaria a máscara digitada — a linha
   entra invisível para a busca por fragmento normalizado e para a unicidade
   de documento. O manager recusa `bulk_create`; `QuerySet.update()` continua
   sendo o caminho a não usar.

Nenhum desses caminhos existe hoje. Os dois são a primeira coisa que aparece
quando alguém escrever um importador de CSV ou um `hotel/admin.py`.

## T5 — Depois do checkout, o extrato não existe mais

`services.statement()` (`reservations.py:136-144`) recomputa o extrato de uma
reserva finalizada. Nenhuma rota o expõe. Verificado:
`GET /api/reservations/1/` → **404** (o `ReservationViewSet` só tem
`ListModelMixin` + `CreateModelMixin`, `views.py:233-237`).

**Cenário:** o atendente fecha o modal do extrato por engano. O hóspede quer a
segunda via. Não há como obtê-la pela API — o recibo existiu apenas no corpo da
resposta do único POST que o produziu. O requisito RN6 ("exibido **durante** o
checkout") está cumprido à letra; a operação real de balcão pede reimpressão.

Custo de resolver: uma action `@action(detail=True, methods=["get"])` de 3
linhas reaproveitando `statement()` + `build_statement()`. É a menor razão
custo/benefício desta lista inteira — e ela interage com T2: o dia em que essa
rota existir, a divergência de tarifa fica visível ao cliente.

## T6 — Rotação de chave Fernet: **resolvida pela reversão**

Esta tensão existia enquanto `document`/`phone` eram cifrados com uma única
`FIELD_ENCRYPTION_KEY` e buscados via `HASH_PEPPER`. Trocar a chave quebrava
toda leitura (`InvalidToken` → 500 em todo endpoint de hóspede); trocar o
pepper invalidava a busca em silêncio. A correção proposta era `MultiFernet`
+ comando `rotate_pii`.

Em 2026-09 a cifra saiu do sistema. Sem ciphertext não há chave para girar;
sem blind index não há pepper. O armazenamento é o valor normalizado, a
busca é `icontains`, a unicidade é a coluna `document`. A4 desta lista está
superada.

## T7 — Contrato REST sem versão, e envelope não universal

Todas as rotas são `/api/…` (`config/urls.py:23-42`). Não há `/v1/`, não há
`DEFAULT_VERSIONING_CLASS`, não há negociação por media type. O
`SPECTACULAR_SETTINGS["VERSION"] = "1.0.0"` (`settings.py:171`) é metadado do
documento, não do roteamento.

**Cenário:** T1 (inventário) entra e `POST /api/reservations/` passa a exigir
`room_id`. Hoje há um único cliente, no mesmo repositório, atualizado no mesmo
deploy — então a quebra é **grátis**. É exatamente esse o ponto: é grátis hoje e
custa caro no dia em que existir um app mobile, um channel manager ou um
integrador que você não controla.

Somado a isso, o envelope §4.1 não é universal — verificado em dois lugares:
URL não roteada devolve 404 HTML, exceção não tratada devolve 500 HTML (T3).
Um cliente que ramifica por `code` tem de tratar "não é JSON" de qualquer forma.

Custo de versionar depois: se feito **antes** de existir segundo cliente, é um
prefixo de rota e um `include` — horas. Se feito depois, é manter duas árvores
de serializers.

## T8 — Multi-tenancy: o custo real está numa constraint, não numa coluna

§0.1 tira do escopo. Concordo para o briefing. Mas a conta de introduzir depois
não é uniforme:

| Item | Custo depois |
|---|---|
| `hotel_id` em `Guest`/`Reservation` + backfill | Baixo (migração aditiva) |
| Filtrar 4 selectors e 2 viewsets | Baixo hoje; um vazamento por endpoint quando forem 40 |
| **`document` unique → unique por hotel** | **Alto** |
| Decidir se o hóspede é da rede ou do hotel | Modelagem, não migração |

A linha do meio é a afiada. `unique=True` numa coluna só tem de virar
`UniqueConstraint(fields=["hotel", "document"])`. Como o valor agora é o
documento normalizado em claro, dá para inspecionar e deduplicar na migração
— o que a cifra antiga impedia. Se multi-tenancy é *sabidamente* futura, o
seguro barato continua sendo a constraint composta desde já (com um tenant
default), não a coluna.

## T9 — Concorrência: a trava certa, no lugar certo, com o alcance errado

Crédito onde é devido: `_lock` (`reservations.py:147-149`) relê a linha sob
`SELECT … FOR UPDATE` dentro de `transaction.atomic`. Isso resolve
corretamente a classe "dois atendentes na **mesma** reserva": duplo checkout é
rejeitado com `409 INVALID_STATUS` e há teste
(`tests/api/test_reservation_flow.py:283`). O padrão está certo.

O que falta é alcance:

- Invariantes entre linhas não são cobertas (T3) — a trava é por reserva, a
  invariante é por hóspede.
- Não há trava na criação. Dois `POST /api/guests/` simultâneos com o mesmo
  documento: a guarda de leitura (`serializers.py:129-132`) passa nos dois, e a
  constraint única decide — e essa corrida **é** tratada
  (`views.py:154-159` → 409). Bom. Mas note que o `except IntegrityError` está
  em `views.py`, não no serviço, e é uma das linhas sem cobertura
  (`views.py:156-159`): a corrida está tratada e não testada.
- Não há trava nem invariante sobre o inventário, porque não há inventário (T1).

## T10 — Relatórios e leitura pesada: a tensão menos urgente da lista

Digo com franqueza que esta é a que eu **não** trataria como prioridade.

**Cenário:** 5 anos, ~200 mil reservas, o gerente quer receita mensal e taxa de
ocupação. O que ajuda: `total_amount` está na linha, então `SUM`/`GROUP BY` é
trivial e o índice `resv_status_checkin` (`models.py:98`) serve o corte por
status e data. O que incomoda: o relatório varre a tabela transacional enquanto
o balcão faz `select_for_update`, e `guests_in_hotel`/`guests_pending_checkin`
(`selectors.py:46-80`) usam `filter(join).distinct()` com `ORDER BY full_name,
id` e paginação — sobre centenas de milhares de hóspedes, `DISTINCT` + `ORDER BY`
paginado degrada.

Mas: um PostgreSQL de nó único faz relatórios desse volume folgado, e réplica de
leitura é operação, não arquitetura. Não invente CQRS por causa disso — veja a
Opção E.

## T12 — Nada é assíncrono, e o que é síncrono está mais apertado do que parece

§0.1 tira Celery/Redis do escopo. Certo. Mas há um fato medido que vale mais que
a discussão conceitual:

- `ai/client.py:69` faz `httpx.post(..., timeout=10)` **dentro do ciclo de
  requisição**.
- O gunicorn sobe **sem `-w`** (`docker-compose.yml:36`, `Dockerfile:30`), o que
  significa o default: **1 worker sync, 1 thread**. Confirmei lendo
  `/proc/*/cmdline` dentro do container — há dois processos gunicorn, master e um
  worker.

Portanto: uma única chamada de "Preencher com IA" pode **parar a API inteira por
até 10 segundos**. Não há segundo worker para atender o balcão. Isso não é um
problema de escala futura; é um problema de hoje que se disfarça de escala. E a
correção não é arquitetural — é `-w 3 --threads 2` no comando.

Quando o assíncrono vira dívida de verdade: o primeiro requisito cuja falha
precisa de *retry sem ninguém olhando* — e-mail/WhatsApp de confirmação, PDF de
fatura, sincronia com channel manager, job de no-show (que D14 adiou
deliberadamente e bem). Até lá, Celery é peso morto.

## T13 — Tempo de suíte: 90 % do relógio é hash de senha, não arquitetura

Medido, não estimado:

| Camada | Testes | Tempo | Por teste |
|---|---|---|---|
| `tests/unit` | 57 | **0,44 s** | 8 ms |
| `tests/db` | 51 | **4,1 s** | 80 ms |
| `tests/api` | 71 | **74,3 s** | ~1,05 s |
| **Total** | **179** | **82 s** | |

A causa é uma fixture, não o desenho. `UserFactory`
(`tests/factories.py:42`) computa `make_password` por instância, e
`tests/api/conftest.py:35-36` computa um **segundo** hash e salva. Medi
`make_password("x")` no container: **0,557 s** (PBKDF2; `settings.py` não
sobrescreve `PASSWORD_HASHERS`). 71 × ~1,05 s ≈ 74 s — fecha a conta inteira.

O ponto arquitetural é positivo e vale dizer: a estratificação **já** entrega
teste rápido onde importa — o motor financeiro inteiro roda em 0,44 s porque é
puro. A lentidão é acidental e a correção são duas linhas
(`PASSWORD_HASHERS = ["…MD5PasswordHasher"]` nos settings de teste, ou hash
computado uma vez no import). Se ficar como está, ao triplicar os endpoints a
suíte vai a 4 minutos por nada — e suíte lenta é o começo de "roda só no CI",
que é o começo de "não roda".

## Resumo das tensões

| # | Tensão | Gatilho que a torna real | Gravidade hoje |
|---|---|---|---|
| T3 | Invariante entre linhas → 500 HTML | **Já acontece** | **Alta** |
| T1 | Reserva não reserva quarto | 2º quarto no negócio | Média (fora de escopo) |
| T2 | Tarifa constante × extrato recomputado | 1ª mudança de preço | Média-alta |
| T4 | Sem trilha de auditoria / sem ator | 1ª contestação de fatura | Média |
| T11 | Criação sem serviço; escrita fora do `save()` | 1º importador ou admin | Média |
| T5 | Extrato não recuperável | 1º pedido de 2ª via | Baixa (custo baixíssimo) |
| T6 | Chave/pepper sem rotação | 1º incidente | Média-alta (latente) |
| T7 | Contrato sem versão | 2º cliente da API | Baixa hoje, alta depois |
| T8 | Multi-tenancy | 2º hotel | Baixa (mas 1 constraint) |
| T9 | Alcance da trava | Junto com T1/T3 | Média |
| T10 | Relatório no banco transacional | ~10⁶ linhas | Baixa |
| T12 | Sync bloqueante + 1 worker | **Já acontece** (IA) | **Alta (operacional)** |
| T13 | Suíte 82 s, 90 % hash | 3× endpoints | Baixa-média |

---

# Parte 3 — Opções de arquitetura

Cinco opções, em ordem crescente de investimento. Estimativas em **horas de
atenção humana ativa** (mesmo grão da SPEC §8.4), não em tempo de agente.

---

## Opção A — Endurecer o atual, sem mudar o estilo

**Essência:** o desenho está certo; o que falta são tampas em buracos
específicos. Nenhuma camada nova, nenhum diretório novo.

**Como o código muda.** Nove intervenções pontuais, todas locais:

| # | Intervenção | Arquivo | Esforço |
|---|---|---|---|
| A1 | Traduzir `IntegrityError` de invariante em erro de domínio | `services/reservations.py` | 1 h |
| A2 | Rede de segurança no handler: exceção não tratada → 500 no envelope | `hotel/exceptions.py:71-79` | 0,5 h |
| A3 | `-w 3 --threads 2` no gunicorn | `docker-compose.yml:36`, `Dockerfile:30` | 0,5 h |
| A4 | ~~`MultiFernet` + `rotate_pii`~~ — **superado**: cifra removida em 2026-09 | — | — |
| A5 | `GET /reservations/{id}/statement/` + `retrieve` | `hotel/views.py` | 1 h |
| A6 | `PASSWORD_HASHERS` rápido nos testes | settings/conftest | 0,5 h |
| A7 | `max_length` em `document`/`phone` no serializer de criação | `serializers.py:90-100` | 0,5 h |
| A8 | Throttling em `/auth/token/` e `/ai/parse-guest/` | `settings.py` | 1 h |
| A9 | `RateTable` como parâmetro de `calculate_bill` + versão na reserva | `pricing.py`, `models.py` | 3 h |

A1 é a única que merece código no documento, porque é o padrão que se repetirá:

```python
# hotel/services/reservations.py
CONSTRAINT_ERRORS = {
    "resv_one_active_per_guest": (
        "Este hóspede já está hospedado em outra reserva.",
    ),
    # e, quando existir inventário: "resv_no_room_overlap": (...)
}

def _save_translating_constraints(reservation, *, update_fields):
    try:
        with transaction.atomic():          # savepoint: não estraga a atomic externa
            reservation.save(update_fields=update_fields)
    except IntegrityError as exc:
        for name, (detail,) in CONSTRAINT_ERRORS.items():
            if name in str(exc):
                raise InvalidStatusError(detail) from exc
        raise
```

Mais uma leitura defensiva antes de gravar (`Reservation.objects.filter(
guest_id=…, status=CHECKED_IN).exists()`) para dar a mensagem boa no caminho
comum, com a constraint como autoridade final na corrida — exatamente a divisão
de trabalho que `views.py:154-159` já usa para o documento duplicado. O padrão
já existe no repositório; falta aplicá-lo à segunda invariante.

**Resolve:** T3 (integralmente), T12 (a parte operacional), T5, T6, T13, e T2
parcialmente (A9 estanca a divergência futura; não corrige histórico
inexistente, porque não há histórico).
**Não resolve:** T1, T4, T7, T8, T10, T11.

**Custo:** 10–12 h. Risco de migração: quase nulo — A9 é a única com migração, e
é uma coluna anulável. Curva de aprendizado: zero, é o mesmo estilo.

**Certa quando:** o sistema é do tamanho que é, o time é de 1 a 3 pessoas, e a
prioridade é "nenhum 500 no balcão".
**Over-engineering quando:** nunca. A é o piso, não uma alternativa.

**Gatilho:** A1, A2 e A3 — **agora**. As demais na próxima janela de manutenção.

---

## Opção B — Serviços de escrita completos, tarifa versionada e livro-caixa

**Essência:** fechar a simetria da camada que já existe. Toda escrita passa por
serviço, tarifa é dado versionado, e o dinheiro vira linha imutável em vez de
coluna sobrescrevível. Ainda Django idiomático, ainda sem inversão de
dependência.

**Como o código muda.**

```
backend/hotel/
├── models.py            + RateTable, Ledger(Entry), actor/updated_at em Reservation
├── selectors.py            (inalterado em forma)
├── services/
│   ├── pricing.py       PURO — passa a receber RateTable como parâmetro
│   ├── guests.py        ← NOVO: create_guest / update_guest
│   ├── reservations.py  + create_reservation (D11/D13 saem do serializer)
│   └── ledger.py        ← NOVO: post_entries (append-only)
├── serializers.py          fica só I/O: sem timezone, sem regra de data
└── views.py                inalterado em forma; passa `actor=request.user`
```

Assinaturas concretas — note o relógio e o ator explícitos, no mesmo espírito
do que já existe:

```python
# services/reservations.py
def create_reservation(*, guest: Guest, checkin_date: date, checkout_date: date,
                       has_vehicle: bool, actor: User, today: date) -> Reservation
def check_out(reservation: Reservation, *, now: datetime, actor: User) -> Bill

# services/guests.py
def create_guest(*, full_name: str, document: str, phone: str, actor: User) -> Guest
```

`Ledger` é a peça que muda a natureza do dinheiro:

```python
class LedgerEntry(models.Model):          # append-only; sem update, sem delete
    reservation = models.ForeignKey(Reservation, on_delete=models.PROTECT,
                                    related_name="ledger")
    kind = models.CharField(choices=EntryKind)      # DAILY | PARKING | LATE_FEE
    reference_date = models.DateField(null=True)    # a data da diária
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    rate_table_version = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT)
```

Os totais na `Reservation` continuam existindo como cache de leitura; a verdade
passa a ser a soma das linhas. O extrato deixa de ser *recomputado* e passa a ser
*lido* — o que dissolve T2 na raiz, sem JSON no banco (o que a §1.3 rejeitava era
JSON, e uma tabela normalizada não é JSON).

**Resolve:** T2, T4, T11, T5, T3 (o serviço fica com um ponto único para
traduzir constraint), e prepara T1 (o inventário entra como FK + `EXCLUDE`
naturalmente).
**Não resolve:** T7, T8, T10, T12 (parte assíncrona). Não muda o acoplamento a
Django — e isso é intencional.

**Custo:** 3–5 dias (24–40 h). Migração: média — `LedgerEntry` precisa de
backfill a partir dos totais congelados (viável: `statement()` já recomputa, e
com a versão de tarifa do dia da migração o backfill é exato). Curva de
aprendizado: baixa; quem lê `services/reservations.py` hoje lê isso amanhã.

**Certa quando:** o dinheiro precisa de trilha (auditoria, contestação, fisco),
**ou** a tarifa vai mudar, **ou** apareceu um segundo caminho de escrita
(importador, admin, integração).
**Over-engineering quando:** o projeto é o que é hoje — uma entrega de avaliação
com 4 hóspedes de seed e tarifa fixa por definição do briefing.

**Gatilho, observável:** o primeiro de —
(i) um pedido de mudança de tarifa;
(ii) uma pergunta de auditoria que o banco não responde ("quem fez este
checkout?");
(iii) o segundo caminho de escrita entrar no repositório (`hotel/admin.py`,
comando de importação, endpoint de edição).

---

## Opção C — Ports & adapters (hexagonal) mantendo Django

**Essência:** inverter a dependência. O domínio deixa de importar Django; Django
passa a ser um adaptador do domínio.

**Como o código muda.**

```
backend/
├── domain/                      ← Python puro, ZERO import de django
│   ├── entities.py              Guest, Reservation (dataclasses, não Models)
│   ├── value_objects.py         Money, Document, StayPeriod
│   ├── rules.py                 pricing atual + máquina de estados
│   └── ports.py                 Protocols: GuestRepository, ReservationRepository,
│                                UnitOfWork, Clock
├── application/
│   └── use_cases.py             CheckOutReservation(uow, clock).execute(...)
└── infrastructure/django/
    ├── models.py                ORM (só persistência)
    ├── repositories.py          implementam os Protocols
    └── api/                     views + serializers (adaptador HTTP)
```

```python
# domain/ports.py
class ReservationRepository(Protocol):
    def get_for_update(self, reservation_id: int) -> Reservation: ...
    def save(self, reservation: Reservation) -> None: ...

# application/use_cases.py
class CheckOutReservation:
    def __init__(self, uow: UnitOfWork, clock: Clock, rates: RateTable): ...
    def execute(self, reservation_id: int) -> Bill: ...
```

**Resolve:** testabilidade máxima (todo caso de uso testável sem banco — a suíte
`db` de 4 s poderia migrar quase inteira para `unit`), independência de
framework, e uma fronteira explícita onde hoje há convenção.
**Não resolve nada que B não resolva** em matéria de negócio. Cria dois
problemas novos e concretos:

1. **Mapeamento duplo.** Toda entidade existe duas vezes (dataclass do domínio +
   Model do ORM) e alguém escreve e mantém o mapper. Para 2 entidades, é
   overhead puro.
2. **Perda de alavancagem do Django.** `select_for_update`, constraints, `Q`,
   `Prefetch`, `ModelSerializer` — tudo que hoje resolve o problema em uma linha
   passa a atravessar o port. `_lock` (`reservations.py:147-149`), que hoje são
   3 linhas, vira um método de repositório com semântica de transação exposta na
   interface, que é justamente a parte mais difícil de abstrair bem.

Registro minha discordância com a versão forte desta opção: para **este**
domínio, o hexagonal completo compra pureza que já está comprada. `pricing.py`
já é o hexágono — é puro, é testado sem banco, e não conhece Django. O que não é
puro (`reservations.py`) é puro *orquestrador de transação*, e transação é
exatamente a coisa que ports & adapters abstrai pior.

**Custo:** 2–4 semanas (80–160 h). Risco de migração: **alto** — reescrita de
serializers, selectors e testes de `db`; a suíte inteira é refeita. Curva:
média-alta; um mantenedor Django típico não conhece esse layout e vai lutar
contra o ORM ("por que não posso usar `prefetch_related` aqui?").

**Certa quando:** existe requisito real de trocar o framework ou a persistência
(ex.: parte do domínio precisa rodar fora do Django — CLI, worker, lambda), **ou**
o domínio cresceu ao ponto de as regras não caberem em 2 módulos, **ou** a
organização já pratica esse estilo em outros serviços.
**Over-engineering quando:** o domínio tem 2 entidades e 1 motor de cálculo — que
é o caso.

**Gatilho:** um consumidor do domínio **fora** do processo Django (worker de
integração, CLI de faturamento em lote, motor de tarifa compartilhado com outro
produto). Sem esse consumidor, a inversão de dependência não tem cliente.

---

## Opção D — Domínio rico / DDD tático com agregados

**Essência:** mover as invariantes para dentro dos objetos. `Reservation` deixa
de ser linha e passa a ser agregado que se recusa a entrar em estado inválido.

**Como o código muda.**

```python
class Reservation:                      # agregado; sem herdar de models.Model
    def check_in(self, *, now: datetime, allow_early: bool) -> None:
        self._guard_transition(Status.CHECKED_IN)
        if now.timetz() < CHECKIN_OPENS and not allow_early:
            raise EarlyCheckin(server_time=now)
        self._status, self._checked_in_at = Status.CHECKED_IN, now
        self._record(ReservationCheckedIn(self.id, now))

    def check_out(self, *, now: datetime, rates: RateTable) -> Bill: ...
```

Com dois pontos de desenho que valem a pena de verdade:

- **Value objects tipados:** `Money`, `Document`, `StayPeriod`. `Money` fecha a
  frouxidão apontada em §1.5 (hoje `Decimal` cru circula, e o contrato "este
  `datetime` já está em hora local" vive num docstring, não no tipo) e
  `StayPeriod` faz D1/D13 serem impossíveis de violar por construção.
- **Fronteira de agregado explícita:** o agregado passaria a ser
  `GuestStay` — hóspede + suas reservas — porque a invariante "no máximo uma
  `CHECKED_IN`" **é** uma invariante de agregado. Isso é a resposta conceitual
  correta a T3, e é a razão pela qual o 500 existe: hoje o agregado é a linha
  errada.

**Resolve:** T3 na raiz conceitual, T11 (invariantes não escapam), e dá base
para T1 (alocação de quarto é invariante de agregado por excelência).
**Não resolve:** T7, T8, T10, T12. E herda o problema de mapeamento da Opção C —
agregado rico + Django ORM significa ou `Model` com atributos privados (feio, e
o ORM não colabora) ou mapeador manual.

Minha ressalva: DDD tático paga quando a **linguagem do domínio é rica e
disputada** — quando "reserva", "estadia", "hospedagem", "diária" e "folio" são
conceitos distintos que o negócio confunde e o código precisa desambiguar. No
briefing atual, o domínio tem 6 regras, todas enunciadas em 6 linhas de texto, e
a SPEC §0.2 já fez o trabalho de desambiguação em D1–D14 — em prosa, com casos
numéricos, e sem precisar de agregados para isso. Fazer DDD aqui é comprar
vocabulário para uma conversa que já terminou.

**Custo:** 3–6 semanas (120–240 h), sobreposto a C na maior parte. Risco: alto.
Curva: alta — e é o estilo de maior variância entre praticantes ("DDD" significa
5 coisas diferentes para 5 pessoas, o que gera revisões improdutivas).

**Certa quando:** o domínio hoteleiro real entra — inventário, tarifas
sazonais, folio, no-show, walk-in, grupos, políticas de cancelamento — e as
regras passam a interagir entre si em vez de serem independentes.
**Over-engineering quando:** as regras são 6 e não conversam entre si, que é o
caso.

**Gatilho:** quando `services/reservations.py` passar de ~400 linhas **e** você
já tiver flagrado a terceira invariante escapando para o banco (T3 é a
primeira). Duas invariantes fogem por descuido; três indicam que o agregado está
no lugar errado.

---

## Opção E — Orientado a eventos / CQRS parcial

**Essência:** escritas emitem eventos; leituras vêm de projeções separadas.

**Não recomendo para este caso**, e vou além: acho que seria o erro mais caro
disponível. As razões, específicas e não genéricas:

1. **CQRS resolve assimetria de carga leitura/escrita.** Aqui não há
   assimetria: as leituras são 4 selectors que já respondem em 2 queries com
   `Prefetch` (`selectors.py:46-80`), sobre uma tabela que um PG de nó único
   serve com folga muito além do volume de um hotel (T10). Separar modelos de
   leitura resolveria um problema que não existe, e criaria consistência
   eventual num fluxo — "quem está no hotel agora?" — que é a única leitura do
   sistema que **precisa** ser forte.
2. **Event sourcing sobre uma máquina de 4 estados** cujas transições já são
   auditáveis por dois timestamps é infraestrutura para nada. O que se quer de
   fato é *trilha de auditoria financeira*, e isso é a Opção B (livro-caixa
   append-only) por 1/10 do custo.
3. **Custo operacional real:** broker, entrega ao menos uma vez, idempotência,
   ordenação, reprocessamento, versionamento de eventos, observabilidade. §0.1
   tira Celery/Redis do escopo justamente porque "adicionaria superfície de bug
   sem adicionar ponto na avaliação" — o argumento se aplica com força maior a
   um broker.

**O fragmento que eu defenderia, e apenas ele:** quando a primeira integração
externa aparecer (channel manager, e-mail transacional, ERP), use **outbox
transacional** — uma tabela `OutboxMessage` escrita na *mesma transação* de
`check_out`, drenada por um worker. É a peça que dá entrega confiável sem 2PC e
sem broker no caminho crítico, e ela cabe dentro da Opção B (a tabela é
irmã do `LedgerEntry`, escrita pelo mesmo `atomic`).

**Custo, se ainda assim:** 6 semanas a 3 meses. Risco: alto, e o pior tipo — bug
de consistência eventual não aparece em teste, aparece em produção às sextas.

**Gatilho para o fragmento (outbox):** o primeiro efeito externo que não pode ser
perdido e não pode bloquear a resposta.
**Gatilho para CQRS de verdade:** leitura e escrita divergirem em ordem de
magnitude de carga *medida* (não prevista) — algo como painel público de
disponibilidade com tráfego de internet contra dezenas de escritas por dia. Se
esse painel não existir, não existe gatilho.

---

## Comparativo: qual opção fecha qual tensão

| Tensão | A | B | C | D | E |
|---|:--:|:--:|:--:|:--:|:--:|
| T3 500 em invariante entre linhas | **✓** | ✓ | ✓ | ✓ raiz | ✓ |
| T12 sync bloqueante / 1 worker | **✓** | ✓ | – | – | parcial |
| T2 tarifa constante × extrato | parcial | **✓** | parcial | ✓ | ✓ |
| T4 auditoria / ator | – | **✓** | – | parcial | ✓ |
| T11 criação sem serviço | – | **✓** | ✓ | ✓ | ✓ |
| T5 extrato irrecuperável | **✓** | ✓ | ✓ | ✓ | ✓ |
| T6 rotação de chave/pepper | **✓** | ✓ | – | – | – |
| T13 tempo de suíte | **✓** | ✓ | ✓✓ | ✓✓ | – |
| T1 inventário de quartos | – | prepara | prepara | **✓** | – |
| T9 alcance da trava | parcial | ✓ | ✓ | **✓** | ✓ |
| T7 versionamento do contrato | – | – | ✓ | – | – |
| T8 multi-tenancy | – | parcial | parcial | ✓ | – |
| T10 leitura pesada | – | – | – | – | ✓ |
| **Custo (h de atenção humana)** | **10–12** | **24–40** | **80–160** | **120–240** | **240+** |
| **Risco de migração** | nulo | médio | alto | alto | alto |
| **Curva p/ quem mantém** | zero | baixa | média-alta | alta | alta |

---

# Parte 4 — O que eu faria

## A recomendação, sem rodeio

**Opção A agora, integralmente. Opção B só por gatilho. C, D e E: não.**

O contexto pesa e tem de pesar: este é um projeto de avaliação técnica
**entregue**, com escopo fechado por um briefing de 23 linhas, 179 testes verdes,
98 % de cobertura e uma SPEC que documenta por que cada coisa ficou de fora. A
resposta honesta para "qual arquitetura mais robusta?" não é uma arquitetura
diferente — é **a mesma, com três buracos tampados**, sendo que dois deles são
defeitos e não escolhas.

Se eu recomendasse hexagonal ou DDD aqui, estaria vendendo curva de aprendizado
como robustez. O que este backend tem de mais valioso — motor de dinheiro puro,
relógio injetável, cripto fail-closed, constraints no banco, escopo recusado com
argumento — sobreviveria intacto às Opções C e D, o que é precisamente o
sinal de que C e D não são o que falta.

## Ordem de execução

**Bloco 1 — hoje (~2 h).** Isto é conserto, não melhoria:

1. **A1 + A2**: traduzir `IntegrityError` de invariante em `409 INVALID_STATUS`,
   com teste no nível de serviço **e** no nível de HTTP; e fechar
   `api_exception_handler` para que exceção não tratada saia no envelope (500
   com `{"code":"INTERNAL_ERROR"}`) em vez de HTML. Hoje o cenário "hóspede com
   duas reservas pendentes" devolve 500 — e é um clique no balcão.
2. **A3**: `-w 3 --threads 2` no gunicorn. Um worker sync + um `httpx.post` de
   10 s é um DoS de si mesmo.

**Bloco 2 — próxima janela (4 h).**
3. **A6** (suíte de 82 s → ~10 s; o retorno por linha é o maior do documento).
4. ~~**A4** (`MultiFernet` + `rotate_pii`)~~ — **superado**. A cifra saiu;
   não há chave para girar.
5. **A7** + **A8** (limite de tamanho em PII; throttling em login e na rota de
   IA, que gasta dinheiro de terceiro por requisição autenticada).

**Bloco 3 — 4 h, se houver apetite.**
6. **A5** (`GET /reservations/{id}/statement/` + `retrieve`) — fecha uma
   operação real de balcão com 3 linhas de código.
7. **A9** (`RateTable` como parâmetro) — a única mudança de forma que eu faria
   preventivamente, porque preserva a pureza de `pricing.py`, mantém a tabela
   T1–T9 válida com o default e desarma T2 antes de ela virar divergência de
   dinheiro. Se o orçamento não couber, documente T2 como hipótese explícita na
   SPEC §1.3: *"o extrato é recomputável enquanto a tabela de tarifas não
   mudar"*.

**Nada além disso** até que um gatilho da Opção B dispare.

## O primeiro passo concreto

Um único commit, `fix(hotel): translate cross-row constraint violations into
INVALID_STATUS`, com:

- `hotel/services/reservations.py`: leitura defensiva de outra reserva
  `CHECKED_IN` do mesmo hóspede antes de gravar, e tradução de `IntegrityError`
  por nome de constraint (savepoint interno, para não estragar a `atomic`
  externa) — o mesmo par "guarda de leitura + constraint como autoridade" que
  `views.py:154-159` já usa para documento duplicado.
- `hotel/exceptions.py`: substituir `return None` (linha 75) por um 500 no
  envelope, sem detalhe vazado.
- `tests/db/test_services.py`: `test_check_in_rejects_guest_already_in_hotel`.
- `tests/api/test_reservation_flow.py`:
  `test_checkin_second_reservation_returns_invalid_status` — o teste que faltava.

Depois desse commit, a linha 75 de `exceptions.py` sai da lista de não cobertas
por um teste que prova comportamento, não por acaso.

## O que eu explicitamente NÃO faria

- **Não** introduziria `domain/`, `application/`, `infrastructure/`. `pricing.py`
  já é o hexágono; o resto é orquestração de transação, que hexágono abstrai mal.
- **Não** traria Celery/Redis. §0.1 está certa, e o gargalo medido de hoje é
  contagem de workers, não falta de fila.
- **Não** introduziria inventário de quartos "para ficar completo". Ele muda a
  natureza do agregado (T1) e é o tipo de escopo que se acrescenta com requisito
  na mão, não por antecipação — e a SPEC §0.1 defende isso melhor do que eu.
- **Não** mexeria em `pricing.py` além de A9. Ele está certo, é puro, é 100 %
  coberto e é a referência do repositório.
- **Não** versionaria a API hoje (T7). Um cliente, mesmo repositório, mesmo
  deploy: versionar agora é cerimônia. Mas anote o gatilho: **antes** do segundo
  cliente, não depois.

## Gatilhos, num quadro só

| Se acontecer isto… | …faça isto |
|---|---|
| Já aconteceu (500 no duplo check-in) | **A1+A2, hoje** |
| Já acontece (1 worker + IA síncrona) | **A3, hoje** |
| Suíte passar de ~2 min | A6 |
| Pergunta de auditoria sem resposta no banco | **Opção B** (ledger + ator) |
| Primeiro pedido de mudança de tarifa | A9, e depois **Opção B** |
| Segundo caminho de escrita no repo (admin, importador) | **Opção B** (serviços de escrita) |
| Segundo cliente da API entrar em desenvolvimento | Versionar (T7) antes dele existir |
| Segundo hotel entrar no negócio | Constraint composta de `document` primeiro |
| Consumidor do domínio fora do processo Django | Considerar **Opção C** |
| `services/reservations.py` > 400 linhas **e** 3ª invariante escapando | Considerar **Opção D** |
| Efeito externo que não pode ser perdido | Outbox transacional (fragmento de E) |
| Leitura e escrita divergirem em ordem de magnitude **medida** | Então, e só então, CQRS |

---

## Apêndice — Achados fora do escopo estrito de arquitetura

Coisas que vi lendo o backend e que o dono do projeto deve saber, mesmo não
sendo decisões de arquitetura:

1. **500 no duplo check-in** — descrito em T3. É o único que eu chamaria de bug,
   e ele é alcançável pela UI.
2. **`SECRET_KEY` com default silencioso.** `settings.py:31` cai em
   `"insecure-dev-key-change-me"` se a env faltar, com `DEBUG=0`. O SimpleJWT
   assina com `SECRET_KEY` — quem conhece o repositório forja tokens. O
   `.env.example` e o README instruem gerar a chave, mas a ausência
   é silenciosa. Sugestão: falhar alto também quando
   `DEBUG=0` e `SECRET_KEY` for o default.
3. **`seed_demo` cria superusuário com senha conhecida** —
   `is_staff=True, is_superuser=True` e `atendente/atendente123`
   (`seed_demo.py:29-30,107-116`), e o comando roda em **toda** subida do compose
   (`docker-compose.yml:36`). Perfeito para avaliação; é backdoor se esse compose
   virar base de deploy. Vale um guard por env (`SEED_DEMO=1`).
4. **Sem throttling em `/api/auth/token/`.** Verificado: 5 tentativas erradas
   seguidas → 5× 401, sem atraso e sem bloqueio. Não há
   `DEFAULT_THROTTLE_CLASSES` em `settings.py`.
5. **`/api/ai/parse-guest/` sem throttling** gasta dinheiro de terceiro por
   chamada autenticada, e cada chamada bloqueia o único worker por até 10 s.
6. **`document`/`phone` sem limite de tamanho na entrada.** Histórico do
   retrato de 2026-09-01 (`EncryptedCharField` era `TextField`). **Corrigido:**
   os campos são `CharField` com `max_length` no model e no serializer de
   criação.
7. **`bulk_create` / `QuerySet.update()` pulam a normalização** — o manager
   recusa `bulk_create`; `QuerySet.update()` continua sendo o caminho a não
   usar. O teste `test_bulk_create_is_refused_instead_of_writing_a_broken_row`
   trava o guarda.
8. **`filter(document=…)` em campo cifrado** — histórico: `get_prep_value` do
   Fernet cifrava o lookup e devolvia vazio em silêncio. **Superado:** a coluna
   é `CharField` em claro; `filter(document=normalize_document(...))` casa.
9. **`desafio.md` está fora do `.gitignore` e não versionado.** O briefing do
   cliente vai para o repositório público no próximo `git add -A`. Decisão sua —
   mas é decisão, não acidente.
10. **A suíte deu 122 erros numa das minhas execuções e 179 verdes em todas as
    outras** (mesma imagem, mesmo comando, ~1 min de diferença). A hipótese mais
    provável é duas execuções concorrentes de `pytest` sobre o mesmo banco de
    teste (o run ruim durou 18 s e falhou no setup das fixtures de banco). Não
    consegui reproduzir em 3 tentativas. Se você viu isso também, vale
    `--reuse-db` ou banco de teste por sessão antes de acreditar em flakiness do
    código.

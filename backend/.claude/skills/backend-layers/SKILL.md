---
name: backend-layers
description: Orienta onde cada responsabilidade mora neste backend Django (models, selectors, services, serializers, views) — tabela de decisão mutação/leitura/relógio/erro, o grafo fiscalizado pelo import-linter, e as invariantes de dinheiro e lock. Use ao criar ou editar Python em `hotel/`, `accounts/`, `core/`, `ai/` ou `config/`.
paths: backend/hotel/**/*.py, backend/accounts/**/*.py, backend/core/**/*.py, backend/ai/**/*.py, backend/config/**/*.py
---

# Camadas do backend

## Onde vai

Dentro de cada app: `models` → `selectors` → `services` → `serializers` → `views` → `urls`.

| Você precisa de | Onde mora | Não |
| --- | --- | --- |
| Mutação, invariante, dinheiro | `services.py` | view, serializer, `Model.objects.create` na view |
| Leitura não trivial (filtro, prefetch, agregação) | `selectors.py` | view com `filter`/`annotate` solto |
| Relógio (`now`/`today`) | a **view** lê `timezone.now()` / `localdate()` e passa parâmetro | service, serializer, `engine` |
| Forma do payload (tipo, obrigatório, intervalo invertido) | serializer | |
| Regra que seed e shell também obedecem | service (`DomainValidationError`) | só no serializer |
| Cálculo de diária/vaga/multa | `hotel.billing.engine` (puro: sem ORM, sem I/O, sem relógio) | recomputar no extrato |
| Extrato de estadia encerrada | `statement_from_lines` — hidrata `AccountLine` | chamar o motor |
| Envelope `{code, detail, extra}` | `DomainError` / `DomainValidationError`; handler em `core.exceptions` | `Response({...})` montado na view |
| Constraint nomeada | `Meta.constraints` + `translate_integrity_error` | substring da mensagem do PG |

View fina: valida serializer → chama service/selector com `actor` e `now`/`today` → serializa. Nunca calcula dinheiro. Model tem constraint nomeada e, em `Guest`, `save()` que normaliza PII — não muda status nem conta.

## Grafo

```
ai  →  hotel.reservations  →  hotel.guests | hotel.rooms | hotel.billing  →  core | accounts
```

Irmãos na mesma faixa não se importam. `billing` não conhece reserva. Nada em `hotel.*` importa `ai` nem `config`. `ai` só toca o domínio por `hotel.reservations`.

Única exceção (já no import-linter): `hotel.rooms.services → hotel.reservations.selectors` — desativar/excluir/capacidade lê a agenda; o selector encapsula o status.

Leituras cruzadas (`/guests/in-hotel/`, `/pending-checkin/`, `/rooms/available/`) moram em `hotel.reservations`. Em `config/urls.py`, `reservations` entra **antes** de `guests` e `rooms`.

## Exemplos

```python
# ❌ — relógio e regra na view
def create(self, request):
    if timezone.localdate() > data["checkin_date"]:
        return Response({"code": "VALIDATION_ERROR", ...}, status=400)
    Reservation.objects.create(...)

# ✅
def create(self, request):
    serializer = ReservationCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    reservation = reservations_service.create_reservation(
        **serializer.validated_data,
        actor=request.user,
        today=timezone.localdate(),
    )
    return Response(ReservationSerializer(reservation).data, status=201)
```

```python
# ❌ — float; statement que chama o motor
total = float(rate) * nights
return engine.calculate_bill(...)  # dentro de statement()

# ✅ — Decimal + quantize_money; extrato hidrata o livro
from core.money import quantize_money
from core.serializers import money_field  # borda HTTP: string decimal
statement_from_lines(lines, total=account.total_amount)
```

## Gotchas

- **Service interpreta o `now` injetado, não lê o relógio.** `timezone.localtime(now)` / `timezone.localdate(now)` sim; `timezone.now()` / `timezone.localdate()` sem argumento não.
- **Ordem de lock:** Guest (pk asc) → Room → Reservation → Account. `filter(pk__in=ids)` **sem join** no M2M (`FOR UPDATE` recusa outer join); `list(...)` para o queryset executar. `create_reservation` não trava: a autoridade é o `EXCLUDE` sob savepoint.
- **Nome da constraint é contrato** (`GUEST_DOCUMENT_UNIQUE`, `RESV_ROOM_NO_OVERLAP`, …). `translate_integrity_error` precisa do atomic interno — senão o 409 vira 500.
- **Códigos de domínio** (README §6; código novo é contrato com o frontend): `VALIDATION_ERROR` 400; `INVALID_STATUS`, `ROOM_UNAVAILABLE`, `EARLY_CHECKIN`, `DUPLICATE_DOCUMENT` 409. `extra` estruturado (`paid_at`, `opens_at`, `room_id`, campo) — o cliente não parseia `detail`.
- **Dinheiro:** `Decimal` + `quantize_money` (único arredondamento). API via `money_field()`. O CI recusa `float(` em `hotel/`, `accounts/`, `core/`, `ai/`.
- **`calculate_bill` tem três chamadores:** `check_out`, `preview_checkout` e `quote_scheduled_stay`. Não acrescente um quarto que escreva. Política da estadia é a **amarrada no check-in** (D15), não a vigente na saída.
- **PII:** `Guest.save()` normaliza; `bulk_create` está bloqueado. Telefone E.164 e nacionalidade ISO valem no service (D9). Sem log de payload de hóspede.
- **Admin do Django não está instalado** — seria escrita fora do service.
- **Não compre hexagonal/CQRS.** `engine.py` já é o hexágono; o resto é orquestração de transação.
- OpenAPI: tag em `core.openapi`, erros com `ErrorEnvelopeSerializer`. Strings visíveis em português.

## Após editar

Na pasta `backend/`, caminho nativo (a imagem Docker não tem bind mount):

`uv run ruff check .` → `uv run lint-imports` → se mexeu em model, `uv run python manage.py makemigrations --check --dry-run`. Rode o teste do arquivo que você tocou.

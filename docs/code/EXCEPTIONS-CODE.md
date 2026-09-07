## Exceptions

### Envelope único

O DRF não tem forma única de erro: ora dict de campos, ora `{"detail": "..."}`, ora `{"non_field_errors": [...]}`. O `exceptions.py` envelopa **qualquer** erro na mesma forma, para o frontend ramificar por `code`:

```json
{
  "code": "...",
  "detail": "...",
  "extra": {}
}
```

```json
{
  "code": "EARLY_CHECKIN",
  "detail": "Check-in permitido a partir das 14:00.",
  "extra": { "server_time": "13:45", "opens_at": "14:00" }
}
```

`VALIDATION_ERROR` é o caso especial: o `extra` é o mapa de campos, na mesma forma que o DRF já devolve. `POST /api/guests/` sem corpo:

```json
{
  "code": "VALIDATION_ERROR",
  "detail": "Dados inválidos.",
  "extra": {
    "full_name": ["Este campo é obrigatório."],
    "document": ["Este campo é obrigatório."],
    "phone": ["Este campo é obrigatório."],
    "nationality": ["Este campo é obrigatório."]
  }
}
```

### Os três caminhos até o envelope

1. **Exceção do DRF.** O handler pega o `default_code` do DRF e coloca em maiúsculas (`throttled` → `THROTTLED`). Só trata à mão o que isso deixaria fora do contrato: `ValidationError` (viraria `INVALID`) e `AuthenticationFailed` (viraria `AUTHENTICATION_FAILED`). `Http404` e o `PermissionDenied` do Django são convertidos na entrada; sem isso, saem como `ERROR`.
2. **`DomainError`** (`core/errors.py`) — regra de negócio, tem ramo próprio antes do handler do DRF.
3. **`ApiError`** (`core/exceptions.py`) — `APIException` com um `code` nosso.

Bug não previsto (`TypeError`, etc.) **não** entra no envelope: o handler devolve `None` e o Django responde 500.

### De onde vem o `VALIDATION_ERROR`

Três origens, mesmo JSON.

1. Automático do serializer (`guests/serializers.py`):

```python
document = serializers.CharField(
    allow_blank=False,
    max_length=DOCUMENT_MAX_LENGTH,
    trim_whitespace=True,
)
```

2. `raise` explícito no serializer (`guests/serializers.py`):

```python
def validate_document(self, value: str) -> str:
    normalized = normalize_document(value)
    if len(normalized) < DOCUMENT_MIN_LENGTH:
        raise serializers.ValidationError(
            f"Documento exige ao menos {DOCUMENT_MIN_LENGTH} caracteres alfanuméricos."
        )
    return value.strip()
```

Com `validate_<campo>`, o DRF usa o nome depois de `validate_` como chave — aqui, `{"document": [...]}`.

3. `raise` explícito no serviço — regra de negócio (`hotel/reservations/services.py`):

```python
if checkin_date < today:
    raise DomainValidationError("checkin_date", "Data de check-in não pode ser no passado.")
if checkout_date <= checkin_date:
    raise DomainValidationError(
        "checkout_date", "Data de checkout deve ser posterior à de check-in."
    )
```

Isso não mora no serializer: precisa de `today`, e serializer não lê relógio nem aplica regra. Toda mutação passa pelo serviço (API, seed, teste). O mesmo vale para o telefone, validado em `guests/services.py` porque a normalização E.164 é regra, não forma do payload.

### `DomainError`

Tipo dos erros de **regra de negócio** (serviço), em `core/errors.py`.

O serviço não lança erros do tipo HTTP (como `serializers.ValidationError` e o resto do `rest_framework`). Isso para uma separação mais clara de erros de negócio no sistema, o que facilita a leitura de erros por seeds, testes e o tratamento próprio no `exceptions.py`.

O default do `DomainError` é 409 (conflito com o estado atual: check-in cedo, status inválido, documento duplicado... etc). O `DomainValidationError` é o filho 400: ainda é regra de negócio, mas o JSON replica o do serializer (`extra` = mapa de campos) para o frontend tratar todo 400 de validação do mesmo jeito.

### `ApiError`

Tipo dos erros que nascem na **borda HTTP**: não são regra de negócio (não são do serviço) nem forma do payload (não são do serializer). É um `APIException` do DRF com um atributo a mais:

```python
class AiDisabledError(ApiError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "AI_DISABLED"
    default_detail = "Íris indisponível: nenhuma chave configurada."
```

O DRF já usa a palavra `code` no `__init__` para um slug interno (`not_found`). Por isso o nosso atributo é `error_code`: senão `AiUpstreamError(code="X")` parece trocar o envelope e não troca. Serviço, sem herança do DRF, usa `code`.

### `translate_integrity_error`

Context manager em `core/errors.py`. Traduz violação de constraint em `DomainError`, casando pelo **nome** da constraint:

```python
with translate_integrity_error({GUEST_DOCUMENT_UNIQUE: DuplicateDocumentError}):
    return Guest.objects.create(...)
```

#### Por que existe

A checagem prévia do serviço não é autoridade: entre o `SELECT` e o `INSERT` há uma janela.

```
req A: exists(document) → False ─┐
req B: exists(document) → False ─┤ os dois passam pela guarda
req A: INSERT                    │ ok
req B: INSERT                    ┘ viola guest_document_unique
```

Quem decide é o banco, lançando `IntegrityError`. Cru, ele quebra duas coisas:

- **Vira 500 com corpo HTML.** `IntegrityError` não é `DomainError` nem `APIException`: cai no caminho do bug não previsto, o handler devolve `None`, e a mesma requisição responde 409 ou 500 conforme o timing.
- **Aborta a transação do chamador.** No PostgreSQL o erro invalida a transação inteira, e a query seguinte estoura `TransactionManagementError`. Daí o `transaction.atomic()` interno: o savepoint isola a violação e deixa a `atomic` de fora utilizável.

#### A guarda de leitura continua no serviço

Papéis diferentes: a guarda decide o caso comum e entrega mensagem específica com `extra` rico (`conflicting_reservation_id`); a constraint decide a corrida e só sabe o próprio nome.

#### Onde é usada

| Constraint | Vira | Status | Guarda prévia |
|---|---|---|---|
| `guest_document_unique` | `DuplicateDocumentError` | 409 | `_assert_document_available` |
| `room_number_unique` | `DuplicateRoomNumberError` | 400 `VALIDATION_ERROR` | nenhuma |
| `resv_room_no_overlap` (`ExclusionConstraint`) | `RoomUnavailableError` | 409 | `_assert_room_free` |

#### Quando não traduzir

No `check_in` as guardas rodam sob lock: `_lock_people` trava as linhas de `Guest` (titular e acompanhantes) e um `select_for_update` trava o `Room`, antes de qualquer leitura. Dois check-ins concorrentes da mesma pessoa — ou no mesmo quarto — serializam no banco, e o segundo só lê depois do commit do primeiro. Sem janela não há violação a traduzir: `resv_one_active_per_guest` e `resv_one_active_per_room` ficam como invariantes do banco, e as guardas dão a resposta, com `extra` que a constraint não teria (`active_reservation_id`, `conflicting_reservation_id`).

O eixo não é "qual erro merece tradução", é **se existe linha para travar**:

| | Linha para travar | Autoridade | Tradução |
|---|---|---|---|
| `create_guest`, `create_room` | não — a linha é a que está sendo criada | constraint | sim |
| `create_reservation` | o conflito é com um intervalo de datas, não com uma linha | `EXCLUDE` | sim |
| `check_in` | sim — `Guest` e `Room` já existem | guarda sob lock | não |

Traduza quando não há o que travar; trave quando há, e ganhe o `extra` melhor de graça.

# Decisões técnicas principais

Documento para desenvolvedores entenderem decisões técnicas do projeto.

## USE_TZ

**`USE_TZ = True`**: O Django guarda todas as datas e horas no formato UTC (Tempo Coordenado Universal) dentro do banco de dados. Na hora de mostrar para o usuário, ele converte para o fuso horário local definido em `TIME_ZONE`.

**Vantagens de ativar (`True`):**

1. Evita erros durante mudanças de horário de verão.
2. Facilita sistemas acessados por pessoas em países ou fusos horários diferentes.
3. Padroniza os registros temporais da aplicação. [1]

**`USE_TZ = False`**: O Django usa o horário local do servidor sem conversões automáticas ao salvar no banco de dados.

## Exceptions no backend

### Envelope único

O DRF default não tem um `code` estável. Às vezes é dict de campos, às vezes `{ "detail": "..." }`, às vezes `{ "non_field_errors": [...] }`.

Exemplo de serializer (a view dispara `serializer.is_valid(raise_exception=True)` e o `raise` ocorre no serializer):

```json
{
  "document": ["Documento exige ao menos 4 caracteres alfanuméricos."],
  "phone": ["Telefone exige ao menos 8 dígitos."]
}
```

O `exceptions.py` envelopa **qualquer** erro previsto na mesma forma:

```json
{
  "code": "...",
  "detail": "...",
  "extra": {}
}
```

Assim, o frontend ramifica por `code`.

O `VALIDATION_ERROR` é um caso especial em que o `extra` é o mapa de campos:

```json
{
  "code": "VALIDATION_ERROR",
  "detail": "Dados inválidos.",
  "extra": {
    "document": ["Documento exige ao menos 4 caracteres alfanuméricos."],
    "phone": ["Telefone exige ao menos 8 dígitos."]
  }
}
```

Outro `code`:

```json
{
  "code": "EARLY_CHECKIN",
  "detail": "Check-in permitido a partir das 14:00.",
  "extra": { "server_time": "13:45" }
}
```

O catálogo de `code` está no RESUMO §7.

Bug não previsto (`TypeError`, etc.) **não** entra no envelope: o handler devolve `None` e o Django responde 500.

### Os três caminhos até o envelope

1. **Exceção do DRF.** O handler pega o `default_code` do DRF e coloca em maiúsculas (`throttled` → `THROTTLED`). Só trata à mão o que isso deixaria fora do contrato: `ValidationError` (viraria `INVALID`) e `AuthenticationFailed` (viraria `AUTHENTICATION_FAILED`). `Http404` e o `PermissionDenied` do Django são convertidos na entrada; sem isso, saem como `ERROR`.
2. **`DomainError`** (`services/errors.py`) — regra de negócio, tem ramo próprio antes do handler do DRF.
3. **`ApiError`** (`exceptions.py`) — `APIException` com um `code` nosso.

### De onde vem o `VALIDATION_ERROR`

Três origens, mesmo JSON.

1. Automático do serializer (`serializers.py`):

```python
document = serializers.CharField(
  allow_blank=False,
  max_length=DOCUMENT_MAX_LENGTH,
  trim_whitespace=True,
)
```

2. `raise` explícito no serializer (`serializers.py`):

```python
def validate_phone(self, value: str) -> str:
    if len(normalize_phone(value)) < PHONE_MIN_LENGTH:
        raise serializers.ValidationError(
            f"Telefone exige ao menos {PHONE_MIN_LENGTH} dígitos."
        )
```

Ps.: com `validate_<campo>`, o DRF usa o nome depois de `validate_` como chave. O exemplo acima, no default do DRF, retorna:

```json
{
  "phone": ["Telefone exige ao menos 8 dígitos."]
}
```

3. `raise` explícito no serviço — regra de negócio (`services/reservations.py`):

```python
if checkin_date < today:
    raise DomainValidationError("checkin_date", "Data de check-in não pode ser no passado.")
if checkout_date <= checkin_date:
    raise DomainValidationError(
        "checkout_date", "Data de checkout deve ser posterior à de check-in."
    )
```

Isso não mora no serializer: precisa de `today`, e serializer não lê relógio nem aplica regra. Toda mutação passa pelo serviço (API, seed, teste).

### `DomainError`

Tipo dos erros de **regra de negócio** (serviço).

O serviço não lança erros do tipo HTTP (como `serializers.ValidationError` e o resto do `rest_framework`). Isso para uma separação mais clara de erros de negócio no sistema, o que facilita a leitura de erros por seeds, testes e o tratamento próprio no `exceptions.py`.

O default do `DomainError` é 409 (conflito com o estado atual: check-in cedo, status inválido, documento duplicado... etc). O `DomainValidationError` é o filho 400: ainda é regra de negócio, mas o JSON replica o do serializer (`extra` = mapa de campos) para o frontend tratar todo 400 de validação do mesmo jeito.

### `ApiError`

Tipo dos erros que nascem na **borda HTTP**: não são regra de negócio (não são do serviço) nem forma do payload (não são do serializer). É um `APIException` do DRF com um atributo a mais:

```python
class AiDisabledError(ApiError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "AI_DISABLED"
    default_detail = "Preenchimento por IA indisponível: nenhuma chave configurada."
```

O DRF já usa a palavra `code` no `__init__` para um slug interno (`not_found`). Por isso o nosso atributo é `error_code`: senão `AiUpstreamError(code="X")` parece trocar o envelope e não troca. Serviço, sem herança do DRF, usa `code`.

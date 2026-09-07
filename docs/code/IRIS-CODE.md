# Íris: o código, passo a passo

Este documento segue uma requisição `POST /api/ai/copilot/` pelo código, na ordem em que ela acontece. Como ligar a feature e o que sai para o provedor ficam fora dele.

O modelo não recebe o banco nem escreve SQL: a cada rodada ele pede **uma função**, e o Django a executa pelos mesmos selectors e serviços das telas. A conversa termina numa função `answer`, cujos argumentos são a resposta. Nenhuma ferramenta grava: a ação proposta vira um botão que chama os endpoints de check-in e de checkout de sempre.

## Mapa

| Arquivo | Responsabilidade |
| --- | --- |
| [`ai/urls.py`](../../backend/ai/urls.py) | Duas rotas |
| [`ai/config.py`](../../backend/ai/config.py) | Chave, modelo, os três tetos |
| [`ai/serializers.py`](../../backend/ai/serializers.py) | Contrato de entrada e saída do endpoint |
| [`ai/views.py`](../../backend/ai/views.py) | HTTP: portão, validação, relógio, throttle, OpenAPI |
| [`ai/copilot.py`](../../backend/ai/copilot.py) | Instrução de sistema, sessão, validação da resposta |
| [`ai/client.py`](../../backend/ai/client.py) | O laço de *tool use* e o transporte HTTP |
| [`ai/tools.py`](../../backend/ai/tools.py) | As cinco ferramentas: declaração, validação, execução, recorte |
| [`ai/exceptions.py`](../../backend/ai/exceptions.py) | `AiDisabledError` e `AiUpstreamError` |

`client.py` não conhece o hotel e `tools.py` não faz HTTP: `converse()` recebe `tools`, `run_tool` e `terminal` por parâmetro. Trocar de provedor mexe em `client.py` e no formato de declaração em `_tool()`, não nas ferramentas.

## Rota e portão

```python
# config/urls.py
path("api/ai/", include("ai.urls")),

# ai/urls.py
path("status/", ai_status, name="ai-status"),
path("copilot/", copilot, name="ai-copilot"),
```

`status/` existe para o frontend saber se a Íris está ligada antes de desenhar a página, sem gastar uma pergunta para tomar `503`.

```python
# ai/config.py
TIMEOUT_SECONDS = 10.0   # uma chamada
BUDGET_SECONDS = 15.0    # o laço inteiro
MAX_ROUNDS = 7

def ai_enabled() -> bool:
    return bool(api_key())
```

Sem `OPENAI_API_KEY`, `ai_enabled()` é `False`: `status/` responde `enabled: false` e `copilot/` responde `503`. Timeout por chamada não limita o laço (sete chamadas de 9 s passariam de um minuto); daí o orçamento global.

## View

```python
@api_view(["POST"])
@throttle_classes([AiRateThrottle])
def copilot(request: Request) -> Response:
    if not ai_enabled():
        raise AiDisabledError

    payload = CopilotRequestSerializer(data=request.data)
    payload.is_valid(raise_exception=True)

    result = answer(payload.validated_data["message"], now=timezone.now())
    return Response(CopilotReplySerializer(result).data)
```

- `timezone.now()` só aparece aqui. `answer()` recebe `now` e tudo abaixo é determinístico; o teste congela o relógio e assere a frase exata que foi para o prompt.
- Sem decorator de permissão: `DEFAULT_PERMISSION_CLASSES` já é `IsAuthenticated`.
- `AiRateThrottle` tem `scope = "ai"` (`THROTTLE_AI`, 20/min por usuário), separado do limite das leituras baratas.
- O `@extend_schema` declara `200`/`400`/`502`/`503`, e um teste confere os quatro no schema gerado.

O contrato em `serializers.py`: `message` é `CharField(max_length=2000, trim_whitespace=True)`, então `"   "` é `400` e o teto limita o custo em tokens. A resposta é `reply` mais `proposed_action` (`type`, `reservation_id`, `guest_name`) ou `null`. Esses serializers geram o schema OpenAPI que o frontend espelha em Zod.

## Instrução de sistema

```python
def system_instruction(now: datetime) -> str:
    window = services.checkin_window(now=now)
    local_now = window.server_time
    return SYSTEM_INSTRUCTION.format(
        server_time=local_now.strftime("%H:%M"),
        weekday=weekday_label(local_now.date()),
        date=local_now.strftime("%d/%m/%Y"),
        opens_at=f"{window.opens_at:%H:%M}",
        state="ainda não abriu" if window.is_early else "já abriu",
    )
```

O modelo não tem relógio, e o horário de abertura do check-in é política versionada no banco. `checkin_window()` é o mesmo serviço que decide o `409 EARLY_CHECKIN`, então o prompt recebe:

> `Agora: 13:45 (sexta-feira, 07/03/2025). O check-in abre às 15:00 (ainda não abriu).`

Das regras do prompt, as que fecham um comportamento do código:

| Regra | Evita |
| --- | --- |
| Consulte antes de afirmar qualquer fato | Nome, quarto, data ou valor inventado |
| Valores em reais copiados dos resultados, nunca recalculados | Aritmética de dinheiro pelo modelo; ele transcreve o que o `Decimal` calculou |
| Mais de uma reserva casa o termo? Liste e use `action_type: none` | O modelo desempatar homônimos (ver o guarda de identidade) |
| Termine sempre chamando `answer` sozinha | Ferramentas ignoradas na rodada final (ver o laço) |
| Cada mensagem é independente | Fingir um histórico que não existe |

## `answer()` e a `ToolSession`

```python
def answer(message: str, *, now: datetime) -> dict[str, Any]:
    session = ToolSession(now=now)
    raw = converse(
        system=system_instruction(now),
        message=message,
        tools=TOOLS,
        run_tool=session.run,
        terminal=ANSWER,
    )

    payload = AnswerInput(data=raw)
    if not payload.is_valid():
        raise AiUpstreamError

    return {
        "reply": payload.validated_data["reply"],
        "proposed_action": session.resolve_action(payload.validated_data),
    }
```

`ToolSession` nasce uma por requisição e guarda `now`, `seen_ids` (reservas que apareceram em algum resultado) e `ambiguous_ids` (as que apareceram ao lado de outra). O `now` chega às ferramentas: `available_rooms` usa `timezone.localdate(self.now)` e `revenue_summary` calcula o início do período com `timezone.localtime(self.now)`. `run_tool=session.run` é a injeção: `converse()` recebe uma função `(nome, args) -> dict`.

## O laço

```python
def converse(*, system, message, tools, run_tool, terminal) -> dict[str, Any]:
    deadline = time.monotonic() + BUDGET_SECONDS
    key = api_key()
    items: list[dict[str, Any]] = [{"role": "user", "content": message}]

    for round_number in range(MAX_ROUNDS):
        last_round = round_number == MAX_ROUNDS - 1
        payload = _payload(system, items, tools, terminal if last_round else None)
        output = _post(payload, deadline, key)
        calls = _function_calls(output)

        final = _call_named(calls, terminal)
        if final is not None:
            return _arguments(final)

        items.extend(output)
        items.extend(_tool_output(call, run_tool) for call in calls)

    raise AiUpstreamError
```

```text
Rodada 1  input:  [user: "A Ana Souza chegou, tem reserva hoje."]
          output: function_call(find_reservations, {status: PENDING, query: "Ana Souza"})

Rodada 2  input:  [user, function_call, function_call_output{total: 1, reservations: [...]}]
          output: function_call(answer, {reply: "...", action_type: "check_in", reservation_id: 4})
```

- **Orçamento.** `deadline` é monotônico (relógio de parede anda para trás com NTP). `_post` calcula `remaining = deadline - time.monotonic()`, falha com `502` se acabou e usa `timeout=min(remaining, TIMEOUT_SECONDS)`. Com chamadas de 4 s os timeouts saem `10.0, 10.0, 7.0, 3.0` e a quinta chamada não acontece: sete rodadas lentas ficam abaixo do timeout de 30 s do worker.
- **`tool_choice: "required"`.** O modelo não pode responder em prosa. Output sem `function_call` é `502` em `_function_calls`, sem garimpar JSON de texto.
- **Última rodada força `answer`.** O `tool_choice` vira `{"type": "function", "name": "answer"}`: um modelo que ficou repetindo consultas termina em resposta, não em erro.
- **`calls` é lista.** A API pode pedir várias funções na mesma rodada ("como está o hotel?" gera `find_reservations` para `PENDING` e `CHECKED_IN` juntas). Todas executam, cada resultado amarrado ao seu `call_id`.
- **A terminal ganha.** `_call_named` roda antes de executar as outras chamadas; se `answer` vier junto de outras, elas não executam. A regra "termine chamando `answer` sozinha" torna isso explícito ao modelo.
- **`items.extend(output)` devolve o output inteiro**, inclusive itens de raciocínio, antes dos `function_call_output`. A API exige essa ordem para parear chamada e resultado.

### Transporte

`httpx.post` direto em `https://api.openai.com/v1/responses`, sem o SDK do provedor:

```python
{
    "model": model(),
    "store": False,
    "instructions": system,
    "tools": tools,
    "tool_choice": {"type": "function", "name": forced} if forced else "required",
    "max_output_tokens": MAX_OUTPUT_TOKENS,
    "input": items,
}
```

```python
except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
    raise AiUpstreamError from exc
```

Rede e status não-2xx (`HTTPError`, via `raise_for_status()`), corpo sem `output` (`KeyError`), corpo que não é JSON (`ValueError`) e tipo errado (`TypeError`) viram o mesmo `502`; o `from exc` mantém a causa no traceback sem expô-la na resposta. `_tool_output` serializa o resultado com `ensure_ascii=False` (acentos escapados custam tokens) e recusa `function_call` sem `call_id`.

## Ferramentas

### Modo estrito

```python
def _tool(name, description, properties) -> dict[str, Any]:
    return {
        "type": "function", "name": name, "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }
```

O modo estrito da OpenAI exige todo campo em `required`; campo opcional faz a API reescrever o schema. Por isso os "opcionais" são sentinelas descritas na própria ferramenta: `query` vazia lista todas, `reservation_id: 0` quando `action_type` é `none`. Um teste varre `TOOLS` conferindo `required == list(properties)` e `additionalProperties is False`.

As descrições são contrato. "Em `query` passe só o termo que o atendente falou [...] nunca a frase inteira" existe porque o modelo tende a passar a frase toda, e `icontains` com a frase não casa nada.

### As cinco

| Ferramenta | Executa | Nota |
| --- | --- | --- |
| `find_reservations` | `selectors.search_stays` | Único ponto do sistema que busca por **acompanhante**: quem pergunta por uma pessoa não sabe se ela é titular |
| `preview_checkout` | `services.preview_checkout` | O mesmo motor de cobrança do checkout real, sem lock e sem escrita |
| `available_rooms` | `selectors.available_rooms` | `~Exists`, não `exclude`, por ser relação multivalorada |
| `revenue_summary` | `selectors.revenue_summary` | Três queries, para não multiplicar `Sum` por cardinalidade |
| `answer` | nada | Função terminal: não tem handler |

Nenhuma ferramenta escreve. `preview_checkout` devolve `StatementSerializer`, com `money_field` serializado como string: o modelo recebe `"425.00"` e transcreve.

### Argumento inválido volta para o modelo

```python
def _validated(form, args) -> dict[str, Any]:
    payload = form(data=args)
    if not payload.is_valid():
        # Só os nomes dos campos: ecoar o valor devolveria ao modelo o erro dele.
        raise ToolError(f"Argumentos inválidos; revise: {', '.join(sorted(payload.errors))}.")
    return payload.validated_data
```

Cada chamada passa por um serializer do DRF, com validação cruzada onde cabe (`AvailableRoomsInput.validate` exige saída depois da entrada). `ToolSession.run` converte `ToolError` em `{"error": ...}` na conversa e devolve `{"error": "Ferramenta desconhecida."}` para função inventada. Argumento errado custa uma rodada e termina em `200`, não em `502`. Em `_preview`, `DomainError` do serviço (prévia de uma reserva `PENDING`, por exemplo) também vira `ToolError`: o modelo busca melhor em vez de o atendente tomar um `409`.

### Recorte para o provedor

```python
class ReservationSlice(serializers.Serializer):
    """Recorte para o provedor: nomes, quarto e datas saem; documento e telefone nunca."""

    reservation_id = serializers.IntegerField(source="pk")
    status = serializers.CharField()
    guest_name = serializers.CharField(source="guest.full_name")
    companions = serializers.SlugRelatedField(many=True, read_only=True, slug_field="full_name")
    room = serializers.CharField(source="room.number")
    checkin_date = serializers.DateField()
    checkout_date = serializers.DateField()
    has_vehicle = serializers.BooleanField()
    checked_in_at = serializers.DateTimeField(allow_null=True)
```

Campos declarados são *allowlist*: uma coluna nova no model não sai para o provedor. Um `ModelSerializer` com `exclude` seria *denylist*. No outro caminho, `StatementSerializer.guest` é `GuestMinimalSerializer` (`id`, `full_name`). `MAX_ROWS = 10` limita as linhas por busca, `"store": False` pede que o provedor não retenha a conversa, e um teste com `caplog` em `DEBUG` confere que nome, documento, pergunta e chave não aparecem em log, inclusive na falha.

## `answer` como terminal

`answer` está em `TOOLS` mas não em `handlers`: quando o modelo a chama, `converse()` devolve os argumentos dela. A estrutura da saída é garantida pela API (o modelo preenche um schema), sem parse de JSON dentro de prosa. `AnswerInput` inválido é `502`, porque é a última palavra e não há rodada seguinte para corrigir: `reply` ausente, `action_type` fora do enum, `reservation_id` que não é número, `arguments` que não é JSON.

## Guarda de identidade

"João Silva" no 201 e "João Pereira" no 202, ambos hospedados; o atendente diz "o João está saindo". O modelo busca "João", recebe duas reservas e ainda pode devolver `checkout` com o id de um deles. Aceitar isso seria mostrar um botão que fecha a conta errada.

```python
def _find(self, args):
    data = _validated(FindReservationsInput, args)
    rows = list(selectors.search_stays(status=data["status"], term=data["query"])[:MAX_ROWS])

    ids = {row.pk for row in rows}
    self.seen_ids |= ids
    if len(rows) > 1:
        self.ambiguous_ids |= ids
    ...

def actionable(self, reservation_id: int) -> bool:
    return reservation_id in self.seen_ids and reservation_id not in self.ambiguous_ids
```

| Condição | Barra |
| --- | --- |
| `in seen_ids` | Id inventado: nenhuma ação sobre reserva que não apareceu num resultado |
| `not in ambiguous_ids` | O modelo desempatar: duas reservas no mesmo resultado travam as duas |

`ambiguous_ids` nunca é limpo. Buscar "João" (duas), depois `"#201"` (uma) e propor a ação ainda é negado: quem desempatou foi o modelo, e o atendente precisa reformular. `_preview` usa o mesmo `actionable()`, como `ToolError`.

```python
def resolve_action(self, data):
    action_type = data["action_type"]
    if action_type == "none" or not self.actionable(data["reservation_id"]):
        return None

    reservation = selectors.reservation_queryset().filter(pk=data["reservation_id"]).first()
    if reservation is None or reservation.status != ACTION_STATUS[action_type]:
        return None

    return {"type": action_type, "reservation_id": reservation.pk, "guest_name": reservation.guest.full_name}
```

O status é relido do banco: um check-in concorrente entre a busca e a resposta derruba a ação em vez de oferecer um botão que falharia com `409`. `guest_name` vem do banco, não do texto do modelo. Ação negada não derruba a resposta: `proposed_action` vira `None` e o `reply` segue.

## Erros

| Nível | Classe | Destino | Efeito |
| --- | --- | --- | --- |
| Recuperável pelo modelo | `ToolError` | `{"error": ...}` na conversa | Custa uma rodada, `200` |
| Feature desligada | `AiDisabledError` | HTTP | `503 AI_DISABLED` |
| Provedor inutilizável | `AiUpstreamError` | HTTP | `502 AI_UPSTREAM_ERROR` |

As duas classes HTTP herdam de `ApiError` e só declaram `status_code`, `error_code` e `default_detail`; o `EXCEPTION_HANDLER` global as coloca no envelope `{code, detail, extra}` de toda a API. Todas as falhas do provedor colapsam nesse envelope genérico, sem vazar a mensagem do upstream. `502` porque nós somos o gateway e o upstream falhou: não é `500` (não é bug nosso) nem `400` (a requisição estava boa).

## Frontend

[`features/ai/schemas.ts`](../../frontend/src/features/ai/schemas.ts) espelha o `CopilotReplySerializer` em Zod (`reply` e `proposed_action` nullable com `type`, `reservation_id`, `guest_name`), e [`types.ts`](../../frontend/src/features/ai/types.ts) deriva os tipos com `z.infer`: um contrato, sem interface paralela para manter em sincronia.

[`api.ts`](../../frontend/src/features/ai/api.ts) faz `apiClient.post<unknown>` e passa por `parseResponse(copilotReplySchema, response)`: o tipo vem depois da validação em runtime, não de um `as`.

[`hooks.ts`](../../frontend/src/features/ai/hooks.ts): `useAiStatus` é `useQuery` com `staleTime: Infinity` (a chave não muda em runtime) e `throwOnError: false`, para `/ai/status/` falhando mostrar "desligada" em vez de cair no Error Boundary. `useCopilot` é `useMutation`.

[`IrisPage.tsx`](../../frontend/src/pages/IrisPage/IrisPage.tsx):

```tsx
const enabled = status.data?.enabled === true
const answer = ask.data
const action = done === null ? (answer?.proposed_action ?? null) : null
```

`=== true` porque `undefined` durante o carregamento não é "ligada". `action` só existe enquanto `done === null`: depois do clique o botão dá lugar ao texto de confirmação, sem segundo clique.

[`IrisAction.tsx`](../../frontend/src/pages/IrisPage/IrisAction.tsx) usa `useCheckInFlow` e `useCheckOut` de `features/reservations`, os mesmos hooks da página de reservas. O `409 EARLY_CHECKIN` abre o `EarlyCheckinDialog`, o checkout abre o `CheckoutStatementDialog` com extrato e pagamento, e invalidação de cache, toasts e erros são os mesmos. Não existe endpoint de IA que grava.

## Testes

[`tests/api/test_ai.py`](../../backend/tests/api/test_ai.py) não chama a rede. A fixture `calls` substitui `httpx.post` por um dublê que registra cada chamada (URL, headers, `json`) e devolve o próximo item de uma fila enfileirada pelo caso. A fila é estrita: rodada não prevista falha o teste em vez de passar em silêncio. Isso permite assertar o payload campo a campo, encadear rodadas (inclusive o `502` após `MAX_ROUNDS` buscas e a forçada de `answer`), substituir `time.monotonic` por um contador e tabelar as falhas do provedor e os argumentos inválidos.

Dois testes protegem a suíte: `httpx.post` real levanta `AssertionError` em teste, e `settings.OPENAI_API_KEY` é `""`.

## Removível por construção

```toml
[[tool.importlinter.contracts]]
name = "core e accounts sao folhas; ninguem do dominio importa ai ou config"
type = "forbidden"
source_modules = ["core", "accounts", "hotel"]
forbidden_modules = ["ai", "config"]

[[tool.importlinter.contracts]]
name = "ai so toca o dominio por reservations"
type = "forbidden"
source_modules = ["ai"]
forbidden_modules = ["hotel.billing", "hotel.rooms", "hotel.guests"]
allow_indirect_imports = true
```

Ninguém do domínio importa `ai`, então apagar a pasta não quebra nada; `ai` só toca o domínio por `hotel.reservations`. `allow_indirect_imports = true` porque a cadeia `ai.tools → reservations.services → billing.engine` é legítima; o proibido é o import direto. O pacote não entra em `INSTALLED_APPS` (sem models nem migrações) e só `pages/IrisPage/` importa `features/ai/`.

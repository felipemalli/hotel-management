# Íris — o código, passo a passo

> Este documento é o **como**: o caminho do código, arquivo por arquivo, na
> ordem em que uma requisição acontece. O **o que** da feature (como ligar, o
> que sai para o provedor) fica fora dele.

A Íris responde ao atendente em linguagem natural consultando o próprio banco.
O que a diferencia de um chat colado no produto é quem faz as consultas: **o
modelo não recebe o banco e não escreve SQL** — ele *pede* uma função por vez, e
o Django a executa pelos mesmos selectors e serviços que as telas usam.

Duas ideias sustentam o resto, e vale fixá-las antes de descer ao código:

1. **Saída de modelo é entrada não confiável.** Cada argumento que ele manda
   passa por um serializer do DRF, e nenhum id que ele cita vira ação sem o
   servidor conferir que aquela reserva apareceu, sozinha, num resultado real.
2. **A IA não grava nada.** Ela descobre e *propõe*; o clique do atendente passa
   pelos endpoints de check-in e de checkout de sempre, com os mesmos locks,
   diálogos e transações (*human-in-the-loop*).

---

## 0. O mapa: oito arquivos, uma responsabilidade cada

| Arquivo | Responsabilidade | O que **não** faz |
| --- | --- | --- |
| [`ai/urls.py`](../../backend/ai/urls.py) | Duas rotas | — |
| [`ai/config.py`](../../backend/ai/config.py) | Chave, modelo, os três tetos | Não conhece HTTP |
| [`ai/serializers.py`](../../backend/ai/serializers.py) | Contrato de entrada e saída do endpoint | Não conhece o provedor |
| [`ai/views.py`](../../backend/ai/views.py) | HTTP: portão, validação, relógio, throttle, OpenAPI | Nenhuma regra de negócio |
| [`ai/copilot.py`](../../backend/ai/copilot.py) | Orquestração: instruções + sessão + validação final | Não fala HTTP com o provedor |
| [`ai/client.py`](../../backend/ai/client.py) | O laço de *tool use* e o transporte | Não conhece hotel nenhum |
| [`ai/tools.py`](../../backend/ai/tools.py) | As cinco ferramentas: declaração, validação, execução, recorte | Não conhece o provedor |
| [`ai/exceptions.py`](../../backend/ai/exceptions.py) | Os dois erros de domínio da feature | — |

A fronteira que importa: **`client.py` não sabe o que é um hotel e `tools.py`
não sabe o que é a OpenAI.** `converse()` recebe `tools`, `run_tool` e
`terminal` como parâmetros — é um motor genérico de *tool use*. Trocar de
provedor é reescrever um arquivo de 111 linhas, sem tocar no domínio.

---

## 1. A rota

[`config/urls.py`](../../backend/config/urls.py) monta o app sob um prefixo, e
[`ai/urls.py`](../../backend/ai/urls.py) declara as duas rotas:

```python
# config/urls.py
path("api/ai/", include("ai.urls")),

# ai/urls.py
path("status/", ai_status, name="ai-status"),
path("copilot/", copilot, name="ai-copilot"),
```

**Por que duas.** `status/` é o portão de fallback: o frontend precisa saber se a
Íris existe **antes** de desenhar a tela. Sem ela, a única forma de descobrir
seria mandar uma pergunta e tomar um `503`. Uma rota barata — `GET`, sem I/O
externo — resolve.

---

## 2. O portão: a feature é opcional por construção

[`ai/config.py`](../../backend/ai/config.py) é o arquivo mais curto e o mais
importante para a narrativa da feature:

```python
DEFAULT_MODEL = "gpt-4.1-nano"
TIMEOUT_SECONDS = 10.0   # teto de UMA chamada
BUDGET_SECONDS = 15.0    # teto do LAÇO INTEIRO
MAX_ROUNDS = 7           # teto de rodadas

def ai_enabled() -> bool:
    return bool(api_key())
```

`ai_enabled()` é literalmente "existe chave configurada?", e é a primeira linha
da view. Sem `OPENAI_API_KEY` o `docker compose up` sobe um sistema **100%
funcional** e a página da Íris diz que ela está desligada.

Os três números são três tetos **diferentes**, e a distinção é o ponto: um
timeout por chamada não protege de um modelo que faz sete chamadas rápidas em
laço. Daí o orçamento global — §7.

---

## 3. O contrato de entrada e de saída

[`ai/serializers.py`](../../backend/ai/serializers.py), 28 linhas:

```python
class CopilotRequestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=2000, trim_whitespace=True)

class ProposedActionSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["check_in", "checkout"])
    reservation_id = serializers.IntegerField()
    guest_name = serializers.CharField()

class CopilotReplySerializer(serializers.Serializer):
    reply = serializers.CharField()
    proposed_action = ProposedActionSerializer(allow_null=True)
```

- `trim_whitespace=True` sobre um `CharField` (que já recusa vazio) faz
  `{"message": "   "}` virar `400` — há teste parametrizado para as três formas
  de mensagem ausente.
- `max_length=2000` é **controle de custo**: token de entrada é dinheiro, e um
  campo livre sem teto é um convite.

Esse par de serializers não é só validação: é o que gera o schema OpenAPI, que
gera o Swagger, que o frontend espelha em Zod (§12). Um contrato, quatro
consumidores.

---

## 4. A view: onde o relógio entra no sistema

[`ai/views.py`](../../backend/ai/views.py) — a view inteira tem sete linhas de
código sob cerca de cem de documentação OpenAPI:

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

Quatro decisões em sete linhas:

**`timezone.now()` só aparece aqui.** É invariante do projeto:
relógio injetável. `answer()` recebe `now` por parâmetro e, dali para baixo,
tudo é determinístico — não há um `now()` escondido no meio da cadeia. É o que
permite congelar o relógio no teste e assertar a frase exata que foi para o
prompt.

**A autenticação vem do default.** Não há decorator de permissão porque
`DEFAULT_PERMISSION_CLASSES` já é `(IsAuthenticated,)`. Segurança por default,
não por lembrança do dev — com teste parametrizado cobrindo as duas rotas.

**Throttle próprio.** `AiRateThrottle` com `scope = "ai"` → `20/min` por usuário
(`THROTTLE_AI`). Um endpoint que gasta dinheiro por chamada não pode usar o
mesmo limite das leituras baratas.

**O `@extend_schema` verboso é deliberado.** Documenta os quatro status
possíveis (`200`/`400`/`502`/`503`), exemplos de request e response e o aviso de
privacidade — e um teste verifica que os quatro códigos estão no schema. É o que
mantém o Swagger honesto quando o código muda.

---

## 5. As instruções carregam o relógio **do domínio**

Aqui começa [`ai/copilot.py`](../../backend/ai/copilot.py):

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

Um LLM não tem relógio: sem que se diga que horas são, ele inventa ou usa a data
do treino. Neste domínio a hora não basta — o horário de abertura do check-in é
**política de preço versionada** no banco (`PricingPolicy.checkin_opens`) e pode
mudar. Então o prompt não recebe "são 13:45", recebe:

> `Agora: 13:45 (sexta-feira, 07/03/2025). O check-in abre às 15:00 (ainda não abriu).`

E `checkin_window()` é **o mesmo serviço** que decide o `409 EARLY_CHECKIN` no
endpoint real de check-in. Uma fonte de verdade: é impossível a Íris narrar um
horário diferente do que o sistema vai cobrar. O teste cria uma política com
`checkin_opens=15:00`, congela o relógio em 13:45 e assere a string dentro de
`body["instructions"]`.

O prompt tem onze regras. As que carregam engenharia, não estilo:

| Regra | O que ela evita |
| --- | --- |
| "Consulte antes de afirmar qualquer fato" | Alucinação de nome, quarto, data ou valor |
| "Não achou no status esperado? Consulte o outro" | "Não há reserva" depois de olhar só uma aba — o modelo não sabe se "a Ana chegou" é `PENDING` ou `CHECKED_IN` |
| "Valores em reais copiados dos resultados, nunca recalculados" | **Aritmética de dinheiro pelo modelo.** Ele transcreve o que o `Decimal` calculou |
| "Mais de uma reserva casa o termo? Liste e peça o critério" | O modelo desempatar homônimos por conta própria (§10) |
| "Termine sempre chamando `answer` sozinha" | Ferramentas ignoradas na rodada final (§7, decisão 5) |
| "Cada mensagem é independente" | Ele fingir lembrar de um histórico que não existe |

---

## 6. A `ToolSession`: estado por requisição

```python
def answer(message: str, *, now: datetime) -> dict[str, Any]:
    session = ToolSession(now=now)
    raw = converse(
        system=system_instruction(now),
        message=message,
        tools=TOOLS,
        run_tool=session.run,       # ← injeção de dependência
        terminal=ANSWER,
    )
```

`ToolSession` ([`ai/tools.py`](../../backend/ai/tools.py)) nasce **uma por
requisição** e carrega três coisas:

```python
def __init__(self, *, now: datetime) -> None:
    self.now = now
    self.seen_ids: set[int] = set()
    self.ambiguous_ids: set[int] = set()
```

- `now` — o instante congelado, para todas as ferramentas decidirem sobre o
  mesmo "agora";
- `seen_ids` — reservas que **apareceram** em algum resultado;
- `ambiguous_ids` — reservas que apareceram **ao lado de outra**.

Esses dois conjuntos são o modelo de segurança da feature (§10).
`run_tool=session.run` é injeção de dependência: `converse()` recebe uma função
`(nome, args) -> dict` e não pergunta de onde ela vem.

---

## 7. O laço de *tool use* (o coração)

[`ai/client.py`](../../backend/ai/client.py):

```python
def converse(*, system, message, tools, run_tool, terminal) -> dict[str, Any]:
    """Roda o laço de tool use e devolve os argumentos da função terminal."""
    deadline = time.monotonic() + BUDGET_SECONDS
    key = api_key()
    items: list[dict[str, Any]] = [{"role": "user", "content": message}]

    for round_number in range(MAX_ROUNDS):
        forced = terminal if round_number == MAX_ROUNDS - 1 else None
        output = _post(_payload(system, items, tools, forced), deadline, key)
        calls = [item for item in output if item.get("type") == "function_call"]
        if not calls:
            raise AiUpstreamError

        final = next((call for call in calls if call.get("name") == terminal), None)
        if final is not None:
            return _arguments(final)

        items.extend(output)
        items.extend(_tool_output(call, run_tool) for call in calls)

    raise AiUpstreamError
```

`items` é a conversa acumulada, e ela cresce assim:

```text
Rodada 1  input:  [user: "A Ana Souza chegou, tem reserva hoje."]
          output: function_call(find_reservations, {status: PENDING, query: "Ana Souza"})

Rodada 2  input:  [user, function_call, function_call_output{total: 1, reservations: [...]}]
          output: function_call(answer, {reply: "...", action_type: "check_in", reservation_id: 4})
          → retorna
```

### As seis decisões escondidas no laço

**1 · Orçamento, não timeout.** `deadline = time.monotonic() + BUDGET_SECONDS` —
monotônico, e não `time()`, porque relógio de parede anda para trás com ajuste
de NTP. Cada chamada é encurtada para o que restou:

```python
remaining = deadline - time.monotonic()
if remaining <= 0:
    raise AiUpstreamError
...
timeout=min(remaining, TIMEOUT_SECONDS)
```

O teste substitui `monotonic` por um contador que anda 4 s por chamada e assere a
sequência exata: **`[10.0, 10.0, 7.0, 3.0]`**, e então `502`. É o que garante que
sete rodadas lentas não passem do timeout de 30 s do worker — o atendente vê um
toast, nunca um worker morto.

**2 · `tool_choice: "required"`.** Obriga o modelo a chamar *alguma* função em
toda rodada: ele não pode responder em prosa. Combinado com `if not calls: raise
AiUpstreamError`, texto solto é `502` — nada de garimpar JSON de dentro de
parágrafo.

**3 · A última rodada força `answer`.** `forced = terminal if round_number ==
MAX_ROUNDS - 1` faz o `tool_choice` da sétima rodada virar `{"type":
"function", "name": "answer"}`. Um modelo que ficou repetindo consultas termina
em **resposta útil**, não em erro. O teste assere `choices[:-1] == ["required"] *
6` e a forçada no fim.

**4 · `calls` é lista — chamadas paralelas.** A API pode pedir várias
ferramentas na mesma rodada; "como está o hotel?" gera `find_reservations(PENDING)`
**e** `find_reservations(CHECKED_IN)` juntas. As duas executam e as duas voltam,
cada uma amarrada pelo seu `call_id`. Um laço que assumisse uma chamada por
rodada quebraria aqui.

**5 · A terminal ganha da fila.** `final = next(...)` roda **antes** de executar
as outras: se `answer` vier no meio de outras chamadas, ela retorna e as outras
não executam. É por isso que o prompt diz *"termine sempre chamando `answer`
sozinha"* — o código tem uma preferência, e a instrução a torna explícita.

**6 · `items.extend(output)` devolve o output inteiro.** A API espera receber de
volta os itens que emitiu (inclusive os de raciocínio) antes dos
`function_call_output`. Filtrar só as chamadas quebra a continuidade.

### O transporte

`httpx.post` direto contra `https://api.openai.com/v1/responses`, **sem o SDK do
provedor** — uma dependência a menos, e o payload fica visível no diff:

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

Um teste assere esse corpo campo a campo, mais a URL, os headers e a **ordem**
das cinco ferramentas. E o `except` cobre as quatro famílias de falha de uma vez:

```python
except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
    raise AiUpstreamError from exc
```

rede e status (`HTTPError`, via `raise_for_status()`), corpo sem `output`
(`KeyError`), corpo que não é JSON (`ValueError`), tipo errado (`TypeError`). O
`from exc` preserva a causa no traceback sem vazá-la na resposta.

`_tool_output` embala o resultado com `ensure_ascii=False` — mandar
`"João"` gastaria tokens à toa — e recusa uma `function_call` sem `call_id`
válido, porque sem ele não há como amarrar a resposta à pergunta.

---

## 8. As ferramentas

### 8.1 Declaração no modo estrito

```python
def _tool(name, description, properties) -> dict[str, Any]:
    """Declaração no modo estrito da OpenAI: todo argumento chega sempre preenchido."""
    return {
        "type": "function", "name": name, "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": list(properties),        # ← TODOS obrigatórios
            "additionalProperties": False,
        },
    }
```

`required = list(properties)` não é preguiça: é o que o modo estrito exige — se
você declarar campo opcional, a API reescreve o seu schema. Um teste varre
**todas** as ferramentas conferindo `required == list(properties)` e
`additionalProperties is False`.

Consequência de design: como não existe campo opcional, os "opcionais" viram
valores sentinela documentados na descrição — `query` vazia lista tudo,
`reservation_id: 0` quando `action_type` é `none`.

**As descrições são contrato, não prosa.** Exemplo real:

> *"Em `query` passe só o termo que o atendente falou — nome do titular, nome de
> acompanhante, número do quarto ou nº da reserva (com ou sem '#') —, **nunca a
> frase inteira**."*

Aquele "nunca a frase inteira" existe porque o modelo tende a passar
`"A Ana Souza chegou, tem reserva hoje"` como termo, e `icontains` com a frase
inteira não casa nada. Cada frase dessas é um comportamento observado,
documentado no lugar exato onde ele acontece.

### 8.2 As cinco

| Ferramenta | Executa | Nota |
| --- | --- | --- |
| `find_reservations` | `selectors.search_stays` | O único ponto do sistema que busca por **acompanhante** |
| `preview_checkout` | `services.preview_checkout` | "Sem lock, sem escrita" — o mesmo motor do checkout real |
| `available_rooms` | `selectors.available_rooms` | `~Exists`, não `exclude` (relação multivalorada) |
| `revenue_summary` | `selectors.revenue_summary` | Três queries, para não multiplicar `Sum` por cardinalidade |
| `answer` | — | **Função terminal**: não consulta nada (§9) |

**As quatro primeiras são leitura pura; não existe ferramenta de escrita.** Mesmo
que o modelo alucine por completo, o pior resultado possível é um botão errado
que o atendente não aperta.

Dois pontos que valem destaque:

`search_stays` busca por acompanhante e `list_reservations` não — e o comentário
no selector diz por quê: *"quem pergunta por uma pessoa não sabe se ela é
titular; a tela de reservas lista por reserva"*. É uma capacidade que só faz
sentido em linguagem natural: "a Eva chegou" acha a estadia do Bruno, de quem a
Eva é acompanhante. Uma tela com filtros não faria isso.

`preview_checkout` chama o **mesmo motor de cobrança** do checkout real — diária
a diária, vaga, multa de atraso, `Decimal` — e o `money_field` serializa como
string. O modelo recebe `"425.00"` e transcreve; ele nunca soma.

### 8.3 O modelo erra, e o erro volta para ele

```python
def _validated(form, args) -> dict[str, Any]:
    payload = form(data=args)
    if not payload.is_valid():
        # Só os nomes dos campos: ecoar o valor devolveria ao modelo o erro dele.
        raise ToolError(f"Argumentos inválidos; revise: {', '.join(sorted(payload.errors))}.")
    return payload.validated_data
```

**Cada chamada de ferramenta passa por um serializer do DRF antes de virar
consulta** — os mesmos `Serializer` que validam requisição HTTP, inclusive com
validação cruzada (`AvailableRoomsInput.validate` exige saída posterior à
entrada). Saída de modelo é tratada com a mesma ferramenta com que se trata
entrada de usuário.

O detalhe fino está no comentário: **não ecoar o valor inválido**. Devolver
`"status 'CANCELLED' inválido"` faria o modelo reler o próprio erro e tender a
repeti-lo; devolvendo só o nome do campo, ele reconsidera.

E o mecanismo de recuperação:

```python
class ToolError(Exception):
    """Erro que volta ao modelo como resultado, para ele se recuperar sozinho."""

def run(self, name, args) -> dict[str, Any]:
    handler = handlers.get(name)
    if handler is None:
        return {"error": "Ferramenta desconhecida."}
    try:
        return handler(args)
    except ToolError as exc:
        return {"error": str(exc)}
```

**Esta é a distinção mais importante do tratamento de erros da feature:** um
argumento errado **não** é um `502`. Custa uma rodada — o modelo lê
`{"error": ...}`, corrige e refaz, e o atendente não percebe. Há teste
parametrizado com sete formas de argumento inválido, e um com uma função
inventada (`cancel_reservation`): **todos terminam em `200`**.

### 8.4 O recorte de PII

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

**O modelo nunca vê um `Reservation`; ele vê um serializer que é uma lista
explícita de campos.** `document` e `phone` não estão lá — e não por omissão, por
design: campos declarados são *allowlist*, então **adicionar uma coluna ao model
não a vaza** para o provedor. Um `ModelSerializer` com `exclude` seria
*denylist*, e o próximo campo sensível vazaria em silêncio.

A política se sustenta no outro caminho também: `preview_checkout` devolve
`StatementSerializer`, cujo campo `guest` é `GuestMinimalSerializer` —
`fields = ["id", "full_name"]`. Documento e telefone não saem por nenhum dos dois.

Mais três controles: `MAX_ROWS = 10` limita quantas linhas saem, `"store":
False` pede que o provedor não retenha a conversa, e há teste com
`caplog.at_level(DEBUG)` provando que **nem** o nome, **nem** o documento, **nem**
a pergunta, **nem** a chave aparecem em log — inclusive no caminho de falha.

---

## 9. `answer` como função terminal: saída estruturada por construção

`answer` é declarada como ferramenta, mas **não tem handler** — não está no dict
de `handlers`. Ela é o `terminal` do `converse()`: quando o modelo a chama, o
laço para e devolve os argumentos dela.

```python
_tool(ANSWER, "Entrega a resposta ao atendente e encerra o atendimento...", {
    "reply":          {"type": "string", ...},
    "action_type":    {"type": "string", "enum": ["none", "check_in", "checkout"], ...},
    "reservation_id": {"type": "integer", ...},
})
```

**Por que isso importa.** A alternativa comum é pedir "responda em JSON" e fazer
parse do texto: regex, `json.loads` num bloco de markdown, retentativa quando
vem prosa em volta. Usando uma *function call* como saída, **a estrutura é
garantida pela API** — o modelo preenche um schema, não escreve JSON. Nenhum
JSON é garimpado de dentro de prosa.

E ainda passa por um serializer:

```python
payload = AnswerInput(data=raw)
if not payload.is_valid():
    raise AiUpstreamError

return {
    "reply": payload.validated_data["reply"],
    "proposed_action": session.resolve_action(payload.validated_data),
}
```

Aqui, sim, inválido é `502` — porque `answer` é a última palavra e não há rodada
seguinte para o modelo corrigir. Estão na tabela de `502`: `answer` sem `reply`,
`action_type` fora do enum, `reservation_id` que não é número, `arguments` que
não é JSON válido.

---

## 10. O guarda de identidade

O cenário que motiva tudo: dois hóspedes, "João Silva" no 201 e "João Pereira"
no 202, ambos hospedados. O atendente diz *"o João está saindo"*.

O modelo busca "João", recebe **duas** reservas — e ainda assim pode devolver
`action_type: "checkout"` com o id de um deles. Confiar nisso significaria
mostrar um botão "Confirmar checkout" que **fecha a conta da pessoa errada**.

A solução tem três camadas.

**Camada 1 — registrar o que apareceu, e o que apareceu acompanhado:**

```python
def _find(self, args) -> dict[str, Any]:
    data = _validated(FindReservationsInput, args)
    rows = list(selectors.search_stays(status=data["status"], term=data["query"])[:MAX_ROWS])

    ids = {row.pk for row in rows}
    self.seen_ids |= ids
    if len(rows) > 1:
        self.ambiguous_ids |= ids

    return {"total": len(rows), "reservations": ReservationSlice(rows, many=True).data}
```

**Camada 2 — a regra, em duas condições:**

```python
def actionable(self, reservation_id: int) -> bool:
    return reservation_id in self.seen_ids and reservation_id not in self.ambiguous_ids
```

Uma reserva só é acionável se **apareceu** num resultado **e** foi **isolada**
nele. Duas condições, duas classes de falha:

| Condição | Mata |
| --- | --- |
| `in seen_ids` | **Id inventado.** O modelo não propõe ação sobre reserva que nunca viu — o mesmo raciocínio de um guard contra IDOR, aplicado ao modelo |
| `not in ambiguous_ids` | **O modelo desempatar homônimos.** Duas reservas no mesmo resultado travam as duas |

E o detalhe mais sutil do arquivo está no docstring da classe:

> *"Id que apareceu ao lado de outra reserva fica travado pelo resto da request
> mesmo que o modelo afunile sozinho depois: aí quem escolheu foi ele."*

`ambiguous_ids` **nunca é limpo**. Se o modelo busca "João" (dois resultados),
depois busca `"#201"` (um resultado) e propõe a ação, o botão **ainda** é negado
— porque quem desempatou foi o modelo, não o atendente, que precisa reformular.
Há teste para exatamente essa sequência de três rodadas.

O mesmo guarda protege o `preview_checkout` — ali como `ToolError`, para o
modelo buscar melhor em vez de tomar erro.

**Camada 3 — releitura do banco antes de devolver a ação:**

```python
def resolve_action(self, data) -> dict[str, Any] | None:
    action_type = data["action_type"]
    if action_type == "none" or not self.actionable(data["reservation_id"]):
        return None

    reservation = selectors.reservation_queryset().filter(pk=data["reservation_id"]).first()
    # Relê o status: um check-in concorrente derruba a ação em vez de
    # oferecer um botão que já vai falhar.
    if reservation is None or reservation.status != ACTION_STATUS[action_type]:
        return None

    return {"type": action_type, "reservation_id": reservation.pk,
            "guest_name": reservation.guest.full_name}
```

Entre a busca e a resposta passaram segundos, e outro atendente pode ter feito o
check-in. `ACTION_STATUS` exige `PENDING` para `check_in` e `CHECKED_IN` para
`checkout`. Sem isso, o botão apareceria e falharia com `409` no clique.

Repare também que `guest_name` vem **do banco**, não do que o modelo escreveu: o
texto é do modelo, a identidade é do banco.

**E o fio condutor:** ação negada nunca derruba a resposta. `proposed_action`
vira `None` e o `reply` continua sendo entregue — o texto foi construído com
dados reais e continua útil. Degradação graciosa, não erro.

---

## 11. A taxonomia de erros

Três níveis, e a distinção é deliberada:

| Nível | Classe | Destino | Efeito |
| --- | --- | --- | --- |
| Recuperável pelo modelo | `ToolError` | Volta como `{"error": ...}` na conversa | Custa 1 rodada, **`200`** |
| Feature desligada | `AiDisabledError` | HTTP | **`503`** `AI_DISABLED` |
| Provedor inutilizável | `AiUpstreamError` | HTTP | **`502`** `AI_UPSTREAM_ERROR` |

[`ai/exceptions.py`](../../backend/ai/exceptions.py) tem 17 linhas porque cada erro
herda de `ApiError` e só declara três atributos:

```python
class AiUpstreamError(ApiError):
    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "AI_UPSTREAM_ERROR"
    default_detail = "O provedor de IA não devolveu uma resposta utilizável."
```

E o `EXCEPTION_HANDLER` global (`core/exceptions.py`) transforma isso no mesmo
envelope de **toda** a API:

```json
{ "code": "AI_UPSTREAM_ERROR", "detail": "...", "extra": {} }
```

A Íris não inventou formato de erro próprio: o frontend trata erro dela com o
mesmo código com que trata erro de qualquer endpoint. E as dezesseis formas de
falha do provedor colapsam num **único** envelope genérico — o que também é
medida de segurança: mensagem interna do upstream não vaza para o cliente.

`502` é a escolha semanticamente correta: *bad gateway* — nós somos o gateway e
o upstream falhou. Não é `500` (não é bug nosso) nem `400` (a requisição do
atendente estava boa).

---

## 12. O frontend: o contrato espelhado

**1 · O contrato, em Zod** — [`features/ai/schemas.ts`](../../frontend/src/features/ai/schemas.ts):

```ts
export const proposedActionSchema = z.object({
  type: z.enum(['check_in', 'checkout']),
  reservation_id: z.number().int(),
  guest_name: z.string(),
})

export const copilotReplySchema = z.object({
  reply: z.string(),
  proposed_action: proposedActionSchema.nullable(),
})
```

Espelho exato do `CopilotReplySerializer`. E os tipos TypeScript são
**derivados** dele via `z.infer` em [`types.ts`](../../frontend/src/features/ai/types.ts)
— uma fonte de verdade, não um schema mais uma interface para manter em sincronia.

**2 · Validação em runtime** — [`features/ai/api.ts`](../../frontend/src/features/ai/api.ts):

```ts
export async function askCopilot(message: string): Promise<CopilotReply> {
  const response = await apiClient.post<unknown>('/ai/copilot/', { message })
  return parseResponse(copilotReplySchema, response)
}
```

`<unknown>`, não `<CopilotReply>`: o tipo vem do `parseResponse`, **depois** da
validação. Confiar num `as` sobre a resposta da rede é mentir para o compilador.

**3 · Os hooks** — [`features/ai/hooks.ts`](../../frontend/src/features/ai/hooks.ts):

```ts
export function useAiStatus() {
  return useQuery({
    queryKey: aiKeys.status,
    queryFn: fetchAiStatus,
    staleTime: Infinity,
    // A Íris é opcional: o portão indisponível não derruba a página com ela.
    throwOnError: false,
  })
}

export function useCopilot() {
  return useMutation({ mutationFn: (message: string) => askCopilot(message) })
}
```

`useQuery` para o status (`staleTime: Infinity` — a chave não muda em runtime) e
`useMutation` para a pergunta (é `POST`, não é cacheável). O `throwOnError:
false` é o lado cliente do portão: `/ai/status/` falhando mostra "desligada" em
vez de estourar no Error Boundary.

**4 · A página** — [`pages/IrisPage/IrisPage.tsx`](../../frontend/src/pages/IrisPage/IrisPage.tsx):

```tsx
const enabled = status.data?.enabled === true
const answer = ask.data
const action = done === null ? (answer?.proposed_action ?? null) : null
```

`=== true` explícito, porque `undefined` durante o carregamento não é "ligada"; e
`action` só existe enquanto `done === null` — depois de executar, o botão dá
lugar ao texto de confirmação e não há como clicar duas vezes.

**5 · A ação** — [`pages/IrisPage/IrisAction.tsx`](../../frontend/src/pages/IrisPage/IrisAction.tsx),
onde o argumento fecha:

```tsx
const flow = useCheckInFlow({ reservationId, guestName, onSuccess: ... })
const checkOut = useCheckOut({ onSuccess: (statement) => { ... } })
```

**O botão da Íris chama exatamente os mesmos hooks que a página de reservas
usa.** `useCheckInFlow` e `useCheckOut` não foram escritos para a IA — são da
recepção. Daí decorre que:

- o `409 EARLY_CHECKIN` ainda abre o `EarlyCheckinDialog` de confirmação;
- o checkout ainda abre o `CheckoutStatementDialog`, com o extrato e o pagamento;
- invalidação de cache, toasts e tratamento de erro são os mesmos.

Não existe "endpoint de IA que grava". A Íris descobre e propõe; a escrita passa
pelo caminho auditado de sempre, com `select_for_update`, locks e transações.

---

## 13. Como isso é testado sem nunca chamar o provedor

[`tests/api/test_ai.py`](../../backend/tests/api/test_ai.py) tem 829 linhas e
**zero** chamadas de rede. A técnica é um dublê do transporte:

```python
@pytest.fixture
def calls(monkeypatch) -> CallLog:
    """Dublê do transporte: registra a chamada e devolve o que o caso enfileirou.

    A fila é estrita — chamada sem resposta enfileirada é erro de teste, não uma
    rodada extra silenciosa.
    """
```

O dublê faz duas coisas: **grava** a chamada, para o teste assertar o payload
exato, e devolve o que o caso enfileirou. A fila estrita é o detalhe caro — se o
código fizer uma rodada extra não prevista, o teste **falha** em vez de seguir em
silêncio.

Isso viabiliza testes impossíveis contra a API real:

| Teste | O que prova |
| --- | --- |
| payload do contrato | URL, headers, `store: False`, `tool_choice`, `max_output_tokens`, a **ordem** das cinco ferramentas e a frase do relógio dentro de `instructions` |
| modo estrito | Todas as ferramentas com `required == list(properties)` e `additionalProperties: False` |
| sequências multi-rodada | Enfileira `MAX_ROUNDS` buscas e assere o `502`; e a forçada de `answer` na última rodada |
| relógio monotônico substituído | A sequência de timeouts `[10.0, 10.0, 7.0, 3.0]` |
| 16 formas de falha do provedor | Uma tabela parametrizada, todas provando o **mesmo** envelope de `502` |
| 7 formas de argumento inválido | Todas terminando em `200`, com `{"error": ...}` na conversa |
| ambiguidade e id inventado | `proposed_action is None` com o `reply` preservado |
| ausência de log | Nem nome, nem documento, nem pergunta, nem chave em `caplog` |

E dois testes protegem a própria suíte:

```python
def test_the_suite_cannot_reach_the_network():
    with pytest.raises(AssertionError, match="chamada HTTP de saida"):
        httpx.post(ai_client.RESPONSES_URL, json={})

def test_a_test_never_sees_the_real_provider_key(settings):
    assert settings.OPENAI_API_KEY == ""
```

O primeiro prova que a rede está bloqueada — nenhum teste pode acidentalmente
gastar dinheiro. O segundo, que a chave real nunca está visível em teste.
**Testar a barreira, não só confiar nela.**

---

## 14. Removível por construção, e o CI cobra

Contratos do **import-linter** em [`backend/pyproject.toml`](../../backend/pyproject.toml):

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

Duas direções, ambas verificadas no CI:

- **ninguém do domínio importa `ai`** → deletar a pasta não quebra nada;
- **`ai` só toca o domínio por `hotel.reservations`** → uma única superfície de
  contato, não quatro. O `allow_indirect_imports = true` está lá porque a
  *cadeia* `ai.tools → reservations.services → billing.engine` é legítima; o que
  é proibido é o import **direto**.

Some a isso: o pacote não entra em `INSTALLED_APPS` (não tem models nem
migrações) e nada do resto do frontend importa `features/ai/`.

**"É removível" deixa de ser promessa em prosa e passa a ser regra que quebra o
build.**

---

## Resumo de 90 segundos

A Íris é um copiloto de *tool use*: o modelo não recebe o banco nem escreve SQL —
ele **pede** uma de quatro consultas de leitura, e o Django as executa pelos
mesmos selectors e serviços que as telas usam. A resposta termina numa função
`answer`, então a saída é estruturada por construção, sem parse de JSON dentro de
prosa.

Saída de modelo é tratada como **entrada não confiável**, em três frentes: cada
argumento passa por um serializer do DRF, e erro volta ao modelo como resultado —
custa uma rodada, não um `502`; um botão de ação só aparece se a reserva
**apareceu** num resultado e foi **isolada** nele, e id que apareceu ao lado de
outro fica travado pelo resto da requisição; e o status é relido do banco antes
de devolver a ação, para um check-in concorrente derrubar o botão em vez de
oferecer um clique que já falharia.

O laço tem três tetos diferentes — 10 s por chamada, 15 s de orçamento global e
sete rodadas — e na última rodada o `tool_choice` força `answer`, então um modelo
em laço termina em resposta, não em erro. **A IA não grava nada:** o clique passa
pelos endpoints de sempre, com os mesmos locks e diálogos.

E a feature é opcional por construção: sem `OPENAI_API_KEY` ela se desliga e o
produto segue 100% funcional. O import-linter cobra no CI que nenhum app do
domínio importe `ai/` — "é removível" é uma regra que quebra o build, não uma
promessa em prosa.

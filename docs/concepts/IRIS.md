# Íris: o copiloto do hotel

> Feature **opcional e desacoplada**: sem `OPENAI_API_KEY` ela fica desligada e
> o resto do sistema não muda em nada.
>
> Este documento é **o que** a Íris faz. Para **como** ela foi feita (o caminho
> do código, arquivo por arquivo, na ordem em que uma requisição acontece),
> veja [`IRIS-CODE.md`](../code/IRIS-CODE.md).

A Íris tem uma página própria (`/iris`, primeiro item de OPERAÇÃO). O atendente
pergunta em linguagem natural ("a Ana Souza chegou", "alguém passou do horário
de checkout?", "quanto faturamos até agora?") e recebe um texto curto e, quando
há uma ação clara, **um** botão.

O que a torna diferente de um chat colado no produto é quem faz as consultas. O
modelo não recebe o banco: ele **pede** uma consulta por vez, e o Django a
executa pelos mesmos selectors e serviços que as telas usam. São quatro
leituras, e nenhuma escrita:

| Ferramenta          | O que devolve                                                                    |
| ------------------- | -------------------------------------------------------------------------------- |
| `find_reservations` | Reservas de um status, achadas por titular, **acompanhante**, quarto ou nº        |
| `preview_checkout`  | O extrato que sairia agora (diárias, vaga, multa, total), sem gravar nada        |
| `available_rooms`   | Quartos livres num período, com a capacidade de cada um                          |
| `revenue_summary`   | Faturamento das estadias encerradas: fechado, recebido, multas (hoje / mês / tudo)|

A resposta termina numa função `answer`, então a saída é **estruturada por
construção**: nenhum JSON é garimpado de dentro de prosa. Se a pergunta tem uma
ação, ela vem em `proposed_action` e o clique passa pelos endpoints de check-in e
de checkout de sempre: o `409 EARLY_CHECKIN` ainda abre o diálogo de confirmação,
e o checkout ainda mostra o extrato com os mesmos números. **A IA não grava
nada** (*human-in-the-loop*).

> ⚠️ **Aviso de envio a provedor externo.** Com a chave configurada, saem para
> a OpenAI (`https://api.openai.com/v1/responses`) os **nomes** (titular e
> acompanhantes), quartos, datas, o extrato projetado e os agregados de
> faturamento. **Documento e telefone nunca saem**: o recorte que vai para o
> provedor não tem esses campos. Nada do conteúdo é registrado em log, e o
> request pede `store: false`: a conversa não fica retida do lado do provedor.
> Esta é a única saída de dados do sistema para fora da sua infraestrutura, e
> ela só existe se você configurar a chave. Se isso não for aceitável no seu
> contexto, deixe a variável vazia: a aplicação inteira continua funcionando e
> a página diz que a Íris está desligada.

Como ligar:

```bash
# 1. crie a chave em platform.openai.com (a conta precisa de crédito)
# 2. confira os limites de taxa da sua conta antes de uma demonstração ao vivo:
#    uma pergunta gasta de 2 a 7 chamadas
# 3. no .env
OPENAI_API_KEY=...
# opcional
OPENAI_MODEL=gpt-4.1-nano

docker compose up -d --build backend
```

Para conferir que a chave pegou, sem abrir o navegador (é a única forma de exercitar
o provedor, pois **nenhum teste automatizado chama a API**; ver [`QUALITY.md`](QUALITY.md)):

```bash
docker compose exec -T backend uv run python manage.py shell -c "
from django.utils import timezone; from ai.copilot import answer
print(answer('Quem ainda está no hotel?', now=timezone.now()))"
```

Portão de fallback (a parte que interessa em revisão):

| Estado | `GET /api/ai/status/` | `POST /api/ai/copilot/` | Frontend |
|---|---|---|---|
| Sem chave | `{"enabled": false}` | `503 AI_DISABLED` | a página diz que a Íris está desligada |
| Com chave | `{"enabled": true}` | `200 {reply, proposed_action}` | resposta e, quando houver, o botão da ação |
| Com chave, provedor falhando | `{"enabled": true}` | `502 AI_UPSTREAM_ERROR` | aviso em toast; o resto do produto intacto |

Saída de modelo é **input não confiável**, e em três frentes:

- **argumentos**: cada chamada de ferramenta passa por um serializer antes de
  virar consulta. Onde o modelo costuma omitir um campo, o serializer é
  tolerante: um argumento faltante custa uma rodada com `{"error": …}`, que o
  modelo lê e corrige, nunca um `502`;
- **identidade**: um botão só aparece se a reserva **apareceu** num resultado e
  foi **isolada** nele. Um id que já apareceu ao lado de outro fica travado pelo
  resto da requisição, mesmo que o modelo afunile sozinho depois. Nesse caso
  quem escolheu foi ele, não o atendente. Id inventado derruba o botão, não a
  resposta: o texto foi construído com dados reais e continua valendo;
- **status**: antes de devolver a ação, o servidor relê a reserva. Um check-in
  concorrente entre a busca e a resposta zera a ação em vez de oferecer um botão
  que já falharia.

Tudo isso dentro de um orçamento global de **15 s** para o laço inteiro e de
**sete rodadas** no máximo (`BUDGET_SECONDS` e `MAX_ROUNDS` em `ai/config.py`);
cada timeout é encurtado para o que resta do orçamento, e na última rodada o
`tool_choice` força `answer`. Um modelo que fica repetindo consultas termina
em resposta, não em 502. Com folga sobre o timeout de 30 s do worker: no pior
caso o atendente vê um toast, nunca um worker morto.

O app é **removível por construção**: o núcleo do sistema não sabe que ele
existe. `ai/` importa só `hotel.reservations` e `core/` (e o import-linter cobra
isso: `ai` não pode tocar `billing`, `rooms` ou `guests` direto), nenhum app de
`hotel/` importa `ai/`, o pacote não entra em `INSTALLED_APPS` (não tem models
nem migrações) e nada no resto do frontend importa `features/ai/`. A feature
inteira cabe em:

- `backend/ai/` e `backend/tests/api/test_ai.py`;
- uma linha de rota em `backend/config/urls.py` e o quarto contrato em
  `backend/pyproject.toml`;
- `frontend/src/features/ai/` e `frontend/src/pages/IrisPage/` (com seus testes);
- a rota `iris` em `lib/routing/routes.ts`, a linha do lazy em `app/router.tsx`
  e o item de menu em `AppLayout.tsx`;
- a dependência `httpx` no `backend/pyproject.toml`.

O `useCheckInFlow` fica: ele é refatoração da recepção, não da Íris, e a página
de reservas o usa.

**Roteiro da demonstração** (com o seed, `docker compose down -v` antes):
"a Ana Souza chegou" → o texto cita o horário de abertura e oferece o check-in;
"o Bruno quer sair agora" → os valores do extrato projetado e o botão de
checkout; "quem ainda está no hotel?" → a lista, sem botão; "a Eva chegou" → a
estadia do Bruno, achada pelo nome da acompanhante; "quais quartos estão
livres?"; "quanto faturamos até agora?". Aqueça com uma pergunta antes de
apresentar: a primeira chamada do dia é mais lenta.



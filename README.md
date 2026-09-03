# Gestão de Hóspedes de Hotel

Sistema de recepção para o balcão: cadastro de hóspedes, reservas, localização
por nome/documento/telefone, check-in com alerta antes das 14h, checkout com
extrato detalhado (diária a diária, taxa de vaga e multa de saída após as 12h).

**Stack:** Python 3.13 · Django 5.2 LTS · DRF · PostgreSQL 17 · React 18 · Vite ·
TypeScript · Tailwind · `uv` · Docker Compose.

Princípio de projeto: **escopo mínimo do briefing, executado com acabamento
sênior.** Nada entra sem contrato documentado e sem teste que o comprove — e o
que o briefing não pede fica de fora de propósito (§ [8](#8-escopo-deliberadamente-fora)).

| | |
|---|---|
| Aplicação | <http://localhost:5173> |
| API | <http://localhost:8000/api/> |
| Swagger (contrato navegável) | <http://localhost:8000/api/docs/> |
| Admin do Django | <http://localhost:8000/admin/> |
| Credenciais do seed | `atendente` / `atendente123` · `admin` / `admin123` |
| Atenção | O esquema mudou (quarto obrigatório, nacionalidade obrigatória): rode `docker compose down -v` antes de subir sobre um volume antigo. |

**Índice**

1. [Quickstart com Docker (caminho canônico)](#1-quickstart-com-docker-caminho-canônico)
2. [Execução sem Docker completo (caminho híbrido)](#2-execução-sem-docker-completo-caminho-híbrido)
3. [Verificação: as suítes de teste](#3-verificação-as-suítes-de-teste)
4. [Decisões de interpretação](#4-decisões-de-interpretação)
5. [Chaves, variáveis de ambiente e privacidade](#5-chaves-variáveis-de-ambiente-e-privacidade)
6. [Mapa da API](#6-mapa-da-api)
7. [Arquitetura em uma página](#7-arquitetura-em-uma-página)
8. [Escopo deliberadamente fora](#8-escopo-deliberadamente-fora)
9. [Ferramentas de desenvolvimento](#9-ferramentas-de-desenvolvimento)

---

## 1. Quickstart com Docker (caminho canônico)

Pré-requisitos: **Docker** com o plugin **Compose v2** (`docker compose`, sem
hífen) e `git`. Nem Python, nem Node, nem PostgreSQL na máquina — só a geração
das chaves usa um `python3` local, e há alternativa em container para quem não
o tem.

### 1.1 Passo a passo

```bash
# 1. clonar
git clone https://github.com/felipemalli/hotel-management.git
cd hotel-management

# 2. criar o .env a partir do exemplo documentado
cp .env.example .env

# 3. gerar a SECRET_KEY (uma linha, sem espaços)
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

Cole o valor em `SECRET_KEY` no `.env`. Sem `python3` na máquina, gere dentro
da própria imagem do backend:

```bash
docker compose build backend
docker compose run --rm --no-deps backend uv run python -c "import secrets; print(secrets.token_urlsafe(50))"
```

> **Se a porta 5432 já estiver ocupada** na sua máquina (um PostgreSQL local,
> por exemplo), ajuste no `.env` **as duas** variáveis de porta antes de subir:
> `DB_PORT_HOST=5433` (porta publicada no host) e `DB_PORT=5433` (usada apenas
> fora do Compose — dentro dele o backend fala com `db:5432`). Ver a matriz da
> seção [5.2](#52-matriz-de-variáveis-de-ambiente).

```bash
# 4. subir tudo
docker compose up --build
```

O que acontece nessa ordem, sem nenhum script `.sh` no repositório (a cadeia
vive no próprio `docker-compose.yml`): o `db` sobe e fica `healthy`; o backend
roda `migrate`, `collectstatic` e `seed_demo`, e só então sobe o `gunicorn`; o
frontend espera o healthcheck do backend e sobe o Vite. Fim da subida, o log do
seed mostra algo assim:

```
Seed de demonstracao aplicado.
Atendente: atendente / atendente123 | Admin: admin / admin123 | hospedes: 4 | reservas: 3
```

As duas contas são credenciais de **demonstração**, e as duas são usuários
comuns: `is_staff=False` nas duas, inclusive na de `admin`. O papel
(`role=ATTENDANT` / `role=ADMIN`) é do produto e decide o acesso às rotas
administrativas da API; `is_staff` decide o acesso ao `/admin/` do Django, que
**não** é caminho de escrita deste domínio (não existe `hotel/admin.py`).
Confundir os dois daria ao administrador do hotel uma porta que grava na base
sem passar por nenhuma regra. Para o `/admin/`, rode `createsuperuser`.
`GET /api/auth/me/` devolve `{id, username, role}`: é como o frontend sabe se
deve oferecer o painel administrativo.

### 1.2 Verificação rápida (o mesmo que o CI faz)

```bash
curl -sf localhost:8000/api/health/            # {"status":"ok"}
curl -sf localhost:8000/api/docs/  >/dev/null  # Swagger UI
curl -sf localhost:5173            >/dev/null  # app
```

### 1.3 Dados de demonstração

O seed é **idempotente** e usa **datas relativas** — não há literal de data no
código, então o cenário é válido em qualquer dia em que você rodar. Ele nunca
escreve `status` na mão: as transições passam pelos mesmos *services* que a API
usa, com o relógio injetado.

| Hóspede | Situação | Serve para demonstrar |
|---|---|---|
| **Ana Souza** | Reserva `PENDING` com entrada **hoje**, com veículo | aba "Check-in pendente" e o fluxo de check-in |
| **Bruno Lima** | `CHECKED_IN` (check-in ontem às 15:00) | aba "No hotel" e o fluxo de checkout |
| **Carla Nunes** | `CHECKED_OUT` — sexta→domingo passados, com vaga, saída 12:01 | extrato com diária de fim de semana (R$ 180,00) **e** multa de R$ 90,00 |
| **Davi Rocha** | Sem reserva | busca por nome, documento e telefone |

### 1.4 Fluxo de demonstração (≈ 5 minutos)

1. Abra <http://localhost:5173> e entre com **`atendente` / `atendente123`**.
2. **Aba "Todos" — localizar (RF3).** Digite `ana` na busca: o nome acha por
   fragmento. Agora `789` e depois `123.456.789-01`: os dois acham a
   mesma Ana Souza — documento e telefone estão em claro, já normalizados, e a
   busca é por fragmento em qualquer formatação. O mesmo vale para `98888`.
   Na tabela, CPF e telefone aparecem formatados pelo frontend.
3. **Cadastrar (RF1).** "Novo hóspede" → nome, documento e telefone → cadastrar.
   O formulário abre em seguida a criação da reserva desse hóspede (RF2): a
   entrada não pode ser no passado e o mínimo é 1 noite.
4. **Check-in (RF6, RN4).** Aba "Check-in pendente" → linha da Ana Souza →
   "Check-in". Antes das 14h locais, a API responde `409 EARLY_CHECKIN` e a
   aplicação abre o alerta com a hora do servidor ("São 13:45 — o check-in abre
   às 14:00. Confirmar mesmo assim?"); confirmar reenvia com `allow_early:
   true` e efetiva. A partir das 14h, o check-in é direto. O briefing pede
   *alerta*, não bloqueio (D4).
5. **Checkout com extrato (RF7, RN5, RN6).** Aba "No hotel" → linha do Bruno
   Lima → "Checkout". Abre o extrato: uma linha por diária (data, dia da
   semana, diária, vaga), subtotais, a linha de multa **apenas** se houve saída
   após as 12h, e o total em destaque. Os totais ficam congelados na reserva na
   mesma transação — um segundo checkout responde `409 INVALID_STATUS`.
6. **Contrato navegável.** Abra <http://localhost:8000/api/docs/>: todos os
   endpoints da seção [6](#6-mapa-da-api), com exemplos de request, de resposta
   e dos erros de cada rota.

Para derrubar tudo: `docker compose down` (some com os containers) ou
`docker compose down -v` (some também com o volume do banco).

---

## 2. Execução sem Docker completo (caminho híbrido)

O briefing pede os procedimentos "**dos projetos**" — lido aqui como *dos dois
projetos* (backend e frontend), e não como *vários métodos de execução*. O
Compose cobre os dois em um comando, e é o caminho canônico da seção 1.

Ainda assim, documenta-se o caminho híbrido por resiliência: se o Docker do
avaliador não colaborar com a build das imagens, o banco em container e as duas
aplicações nativas resolvem. Pré-requisitos extras: **Python 3.12+** com
[`uv`](https://docs.astral.sh/uv/) e **Node 24**, a mesma versão da imagem do
frontend e do CI — é a única em que este caminho foi de fato exercitado.

```bash
# 0. o .env da seção 1 já preenchido; para o caminho híbrido, DB_PORT deve valer
#    o mesmo que DB_PORT_HOST (fora do Compose fala-se com a porta publicada).

# 1. só o banco em container
docker compose up -d db

# 2. backend nativo (novo terminal, na raiz do repositório)
cd backend
set -a && . ../.env && set +a   # o Django lê variáveis do ambiente, não do .env
uv sync
uv run python manage.py migrate
uv run python manage.py createcachetable          # tabela do cache: sem ela o login responde 500
uv run python manage.py collectstatic --noinput   # CSS do /admin/ e do Swagger com DEBUG=0
uv run python manage.py seed_demo
uv run python manage.py runserver 0.0.0.0:8000

# 3. frontend nativo (outro terminal, na raiz do repositório)
cd frontend
npm ci
npm run dev
```

Aplicação em <http://localhost:5173>, API em <http://localhost:8000>. O Vite faz
proxy de `/api` para `http://localhost:8000` (é o default fora do Compose; dentro
dele, `VITE_API_PROXY_TARGET=http://backend:8000`) — por isso **não existe CORS
neste projeto**: no browser, tudo é a mesma origem.

Três notas honestas sobre esse caminho:

- `DB_HOST=localhost` é o default do `settings.py` justamente para ele; é o
  Compose que injeta `DB_HOST=db`.
- o `collectstatic` está na lista pelo mesmo motivo que está na cadeia do
  Compose: com `DEBUG=0`, quem serve estático é o WhiteNoise a partir do
  `STATIC_ROOT`, e ele monta o índice dos arquivos **na subida**. Sem esse
  passo (ou rodando-o com o servidor já no ar), `/admin/` e `/api/docs/`
  respondem 200 mas sem CSS.
- `runserver` é servidor de desenvolvimento, sem gunicorn: o runtime
  **entregue e testado** é o da seção 1.

---

## 3. Verificação: as suítes de teste

Retrato de 03/09/2026: **191 testes de backend** (unitários puros do motor
financeiro, testes de banco com PostgreSQL real e testes de API ponta a ponta) e
**174 testes de frontend** em 32 arquivos. O número sobe conforme testes entram —
os comandos abaixo é que valem como verdade, não a contagem.

```bash
# backend — comando canônico, com o piso de cobertura
docker compose exec backend uv run pytest --cov=hotel --cov=accounts --cov-fail-under=85 -q

# frontend — o script único, na mesma ordem em que o CI o executa passo a passo
cd frontend && npm run check
```

`npm run check` é `typecheck && lint && format:check && test:coverage && build`.
Os cinco também rodam soltos quando você quer só um (`npm run lint`,
`npm run test -- --run`, `npm run format` para corrigir a formatação em vez de
apenas conferi-la).

Sem a stack de pé, o mesmo pelo caminho híbrido: `cd backend && uv run pytest -q`
(precisa do `db` no ar e das variáveis exportadas, como na seção 2).

Duas garantias que valem mencionar porque são incomuns:

- **A tabela de casos numéricos é a fonte da verdade, e é replicada 1:1** em
  `backend/tests/unit/test_pricing.py` (9 casos parametrizados, incluindo as
  fronteiras 11:59 / 12:00:00 / 12:01 e o day-use) e em
  `frontend/src/features/reservations/__fixtures__/bills.ts` (render do
  extrato). Divergência entre backend, frontend e tabela quebra a suíte.
- **Nenhum teste toca a rede.** A feature de IA da seção 5.4 é testada com o
  cliente HTTP dublado; o caminho sem chave é testado de verdade.

O CI (`.github/workflows/ci.yml`) roda os dois jobs em `ubuntu-latest` a partir
do checkout — que é, por construção, a simulação contínua do clone limpo do
avaliador. Cada verificação é um passo nomeado, para que a falha aponte o
culpado sem abrir o log; duas delas são guardas de texto, uma por lado, contra
dinheiro em ponto flutuante:

```bash
# backend: nada em hotel/ ou accounts/ constrói um float
! grep -RnE "float\(" backend/hotel backend/accounts

# frontend: o módulo que formata dinheiro e o extrato não convertem para número
! grep -RnE "Number\(|parseFloat|parseInt|toLocaleString|Intl\.NumberFormat" \
    src/lib/money.ts src/features/reservations/CheckoutStatementDialog.tsx
```

---

## 4. Decisões de interpretação

O briefing tem ambiguidades reais — como contar diárias, qual tarifa aplica em
cada uma, o que exatamente acontece às 12h00min em ponto. Esta seção é o
registro de **como cada uma foi resolvida e por quê**, incluindo a leitura
alternativa que foi rejeitada e o caso concreto em que as duas divergem. As
decisões são normativas: todo código e todo teste deriva delas, e cada linha
carrega um identificador `Dx` para ser citável em revisão.

> Leitura das referências: `§x.y` aponta para a especificação técnica interna do
> projeto (documento de orquestração, não versionado); `Tn` são os casos da
> tabela de casos numéricos, replicada em
> `backend/tests/unit/test_pricing.py` e em
> `frontend/src/features/reservations/__fixtures__/bills.ts`;
> `RFn` / `RNn` são os requisitos funcionais e de negócio do briefing.

### 4.1 Decisões que resolvem ambiguidades do briefing

Estas decisões são **normativas**. Todo código e teste deriva delas.

| ID | Ambiguidade | Decisão |
|----|-------------|---------|
| D1 | Como contar diárias? | Uma diária por **data** no intervalo `[data(check-in), data(checkout))`. Se o intervalo for vazio (day-use), cobra-se **mínimo de 1 diária** (a do dia do check-in). |
| D2 | Qual tarifa aplica em cada diária? | A do dia da semana **da própria data da diária**. Sex→Seg = sex 120 + sáb 180 + dom 180. |
| D3 | Multa de checkout tardio | Incide se `hora local do checkout > 12:00:00`. **Exatamente 12:00:00 é isento.** Base = 50% da tarifa da diária correspondente ao **dia da saída** (útil 60,00 / fds 90,00). Independe de vaga. |
| D4 | Check-in antes das 14h | Permitido se `hora local >= 14:00:00`. Antes disso a API responde `409 EARLY_CHECKIN` (alerta). O atendente pode **confirmar mesmo assim** reenviando com `allow_early: true` — o briefing pede *alerta*, não bloqueio. |
| D5 | Busca parcial em documento/telefone | `documento` e `telefone` em claro, **já normalizados** (D9). Busca **parcial** (trigram/`icontains`) nos três campos: nome, documento e telefone. Cifra em repouso foi rejeitada — custa o `LIKE` e o negócio não a usa. |
| D6 | Cobrança usa datas agendadas ou reais? | **Reais** (`checked_in_at` / `checked_out_at`). Datas agendadas servem à reserva e às listagens; o dinheiro segue o fato. |
| D7 | Check-in fora da data agendada | Não validamos correspondência com a data agendada (fora de escopo). D6 garante que a cobrança permanece correta. |
| D8 | Cancelamento | Enum inclui `CANCELLED`; transição `PENDING → CANCELLED` exposta via endpoint. Nenhum outro estado cancela. |
| D9 | Documento sem dígito / passaporte / telefone internacional | Normalização de **armazenamento** é **por tipo**: documento = alfanumérico maiúsculo (`re.sub(r"[^A-Z0-9]", "", v.upper())`), telefone = dígitos **E.164 sem o `+`** (`5521988887777`). A coluna guarda o valor normalizado; a máscara digitada não persiste. Validação: documento ≥ 4 alfanuméricos; telefone **exige o `+` e o código do país na entrada**, validado por `phonenumberslite` (`is_valid_number`). A presença do DDI é garantida na **entrada** — o `+` não persiste e o banco não distingue. Nacionalidade obrigatória em ISO 3166-1 alpha-2. |
| D10 | Vaga no dia da saída em checkout tardio | **Não** se cobra vaga do dia de saída: a taxa de vaga acompanha as diárias (intervalo semiaberto de D1) e a única consequência do atraso é a multa de D3 — o briefing enumera a penalidade de forma exaustiva. |
| D11 | Reserva com data no passado | Criação exige `checkin_date >= data local de hoje` (`400 VALIDATION_ERROR`). O passado entra no sistema pelos fatos (check-in/checkout reais), nunca pelo agendamento. |
| D12 | Hóspede duplicado | `document` é único (`409 DUPLICATE_DOCUMENT` no segundo cadastro). Como a coluna já está normalizada (D9), a unicidade é tolerante a máscara. Telefone **não** é único (familiares compartilham). |
| D13 | Day-use agendado | Agendamento exige mínimo de 1 noite (constraint §1.5 mantida). Day-use existe apenas como **fato** (check-in e checkout reais no mesmo dia — T9), coberto por D1. |
| D14 | Reserva PENDING vencida | Continua listada em `pending-checkin` até ação do atendente (check-in ou cancelamento). O sistema não muda estado sem gesto humano. |
| D16 | Overbooking de quarto | Três camadas: o `EXCLUDE` gist protege a **agenda** (datas que se cruzam), a unique parcial protege o **fato físico** (dois `CHECKED_IN` no mesmo quarto), e overstay e chegada antecipada — que dependem de "hoje" — são guardas de leitura sob lock. |
| D17 | Capacidade do quarto | `capacity` é a única propriedade do quarto que outra regra consome. Lotação total do hotel **não** se guarda: é derivada (`Sum(capacity)` dos ativos) e já imposta por construção. |
| D18 | Pagamento da conta fechada | Pagamento **único e integral**, com forma e ator, registrado depois do checkout. Não é um status: `CHECKED_OUT` continua sendo o estado terminal. Sem pagamento parcial e sem estorno. |
| D15 | Qual política de tarifa rege a estadia | A política **amarrada no check-in** rege tudo: diárias, vaga, fator da multa **e** limite de checkout. Só o horário de abertura do check-in vem da política vigente no ato, porque antecede a amarração. |

### 4.2 Leituras alternativas rejeitadas

Para cada decisão: a leitura alternativa em uma frase testável, um caso concreto onde as duas divergem, e por que a adotada venceu.

**D1 — mínimo de 1 diária.** Alternativa: "cobra-se uma diária por noite dormida; estadia sem pernoite gera zero diárias." Divergência: T9 (seg 03/03 14:00 → 18:00, com vaga) valeria ~R$ 60,00 (só multa) em vez de **R$ 195,00**. Venceu a adotada: quarto ocupado e higienizado tem custo; fatura zero contradiz "total geral da reserva **a ser paga**"; mínimo de 1 diária é praxe hoteleira.

**D2 — tarifa pela data da diária.** Alternativa: "a diária é precificada pelo dia em que a noite termina." Divergência: qui 06/03 15:00 → sáb 08/03 10:00 = qui 120 + sex 120 = **R$ 240,00** (adotada) vs sex 120 + sáb 180 = R$ 300,00 (alternativa). Venceu a adotada: "diárias de segunda à sexta" qualifica o dia em que a diária ocorre, e é assim que tarifa é anunciada em balcão.

**D3 — multa pela tarifa do dia da saída; 12:00:00 isento.** Alternativa: "a multa usa a tarifa da última diária dormida, não a do dia da saída." Divergência: sáb 08/03 14:00 → seg 10/03 12:30 = diárias 360,00 + multa 50%×120 (seg) = **R$ 420,00** (adotada) vs multa 50%×180 (dom) = R$ 450,00. Venceu a adotada: o briefing atrela a variação útil/fds ao **procedimento** de checkout, que ocorre na segunda. Fronteira: "até as 12h00min" lido como inclusivo → 12:00:00 em ponto isento (T8); "até", em pt-BR, inclui o limite.

**D4 — alerta com override (e a defesa do 409).** Alternativa: "antes das 14h o check-in é bloqueado, sem exceção." Divergência: hóspede no balcão às 13:59 → adotada: modal + confirmação = hospedado; alternativa: espera forçada. Venceu a adotada: o briefing manda **permitir** o check-in e **emitir alerta** — alerta não é proibição. Defesa do 409 (devolutiva técnica, três linhas): (1) RFC 9110 define 409 como conflito que o cliente pode resolver **alterando a requisição e reenviando** — exatamente o ciclo `allow_early`; (2) preserva a semântica binária do POST mutador (2xx ⇔ check-in efetivado), sem "200 que não muta"; (3) com o envelope §4.1, `EARLY_CHECKIN` é ramo de protocolo de primeira classe no cliente — e o caminho comum (≥ 14h) segue `200` direto, sem passar por erro.

**D5 — PII em claro + busca parcial nos três campos.** Alternativa: "cifrar documento/telefone em repouso (Fernet) e buscar só por igualdade via blind index." Divergência: buscar `789` acharia a Ana na adotada e devolveria vazio na alternativa. Venceu a adotada: o briefing pede localizar por documento e telefone, o atendente busca por fragmento, e cifra + `LIKE` são objetivos incompatíveis. Criptografia de campo é excesso que o negócio não usa.

**D6 — cobrança pelos fatos.** Alternativa: "a fatura usa as datas agendadas da reserva." Divergência: agendado seg 03 → qua 05 (R$ 240,00); hóspede sai qui 06/03 11:00 → adotada: seg+ter+qua = **R$ 360,00**; alternativa: R$ 240,00 (R$ 120,00 de subfaturamento). Venceu a adotada: dinheiro segue ocupação real; e a simetria protege o hóspede na saída antecipada.

**D7 — check-in fora da data agendada.** Alternativa: "check-in só na data agendada." Divergência: reserva para 05/03, hóspede chega 04/03 15:00 → adotada hospeda (e cobra desde 04, por D6); alternativa exige recriar a reserva. Venceu a adotada: validação não pedida, e D6 blinda o financeiro.

**D8 — cancelamento só de PENDING.** Alternativa: "CHECKED_IN também cancela (estorno)." Divergência: cancelar após uma noite dormida exigiria política de estorno inexistente no briefing. Venceu a adotada: dinheiro monotônico, extrato único.

**D9 — normalização alfanumérica do documento.** Alternativa: "normalizar documento por dígitos." Divergência: passaportes `AB123456` e `CD123456` colidiriam na coluna única → `409 DUPLICATE_DOCUMENT` indevido no segundo. Venceu a adotada: preserva a unicidade real; telefone segue por dígitos porque só a máscara varia.

**D16 — overbooking em três camadas, e por que não dá para ser só uma.** O `EXCLUDE` gist (`resv_room_no_overlap`) impede duas reservas ativas com datas cruzadas no mesmo quarto; `'[)'` deixa passar estadias adjacentes — sai dia 09, entra dia 09 — que é a mesma semântica de D1. Mas ele olha datas **agendadas**, e D6 cobra pelos fatos reais: um hóspede que fica além do `checkout_date` continua `CHECKED_IN` com a agenda já liberada, e nada impediria um segundo `CHECKED_IN` no mesmo quarto. Daí a unique parcial (`resv_one_active_per_room`), que protege o fato físico. Sobram dois casos que **nenhuma constraint pode expressar**, porque dependem de "hoje": (a) oferecer um quarto com overstay na disponibilidade; (b) uma chegada antecipada (D7) tomar um quarto prometido a outra `PENDING`. Esses são guardas de leitura sob lock, com o `today`/`now` que a view já injeta.

**D7 (complemento) — chegar antes continua permitido, salvo se toma o quarto de alguém.** Divergência com caso: a reserva de 09→11 aparece no balcão dia 07 e quer entrar já; existe outra reserva de 07→09 no mesmo quarto. Adotada: `409 ROOM_UNAVAILABLE` com o id da reserva prometida. Alternativa (permitir): o `EXCLUDE` não pega — as datas agendadas 07→09 e 09→11 não se cruzam — e o hóspede das 07 chega a um quarto ocupado.

**D14 (complemento) — a pendência vencida retém o quarto.** Consequência direta de "o sistema não muda estado sem gesto humano": enquanto ninguém cancela nem faz o check-in, o quarto segue reservado. É registrado aqui porque é o custo assumido de não ter no-show automático; a saída é o `cancel`.

**A ordem de lock é `Guest → Room → Reservation`,** por tabela, e dentro de `Guest` por pk crescente. Duas transações que travem as mesmas linhas em ordens diferentes fazem deadlock, e o atendente vê um 500. `create_reservation` não trava nada: a autoridade dela é o `EXCLUDE` sob savepoint, que traduz a corrida no mesmo `409 ROOM_UNAVAILABLE` da guarda.

**D17 — capacidade sim, lotação do hotel não.** `capacity` é a única propriedade do quarto que outra regra consome (titular + acompanhantes ≤ capacidade); sem ela, "reserva com mais pessoas" não tem freio. Lotação total é derivada (`Sum(capacity)` dos ativos) e já imposta por construção pelo anti-overbooking. **Gatilho:** lotação legal (alvará) *menor* que a soma — aí é uma linha de configuração e uma guarda no check-in. Sem preço por quarto, sem `RoomType` e sem foto: a costura para preço é `catalog.rate_table_of`, ponto único, e foto exigiria `MEDIA_ROOT`, volume no compose e Pillow no Dockerfile — não é a coluna que custa.

**D18 — pagamento único e integral, em colunas da reserva.** Alternativa: `ReservationStatus.PAID` como quinto estado, ou uma tabela `Payment` desde já. Divergência: `PAID` obrigaria toda consulta de "estadia encerrada" a olhar dois valores, numa máquina de estados linear que já termina em `CHECKED_OUT` — e pago é um **fato sobre** a reserva encerrada, não um estágio dela. Uma tabela `Payment` 1:1 duplicaria os quatro totais e o ator, ou obrigaria a movê-los. Adotada: três colunas (`paid_at`, `payment_method`, `paid_by`) que nascem e morrem juntas, guardadas pela CHECK `resv_payment_complete` — meio pagamento gravado seria um recibo que não se sustenta. Pagar duas vezes responde `409 INVALID_STATUS` com `extra.paid_at`, e **não** um código `ALREADY_PAID`: é uma operação ilegal para o estado atual do recurso, o mesmo significado de D8. **Gatilho para extrair `Payment`:** o primeiro pagamento parcial ou estorno — aí a transição passa a ser repetível e a coluna deixa de ser o histórico.

**O extrato deixa de ser recomputado.** Até aqui a 2ª via chamava `calculate_bill` de novo. Com a tarifa versionada isso parou de divergir, mas ainda fazia o recibo depender de o motor continuar produzindo o mesmo número para a mesma entrada — e o recibo de uma estadia encerrada não é uma função, é um fato. O checkout grava uma `StatementLine` por diária e a base da multa; `statement()` hidrata das colunas. `pricing.calculate_bill` fica com **um único chamador** em `services/reservations.py`. `late_fee_applied` deriva de `late_fee_base IS NOT NULL` em vez de virar coluna: duas colunas para o mesmo fato podem discordar. `weekday_label` **não** é coluna — nome de dia da semana é formatação na fronteira de I/O, e congelá-lo guardaria o idioma junto com o dinheiro.

**D15 — a política amarrada no check-in rege a estadia inteira.** Alternativa: "ler o limite de checkout da política vigente no momento do checkout." Divergência com caso numérico: política A (`checkout_limit=12:00`, multa 50%) amarrada na sexta; o admin publica B (`13:00`, 25%) no sábado; a saída é domingo 12:30. Adotada: **atraso sob A** — multa de R$ 90,00 e total de R$ 425,00 (o T7). Alternativa: isento, porque 12:30 < 13:00 — e a diária viria de A enquanto a decisão de multar viria de B, duas políticas dentro do mesmo extrato. Venceu a adotada: o hóspede combinou uma política na entrada, e é a combinada que fecha a conta.

A exceção é o horário de **abertura** do check-in: ele decide se o check-in pode acontecer, logo antecede a amarração e só pode vir da política vigente no ato. É por isso que `EARLY_CHECKIN` traz `extra.opens_at` — o cliente monta a mensagem sem parsear `detail`, e com a política do briefing o texto sai idêntico ao de sempre ("Check-in permitido a partir das 14:00.").

**Valores configuráveis não quebram o briefing.** Os números do desafio (120/180/15/20, multa de 50%, 14h/12h) passam a ser o **estado inicial** do sistema, em três camadas redundantes: (1) `pricing.DEFAULT_RATES` segue a constante, agora com os horários como campos com default — `tests/unit/test_pricing.py` não passa `rates`, e T1–T9 não mudam um byte; (2) uma data migration insere a mesma linha com os **mesmos literais** (migração é registro histórico e não importa constante de código), e `test_default_policy_row_matches_default_rates` amarra as duas fontes campo a campo; (3) `effective_from` é o instante da publicação e a política é amarrada por FK no check-in, então **mudar a política é mudar o futuro, nunca o passado**. Isto é *mais* fiel ao briefing que antes: até aqui, mudar `DEFAULT_RATES` reescreveria silenciosamente a 2ª via de um extrato já emitido. Sem uma ação deliberada de um `ADMIN`, cada número e cada mensagem do sistema é idêntico ao de hoje.

**D9 (emenda) — o telefone exige `+` e código do país na entrada.** Alternativa: "aceitar o número como vier e inferir o país." Divergência: `11933334444` é um celular de São Paulo; sem o `+`, `phonenumbers` o lê como `+1 193…` (EUA) — e `31…` vira Holanda, `41…` vira Suíça. Adotada: `400` no campo `phone`, e o atendente completa o DDI. Alternativa: o número entra no banco com o país errado, passa a busca e a unicidade sem levantar nada, e nunca mais volta ao dono. Por isso a checagem é `is_valid_number` (plano de numeração do país) e não `is_possible_number` (só comprimento) — a segunda aceitaria os três casos acima. A regra mora em `services.guests.create_guest`, não no serializer, pelo mesmo motivo de D11/D13: tem de valer para o seed e para o shell. Consequência declarada: a IA de preenchimento **não** infere DDI — inferir país a partir de um número solto é regra de negócio dentro de um prompt, acertaria o Brasil na maioria dos casos e erraria calado no hóspede estrangeiro.

**D9 (emenda) — nacionalidade obrigatória, ISO 3166-1 alpha-2.** Alternativa: `django-countries`/`pycountry`. Divergência: o que o sistema precisa é recusar `ZZ`, não traduzir nomes de país para 40 idiomas nem servir um `<select>` — isso é do frontend, que já tem a lista. Adotada: um `frozenset` de 249 strings estáveis em `normalization.py`, zero dependência. O model **não** tem `default`: default silencioso faria todo hóspede estrangeiro nascer brasileiro no primeiro caminho de escrita que esquecesse o campo (o `"BR"` da migração é one-off, `preserve_default=False`).

**D10 — sem vaga no dia da saída.** Alternativa: "checkout tardio cobra também a vaga do dia da saída." Divergência: T7 iria de **R$ 425,00** para R$ 445,00 (+ dom 20,00). Venceu a adotada: a consequência do atraso está enumerada exaustivamente no briefing (os 50%); cobrar vaga extra é regra inventada — e alteraria a §3.3, já conferida.

**D11 — sem reserva no passado.** Alternativa: "aceitar `checkin_date` passado." Divergência: POST em 01/09 com check-in 25/08 → alternativa cria pendência já vencida no primeiro dia de uso; adotada responde `400`. Venceu a adotada: reserva é compromisso futuro.

**D12 — documento único.** Alternativa: "documento repetido cria segunda ficha." Divergência: 2º POST com o mesmo CPF → duas fichas; busca e abas mostram o mesmo humano duas vezes. Venceu a adotada: documento é o identificador civil; histórico não fragmenta.

**D13 — agendamento mínimo de 1 noite.** Alternativa: "permitir agendar `checkout_date = checkin_date`." Divergência: a constraint §1.5 teria que cair. Venceu a adotada: constraint simples; o motor (D1/T9) já protege o caixa quando o day-use acontece de fato.

**D14 — pendência vencida fica visível.** Alternativa: "PENDING vencida some ou auto-cancela." Divergência: reserva de ontem sem check-in desapareceria sem gesto do atendente. Venceu a adotada: decisão comercial é humana; automatizar no-show é escopo novo (§0.1).

---

## 5. Chaves, variáveis de ambiente e privacidade

### 5.1 Geração de chaves

Nenhum segredo vive no repositório. O `.env.example` documenta cada variável; o
`.env` é local e está no `.gitignore`.

```bash
# SECRET_KEY — assinatura do Django
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

### 5.2 Matriz de variáveis de ambiente

O Django lê **variáveis de ambiente** (não há carregador de `.env` embutido).
Dentro do Compose, quem as entrega é `env_file: .env` no serviço `backend`;
fora dele, exporte com `set -a && . ../.env && set +a`, como na seção 2.

| Variável | Obrigatória | Default | Papel |
|---|---|---|---|
| `SECRET_KEY` | **sim** | `insecure-dev-key-change-me` | Assinatura do Django. Gere a sua (5.1). |
| `DEBUG` | não | `0` | O Compose fixa `0` no serviço `backend`. |
| `ALLOWED_HOSTS` | não | `localhost,127.0.0.1,backend` | O Compose fixa o valor acima. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | não | `hotel` / `hotel` / `hotel` | Credenciais do banco; valem para o serviço `db` e para o backend. |
| `DB_HOST` | não | `localhost` | Host do banco **visto pelo backend**. O Compose injeta `db`; o default serve ao caminho híbrido. |
| `DB_PORT` | não | `5432` | Porta do banco **vista pelo backend**. O Compose injeta `5432` (rede interna); no caminho híbrido, iguale a `DB_PORT_HOST`. |
| `DB_PORT_HOST` | não | `5432` | Porta que o serviço `db` **publica no host**. Troque (ex.: `5433`) se 5432 já estiver em uso na sua máquina — foi exatamente o caso na máquina de desenvolvimento deste projeto. |
| `SECURE_HSTS_SECONDS` | não | `31536000` | HSTS; só tem efeito atrás de TLS. |
| `ANTHROPIC_API_KEY` | não | vazio | **Liga** o diferencial de IA da seção 5.4. Vazio = feature desligada. |
| `ANTHROPIC_MODEL` | não | `claude-haiku-4-5` | Modelo usado pela extração, quando a IA está ligada. Não consta do `.env.example` por ser opcional; se você a adicionar ao `.env`, o Compose a entrega ao backend como qualquer outra. |

### 5.3 PII e busca

`documento` e `telefone` ficam em claro, **já normalizados** (D9): a coluna
guarda `12345678901` e `5521988887777`, não a máscara digitada — o telefone em
dígitos E.164, sem o `+`. A busca
(`?search=`) acha por **fragmento** nos três campos — nome, documento e
telefone — via `icontains` e índice trigram. Termo com máscara (`789-01`,
`(21) 98888`) é normalizado antes do predicado, então casa o valor gravado.
Documento é único nessa forma normalizada (D12); telefone não.

A API devolve o valor gravado. A máscara de CPF/telefone na tabela é
formatação de exibição no frontend (`formatDocument` / `formatPhone`). Logs
jamais contêm PII: nenhum `print`/log de payload de hóspede, e o exception
handler não ecoa o body.

### 5.4 Diferencial opcional: preenchimento por IA

Feature única e pontual: o atendente cola um texto livre (a linha lida do
documento, o recado da reserva por telefone) e o formulário de cadastro é
preenchido com nome, documento e telefone. **Nada é persistido pela IA** — o
resultado só preenche os campos, e o atendente revisa e submete
(*human-in-the-loop*).

> ⚠️ **Aviso de envio a provedor externo.** Com `ANTHROPIC_API_KEY`
> configurada, o texto livre digitado nesse campo é enviado à API da Anthropic
> (`https://api.anthropic.com/v1/messages`) para extração dos campos. É a única
> saída de dados do sistema para fora da sua infraestrutura, e ela só existe se
> você configurar a chave. O payload não é registrado em log, nem o texto
> enviado, nem a resposta recebida. Se essa transmissão não for aceitável no
> seu contexto, **deixe a variável vazia**: a aplicação inteira continua
> funcionando e o botão simplesmente não aparece.

Como ligar:

```bash
# no .env
ANTHROPIC_API_KEY=sk-ant-...
# opcional
ANTHROPIC_MODEL=claude-haiku-4-5

docker compose up -d --build backend
```

Portão de fallback (a parte que interessa em revisão):

| Estado | `GET /api/ai/status/` | `POST /api/ai/parse-guest/` | Frontend |
|---|---|---|---|
| Sem chave | `{"enabled": false}` | `503 AI_DISABLED` | botão "Preencher com IA" não é renderizado |
| Com chave | `{"enabled": true}` | `200` com os três campos | botão aparece no formulário de cadastro |
| Com chave, provedor falhando | `{"enabled": true}` | `502 AI_UPSTREAM_ERROR` | aviso em toast; o formulário segue preenchível à mão |

Saída de modelo é **input não confiável**: a resposta passa por um serializer
antes de chegar ao formulário, e qualquer desvio (timeout, HTTP diferente de
200, JSON inválido, chave faltante, tipo errado) vira `502 AI_UPSTREAM_ERROR`
em vez de campo estranho no cadastro.

O app é **removível por construção** — o núcleo do sistema não sabe que ele
existe. `hotel/` não importa nada de `ai/`, o pacote não entra em
`INSTALLED_APPS` (não tem models nem migrações) e nada no frontend importa
`features/ai/` além do formulário de cadastro. A feature inteira cabe em:

- `backend/ai/` e `backend/tests/api/test_ai.py`;
- uma linha de rota em `backend/config/urls.py`;
- `frontend/src/features/ai/` (com seu teste);
- um elemento no `frontend/src/features/guests/GuestForm.tsx` e o `vi.mock`
  correspondente em `GuestForm.test.tsx`;
- a dependência `httpx` no `backend/pyproject.toml`.

Apagar esses itens desliga o diferencial sem deixar um único órfão — e sem
tocar em nada que o briefing pede.

---

## 6. Mapa da API

Base `/api/`. Autenticação `Authorization: Bearer <access>` (JWT, access de 60
min, refresh de 12 h). Datas `YYYY-MM-DD`; dinheiro sempre **string decimal**
(`"120.00"`) — o frontend formata, nunca calcula. Paginação padrão do DRF
(`page_size=20`).

| Método & rota | Auth | Função |
|---|---|---|
| `POST /api/auth/token/` | — | Login → `{access, refresh}` |
| `POST /api/auth/token/refresh/` | — | Renova o access |
| `GET /api/health/` | — | `{"status":"ok"}` (healthcheck do Compose) |
| `GET/POST /api/guests/` | ✔ | Lista + busca (`?search=`) / cadastro |
| `GET /api/guests/{id}/` | ✔ | Detalhe (PII completa) |
| `GET /api/guests/in-hotel/` | ✔ | Hóspedes com reserva `CHECKED_IN` |
| `GET /api/guests/pending-checkin/` | ✔ | Hóspedes com reservas `PENDING` |
| `GET/POST /api/reservations/` | ✔ | Lista (`?status=&guest=`) / criação |
| `GET /api/reservations/{id}/` | ✔ | Detalhe da reserva |
| `GET /api/reservations/{id}/statement/` | ✔ | 2ª via do extrato (após o checkout) |
| `POST /api/reservations/{id}/check-in/` | ✔ | Efetiva o check-in (com override `allow_early`) |
| `POST /api/reservations/{id}/checkout/` | ✔ | Efetiva o checkout → extrato |
| `POST /api/reservations/{id}/cancel/` | ✔ | `PENDING → CANCELLED` |
| `GET /api/ai/status/` · `POST /api/ai/parse-guest/` | ✔ | Diferencial opcional (5.4) |
| `GET /api/schema/` · `/api/docs/` | — | OpenAPI 3 + Swagger UI |

Todo erro sai no **mesmo envelope**, para o cliente ramificar por código e
nunca por texto:

```json
{ "code": "EARLY_CHECKIN", "detail": "Check-in permitido a partir das 14:00.", "extra": { "server_time": "13:45" } }
```

| Código | HTTP | Quando |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Payload inválido (`extra` = erros por campo) |
| `NOT_AUTHENTICATED` | 401 | Token ausente ou expirado |
| `PERMISSION_DENIED` | 403 | Atendente numa rota restrita ao `ADMIN` (`IsHotelAdmin`) |
| `NOT_FOUND` | 404 | Recurso inexistente |
| `EARLY_CHECKIN` | 409 | Check-in antes da abertura da política vigente (default do briefing: 14h) sem `allow_early` (D4). `extra`: `server_time`, `opens_at` |
| `INVALID_STATUS` | 409 | Transição de status ilegal; pagamento fora de `CHECKED_OUT` ou conta já paga (`extra.paid_at`) |
| `DUPLICATE_DOCUMENT` | 409 | Documento já cadastrado (D12) |
| `ROOM_UNAVAILABLE` | 409 | Quarto sem disponibilidade: agenda cruzada, ainda ocupado, ou chegada antecipada que tomaria o quarto de outra reserva (D16). `extra`: `room_id`, `conflicting_reservation_id`, `conflicting_status`, `conflicting_checkin_date` |
| `AI_UPSTREAM_ERROR` | 502 | Provedor de IA indisponível ou resposta inutilizável |
| `THROTTLED` | 429 | Login 10/min por IP; IA 20/min por usuário |
| `AI_DISABLED` | 503 | IA sem chave configurada |

---

## 7. Arquitetura em uma página

```
hotel-management/
├── docker-compose.yml          # db (PG 17) · backend (gunicorn) · frontend (Vite)
├── .github/workflows/ci.yml    # dois jobs: backend (com PG de serviço) e frontend
├── backend/
│   ├── config/                 # settings, urls, health
│   ├── accounts/               # CustomUser (o atendente nasce do seed)
│   ├── hotel/                  # domínio: models, normalization, selectors, services
│   │   ├── selectors.py        # leitura: consultas nomeadas, sem efeito colateral
│   │   ├── services/
│   │   │   ├── pricing.py      # motor financeiro PURO: sem ORM, sem I/O, sem relógio próprio
│   │   │   ├── guests.py       # escrita de hóspede (unicidade de documento)
│   │   │   ├── reservations.py # escrita de reserva: criação e transições de status
│   │   │   └── errors.py       # erros de domínio já no formato do envelope da API
│   │   └── management/commands/seed_demo.py
│   ├── ai/                     # diferencial opcional (5.4), zero acoplamento
│   └── tests/{unit,db,api}/
└── frontend/src/
    ├── app/                    # casca: App, providers, router, AppLayout, DashboardPage
    ├── lib/                    # sem UI: apiClient (Bearer + refresh-once), errors,
    │                           #   errorLogger, schemas/forms/normalize (zod), money,
    │                           #   pii, dates, useInvalidateServerState
    ├── components/
    │   ├── ErrorBoundary/      # boundary + fallback "Algo deu errado", com retry
    │   ├── icons/              # AlertIcon, CloseIcon, RefreshIcon, SpinnerIcon
    │   └── ui/                 # primitivos Tailwind mínimos, expostos por barrel
    └── features/{auth,guests,reservations,ai}/
                                # api · hooks · schemas · types · componentes + testes
```

**O estilo tem nome.** Isto é um monólito Django modular com **camada de
serviço** (o padrão que a comunidade Django chama de *service layer*, do
Django Styleguide) e um **núcleo funcional puro** no lugar exato onde a
correção precisa ser auditável — o que a literatura chama de *functional core,
imperative shell*. Não é hexagonal e não é DDD, por decisão: o domínio importa
Django de propósito, porque a única fronteira que paga aqui é a do motor
financeiro, e ela é mantida por ausência de imports em `services/pricing.py` —
o único módulo do repositório que sobreviveria intacto a uma troca de
framework. O raciocínio completo, com o custo de cada alternativa e o gatilho
que a tornaria certa, está em [`docs/ARQUITETURA-BACKEND.md`](docs/ARQUITETURA-BACKEND.md).

Quatro invariantes atravessam o código inteiro e explicam a maior parte das
escolhas de estrutura:

1. **Dinheiro é `Decimal`, sempre.** Nunca `float`, em lugar nenhum — há uma
   guarda no CI. O valor é serializado como string e o frontend só formata.
2. **Relógio injetável.** Regra de horário recebe `now` como parâmetro
   explícito: a view injeta `timezone.now()`, o teste injeta o que quiser. Fuso
   `America/Sao_Paulo`, banco em UTC, e **toda** comparação de regra (14h, 12h)
   acontece em hora local.
3. **Camadas, sem exceção.** Models enxutos → `selectors.py` (leitura) →
   `services/` (**toda** mutação e todo dinheiro) → serializers (I/O) → views
   finas. A regra vale para a criação como vale para o check-in: view nunca
   calcula dinheiro, model nunca conhece request, e **serializer nunca lê o
   relógio nem aplica regra de negócio**. É por isso que "reserva não pode ser
   no passado" é testável passando uma data como argumento, sem subir HTTP e
   sem congelar o tempo.
4. **O cálculo mora no backend.** Nenhum teste de frontend re-prova aritmética:
   os fixtures são cópia literal da tabela de casos numéricos, então o que o
   frontend prova é consumo fiel do contrato, apresentação da consequência da
   regra e condução do protocolo (409 → alerta → reenvio com `allow_early`).

### O frontend: erros, formulários e contrato

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
`frontend/src/lib/queryClient.ts:9-22`.

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
(`frontend/src/lib/schemas.ts`). Um desvio de contrato vira `CONTRACT_ERROR`
visível — nunca um total plausível e errado na conta do hóspede.

### Como isto cresce (e o que foi recusado)

Escalar em carga, aqui, é operação e não arquitetura: um PostgreSQL de nó único
serve o volume de um hotel com folga, e os selectors de leitura já resolvem as
abas em 2 queries, sem N+1. Escalar em código e em time é o que a estrutura
acima endereça — e o que ela deliberadamente **não** antecipa:

| Se acontecer isto… | …a resposta é |
|---|---|
| Primeira mudança de tarifa | Persistir a versão da tabela na reserva (`calculate_bill` já recebe `RateTable`; falta só a coluna) |
| Pergunta de auditoria que o banco não responde ("quem fez este checkout?") | Livro-caixa append-only + ator nas transições |
| Segundo hotel no negócio | Constraint composta de `document` **antes** da coluna de tenant |
| Segundo cliente da API (mobile, integrador) | Versionar a rota antes de ele existir, nunca depois |
| Efeito externo que não pode ser perdido (e-mail, channel manager) | Outbox transacional — não um broker no caminho crítico |
| Consumidor do domínio fora do processo Django | Aí sim, considerar inversão de dependência |

Hexagonal, DDD tático e CQRS foram avaliados e recusados **para este tamanho**,
com o custo e o gatilho de cada um registrados no documento de arquitetura. O
resumo da recusa: `pricing.py` já é o hexágono, e o que sobra em
`services/reservations.py` é orquestração de transação — justamente a coisa que
ports & adapters abstrai pior. Comprar essas camadas agora seria vender curva de
aprendizado como robustez.

Uma hipótese fica registrada por honestidade: o extrato é recomputado dos fatos,
não guardado. Isso é determinístico **enquanto a tabela de tarifas não mudar** —
por isso a tarifa virou parâmetro, e por isso a linha da tabela acima existe.

Segurança, em uma linha cada: JWT com permissão global fechada
(`IsAuthenticated`) e exceções explícitas; documento e telefone em claro
normalizado, busca por fragmento, PII fora de log; CSP estrita **nas respostas
do Django**, montada por middleware do backend, com isenção pontual só na página
do Swagger; headers de nosniff, referrer-policy e clickjacking; imagens Docker
rodando como usuário **non-root**; assets do Swagger servidos localmente
(funciona offline).

E o trade-off que fica em aberto, dito com o nome certo: os tokens vivem em
`localStorage` (`frontend/src/lib/session.ts`), logo um XSS na aplicação os lê.
O que limita o dano é o access de 60 min, o refresh de 12 h e a ausência de
script de terceiro na página — **não** uma CSP, porque quem serve o documento
HTML da aplicação é o Vite, e o cabeçalho de CSP vem do middleware do Django,
que não serve essa página. As duas alternativas custam mais do que valem aqui:
cookie `HttpOnly` + CSRF exigiria endpoint que a API não expõe, e servir a
aplicação por nginx com CSP própria trocaria o caminho canônico do Compose. Fica
registrado como evolução, não escondido como defeito.

---

## 8. Escopo deliberadamente fora

O briefing não pede — logo, não foi construído: inventário de quartos, tarifas
dinâmicas/sazonais, gestão de usuários via API (o atendente nasce do seed),
recuperação de senha, edição/exclusão de hóspede ou reserva via API (registros
imutáveis após criação, exceto as transições de status — o briefing pede
armazenar e localizar, não editar), no-show automático de reservas vencidas
(D14), Celery/Redis, WebSockets, i18n, multi-tenancy, tema dark, Storybook.

Cada um desses adicionaria superfície de bug sem adicionar ponto na avaliação.
Em conflito entre "mais feature" e "mais qualidade", venceu a qualidade.

---

## 9. Ferramentas de desenvolvimento

Desenvolvido com agentes de codificação sob revisão humana; todo commit passou
pela suíte completa.

O que está configurado — e é exatamente o que o CI cobra, para que "passa na
minha máquina" e "passa no CI" signifiquem a mesma coisa:

| Ferramenta | Configuração | Papel |
|---|---|---|
| **Ruff** | `backend/pyproject.toml` | lint e formatação do Python |
| **Prettier** | `frontend/.prettierrc` | formatação única do frontend (sem `;`, aspas simples, 100 colunas), com `prettier-plugin-tailwindcss` ordenando as classes utilitárias. `npm run format:check` é passo do CI |
| **ESLint 9**, flat config | `frontend/eslint.config.js` | `typescript-eslint` **type-aware** (`strictTypeChecked`), `jsx-a11y`, `react-hooks`, `simple-import-sort`, `testing-library`/`jest-dom` nos testes — e `no-restricted-imports` por pasta impondo as camadas: `lib` não importa `components` nem `features`, `components` não importa `features`, nenhuma feature alcança `app`. Roda com `--max-warnings 0` |
| **TypeScript** | `frontend/tsconfig{,.app,.test,.node}.json` | três programas por `references` (aplicação, testes, `vite.config.ts`), para que `node` e os globais de teste não tipem código de produção. `strict` + `noUncheckedIndexedAccess`; `npm run typecheck` é `tsc -b` |
| **Vitest** + cobertura v8 | `frontend/vite.config.ts` | `mockReset`/`restoreMocks` globais (nenhum teste herda dublê do vizinho) e **piso de cobertura** que falha o CI ao regredir |
| **`.editorconfig`** e `.vscode/` | raiz do repositório | fim de linha, indentação e format-on-save iguais para quem clonar; as extensões sugeridas cobrem os dois lados |
| **Node fixado** | `frontend/.nvmrc` (24) e `engines` no `package.json` | a versão da imagem, do CI e do caminho híbrido é uma só |

Um comando cobre o frontend inteiro (`npm run check`, seção
[3](#3-verificação-as-suítes-de-teste)); o job de frontend do CI repete os
mesmos passos, um por um e nomeados, mais a guarda de dinheiro e o upload do
relatório de cobertura.

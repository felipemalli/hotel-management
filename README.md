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
| Credenciais do seed | `atendente` / `atendente123` |

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

# 3. gerar as três chaves obrigatórias (uma linha cada, sem espaços)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # -> FIELD_ENCRYPTION_KEY
python3 -c "import secrets; print(secrets.token_hex(32))"                                    # -> HASH_PEPPER
python3 -c "import secrets; print(secrets.token_urlsafe(50))"                                # -> SECRET_KEY
```

Cole cada valor na variável correspondente do `.env`.

Sem `python3` na máquina (ou sem o pacote `cryptography`, que a primeira linha
exige), gere as três dentro da própria imagem do backend — ela já traz tudo:

```bash
docker compose build backend
docker compose run --rm --no-deps backend uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
docker compose run --rm --no-deps backend uv run python -c "import secrets; print(secrets.token_hex(32))"
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
Atendente: atendente / atendente123 | hospedes: 4 | reservas: 3
```

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
   fragmento. Agora `12345678901` e depois `123.456.789-01`: os dois acham a
   mesma Ana Souza — documento é cifrado em repouso e localizado por valor
   exato *em qualquer formatação*. O mesmo vale para `21988887777`.
   Repare que documento e telefone aparecem **mascarados** na listagem.
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
[`uv`](https://docs.astral.sh/uv/) e **Node 20+**.

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

Duas notas honestas sobre esse caminho:

- `DB_HOST=localhost` é o default do `settings.py` justamente para ele; é o
  Compose que injeta `DB_HOST=db`.
- `runserver` é servidor de desenvolvimento: sobe com `DEBUG` vindo do `.env`
  (`0`), sem gunicorn e sem `collectstatic`. O `/admin/` e o `/api/docs/` ainda
  renderizam com CSS porque os estáticos são servidos pelo WhiteNoise, mas o
  runtime **entregue e testado** é o da seção 1.

---

## 3. Verificação: as suítes de teste

Os números abaixo são os do último commit: **179 testes de backend** (unitários
puros do motor financeiro, testes de banco com PostgreSQL real e testes de API
ponta a ponta) e **38 testes de frontend** em 11 arquivos.

```bash
# backend — comando canônico, com o piso de cobertura
docker compose exec backend uv run pytest --cov=hotel --cov=accounts --cov-fail-under=85 -q

# frontend
cd frontend && npm run test -- --run && npm run lint && npm run typecheck && npm run build
```

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
avaliador. Ele inclui uma guarda contra `float` em código de dinheiro:

```bash
! grep -RnE "float\(" backend/hotel backend/accounts
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
| D5 | Busca parcial × criptografia | `documento` e `telefone` são cifrados em repouso → **busca exata** via blind index (HMAC do valor normalizado). Busca **parcial** (trigram) apenas em `full_name`, que não é cifrado. Trade-off documentado em §2.1. |
| D6 | Cobrança usa datas agendadas ou reais? | **Reais** (`checked_in_at` / `checked_out_at`). Datas agendadas servem à reserva e às listagens; o dinheiro segue o fato. |
| D7 | Check-in fora da data agendada | Não validamos correspondência com a data agendada (fora de escopo). D6 garante que a cobrança permanece correta. |
| D8 | Cancelamento | Enum inclui `CANCELLED`; transição `PENDING → CANCELLED` exposta via endpoint. Nenhum outro estado cancela. |
| D9 | Documento sem dígito / passaporte | Normalização para o blind index é **por tipo**: documento = alfanumérico maiúsculo (`re.sub(r"[^A-Z0-9]", "", v.upper())`), telefone = dígitos. Validação: documento ≥ 4 alfanuméricos; telefone ≥ 8 dígitos. |
| D10 | Vaga no dia da saída em checkout tardio | **Não** se cobra vaga do dia de saída: a taxa de vaga acompanha as diárias (intervalo semiaberto de D1) e a única consequência do atraso é a multa de D3 — o briefing enumera a penalidade de forma exaustiva. |
| D11 | Reserva com data no passado | Criação exige `checkin_date >= data local de hoje` (`400 VALIDATION_ERROR`). O passado entra no sistema pelos fatos (check-in/checkout reais), nunca pelo agendamento. |
| D12 | Hóspede duplicado | `document_hash` é único (`409 DUPLICATE_DOCUMENT` no segundo cadastro). Telefone **não** é único (familiares compartilham). |
| D13 | Day-use agendado | Agendamento exige mínimo de 1 noite (constraint §1.5 mantida). Day-use existe apenas como **fato** (check-in e checkout reais no mesmo dia — T9), coberto por D1. |
| D14 | Reserva PENDING vencida | Continua listada em `pending-checkin` até ação do atendente (check-in ou cancelamento). O sistema não muda estado sem gesto humano. |

### 4.2 Leituras alternativas rejeitadas

Para cada decisão: a leitura alternativa em uma frase testável, um caso concreto onde as duas divergem, e por que a adotada venceu.

**D1 — mínimo de 1 diária.** Alternativa: "cobra-se uma diária por noite dormida; estadia sem pernoite gera zero diárias." Divergência: T9 (seg 03/03 14:00 → 18:00, com vaga) valeria ~R$ 60,00 (só multa) em vez de **R$ 195,00**. Venceu a adotada: quarto ocupado e higienizado tem custo; fatura zero contradiz "total geral da reserva **a ser paga**"; mínimo de 1 diária é praxe hoteleira.

**D2 — tarifa pela data da diária.** Alternativa: "a diária é precificada pelo dia em que a noite termina." Divergência: qui 06/03 15:00 → sáb 08/03 10:00 = qui 120 + sex 120 = **R$ 240,00** (adotada) vs sex 120 + sáb 180 = R$ 300,00 (alternativa). Venceu a adotada: "diárias de segunda à sexta" qualifica o dia em que a diária ocorre, e é assim que tarifa é anunciada em balcão.

**D3 — multa pela tarifa do dia da saída; 12:00:00 isento.** Alternativa: "a multa usa a tarifa da última diária dormida, não a do dia da saída." Divergência: sáb 08/03 14:00 → seg 10/03 12:30 = diárias 360,00 + multa 50%×120 (seg) = **R$ 420,00** (adotada) vs multa 50%×180 (dom) = R$ 450,00. Venceu a adotada: o briefing atrela a variação útil/fds ao **procedimento** de checkout, que ocorre na segunda. Fronteira: "até as 12h00min" lido como inclusivo → 12:00:00 em ponto isento (T8); "até", em pt-BR, inclui o limite.

**D4 — alerta com override (e a defesa do 409).** Alternativa: "antes das 14h o check-in é bloqueado, sem exceção." Divergência: hóspede no balcão às 13:59 → adotada: modal + confirmação = hospedado; alternativa: espera forçada. Venceu a adotada: o briefing manda **permitir** o check-in e **emitir alerta** — alerta não é proibição. Defesa do 409 (devolutiva técnica, três linhas): (1) RFC 9110 define 409 como conflito que o cliente pode resolver **alterando a requisição e reenviando** — exatamente o ciclo `allow_early`; (2) preserva a semântica binária do POST mutador (2xx ⇔ check-in efetivado), sem "200 que não muta"; (3) com o envelope §4.1, `EARLY_CHECKIN` é ramo de protocolo de primeira classe no cliente — e o caminho comum (≥ 14h) segue `200` direto, sem passar por erro.

**D5 — cifra + busca exata.** Alternativa: "PII em claro com busca parcial também em documento e telefone." Divergência: buscar `789` acharia `123.456.789-01` por fragmento; na adotada, só o valor completo (em qualquer formatação) acha. Venceu a adotada: "localizar por documento" se satisfaz com igualdade tolerante a máscara — documento se lê inteiro no balcão — e a premissa de projeto exige cifra em repouso.

**D6 — cobrança pelos fatos.** Alternativa: "a fatura usa as datas agendadas da reserva." Divergência: agendado seg 03 → qua 05 (R$ 240,00); hóspede sai qui 06/03 11:00 → adotada: seg+ter+qua = **R$ 360,00**; alternativa: R$ 240,00 (R$ 120,00 de subfaturamento). Venceu a adotada: dinheiro segue ocupação real; e a simetria protege o hóspede na saída antecipada.

**D7 — check-in fora da data agendada.** Alternativa: "check-in só na data agendada." Divergência: reserva para 05/03, hóspede chega 04/03 15:00 → adotada hospeda (e cobra desde 04, por D6); alternativa exige recriar a reserva. Venceu a adotada: validação não pedida, e D6 blinda o financeiro.

**D8 — cancelamento só de PENDING.** Alternativa: "CHECKED_IN também cancela (estorno)." Divergência: cancelar após uma noite dormida exigiria política de estorno inexistente no briefing. Venceu a adotada: dinheiro monotônico, extrato único.

**D9 — normalização alfanumérica do documento.** Alternativa: "normalizar documento por dígitos." Divergência: passaportes `AB123456` e `CD123456` teriam o mesmo blind index → `409 DUPLICATE_DOCUMENT` indevido no segundo. Venceu a adotada: preserva a unicidade real; telefone segue por dígitos porque só a máscara varia.

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
# FIELD_ENCRYPTION_KEY — chave Fernet (32 bytes em base64 url-safe)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# HASH_PEPPER — pepper do blind index (HMAC-SHA256)
python3 -c "import secrets; print(secrets.token_hex(32))"

# SECRET_KEY — assinatura do Django
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

Duas consequências que convém saber antes de trocar qualquer uma:

- perder a `FIELD_ENCRYPTION_KEY` é perder documento e telefone de todos os
  hóspedes (os valores estão cifrados em repouso, não há cópia em claro);
- trocar a `HASH_PEPPER` invalida toda a busca exata já cadastrada (os *blind
  indexes* deixam de casar com o valor digitado).

### 5.2 Matriz de variáveis de ambiente

O Django lê **variáveis de ambiente** (não há carregador de `.env` embutido).
Dentro do Compose, quem as entrega é `env_file: .env` no serviço `backend`;
fora dele, exporte com `set -a && . ../.env && set +a`, como na seção 2.

| Variável | Obrigatória | Default | Papel |
|---|---|---|---|
| `SECRET_KEY` | **sim** | `insecure-dev-key-change-me` | Assinatura do Django. Gere a sua (5.1). |
| `FIELD_ENCRYPTION_KEY` | **sim** | — | Chave Fernet dos campos cifrados (documento, telefone). |
| `HASH_PEPPER` | **sim** | — | Pepper do HMAC do *blind index* (busca exata e unicidade de documento). |
| `DEBUG` | não | `0` | O Compose fixa `0` no serviço `backend`. |
| `ALLOWED_HOSTS` | não | `localhost,127.0.0.1,backend` | O Compose fixa o valor acima. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | não | `hotel` / `hotel` / `hotel` | Credenciais do banco; valem para o serviço `db` e para o backend. |
| `DB_HOST` | não | `localhost` | Host do banco **visto pelo backend**. O Compose injeta `db`; o default serve ao caminho híbrido. |
| `DB_PORT` | não | `5432` | Porta do banco **vista pelo backend**. O Compose injeta `5432` (rede interna); no caminho híbrido, iguale a `DB_PORT_HOST`. |
| `DB_PORT_HOST` | não | `5432` | Porta que o serviço `db` **publica no host**. Troque (ex.: `5433`) se 5432 já estiver em uso na sua máquina — foi exatamente o caso na máquina de desenvolvimento deste projeto. |
| `SECURE_HSTS_SECONDS` | não | `31536000` | HSTS; só tem efeito atrás de TLS. |
| `ANTHROPIC_API_KEY` | não | vazio | **Liga** o diferencial de IA da seção 5.4. Vazio = feature desligada. |
| `ANTHROPIC_MODEL` | não | `claude-haiku-4-5` | Modelo usado pela extração, quando a IA está ligada. Não consta do `.env.example` por ser opcional; se você a adicionar ao `.env`, o Compose a entrega ao backend como qualquer outra. |

### 5.3 PII, criptografia e busca

`documento` e `telefone` são cifrados em repouso com **Fernet** e nunca
trafegam em log. Como cifra e `LIKE '%…%'` são objetivos incompatíveis sem
infraestrutura pesada, cada campo cifrado tem uma coluna paralela de *blind
index* (`HMAC-SHA256` do valor normalizado): isso dá **busca exata tolerante a
máscara** e unicidade de documento, sem expor o dado. A **busca parcial** existe
onde é segura e onde o briefing a exige de fato: no nome, via índice trigram
(decisões D5 e D9 da seção 4).

Nas listagens, PII sai **sempre mascarada** (`•••.•••.•89-01`); o valor completo
só no detalhe do hóspede, quando o atendente explicitamente o pede.

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

O app é removível por construção: `hotel/` não importa nada de `ai/`, e a
feature toda cabe em `backend/ai/`, uma rota em `backend/config/urls.py`,
`backend/tests/api/test_ai.py`, `frontend/src/features/ai/` e um elemento no
`GuestForm`.

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
| `NOT_FOUND` | 404 | Recurso inexistente |
| `EARLY_CHECKIN` | 409 | Check-in antes das 14h sem `allow_early` (D4) |
| `INVALID_STATUS` | 409 | Transição de status ilegal |
| `DUPLICATE_DOCUMENT` | 409 | Documento já cadastrado (D12) |
| `AI_UPSTREAM_ERROR` | 502 | Provedor de IA indisponível ou resposta inutilizável |
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
│   ├── hotel/                  # domínio: models, fields/crypto, selectors, services
│   │   ├── services/pricing.py # motor financeiro PURO: sem ORM, sem I/O, sem relógio próprio
│   │   └── management/commands/seed_demo.py
│   ├── ai/                     # diferencial opcional (5.4), zero acoplamento
│   └── tests/{unit,db,api}/
└── frontend/src/
    ├── app/                    # router, providers, ProtectedRoute, dashboard
    ├── lib/                    # apiClient (Bearer + refresh-once), money, errors
    ├── components/ui/          # primitivos Tailwind mínimos
    └── features/{auth,guests,reservations,ai}/
```

Quatro invariantes atravessam o código inteiro e explicam a maior parte das
escolhas de estrutura:

1. **Dinheiro é `Decimal`, sempre.** Nunca `float`, em lugar nenhum — há uma
   guarda no CI. O valor é serializado como string e o frontend só formata.
2. **Relógio injetável.** Regra de horário recebe `now` como parâmetro
   explícito: a view injeta `timezone.now()`, o teste injeta o que quiser. Fuso
   `America/Sao_Paulo`, banco em UTC, e **toda** comparação de regra (14h, 12h)
   acontece em hora local.
3. **Camadas.** Models enxutos → `selectors.py` (leitura) → `services.py`
   (mutação e dinheiro) → serializers (I/O) → views finas. View nunca calcula
   dinheiro; model nunca conhece request.
4. **O cálculo mora no backend.** Nenhum teste de frontend re-prova aritmética:
   os fixtures são cópia literal da tabela de casos numéricos, então o que o
   frontend prova é consumo fiel do contrato, apresentação da consequência da
   regra e condução do protocolo (409 → alerta → reenvio com `allow_early`).

Segurança, em uma linha cada: JWT com permissão global fechada
(`IsAuthenticated`) e exceções explícitas; PII cifrada em repouso e mascarada nas
listagens; CSP estrita com isenção pontual só na página do Swagger; headers de
nosniff, referrer-policy e clickjacking; imagens Docker rodando como usuário
**non-root**; assets do Swagger servidos localmente (funciona offline).

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

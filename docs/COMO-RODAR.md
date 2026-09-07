# Como rodar

> Voltar ao [README](../README.md), que tem o caminho curto (quatro comandos).
> Este documento é o detalhe: o caminho sem Docker, a matriz de variáveis de
> ambiente e um roteiro de demonstração.

## 1. Docker (caminho canônico)

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
> seção 4 abaixo.

```bash
# 4. subir tudo
docker compose up --build
```

> A demo serve em `http://localhost`, sem TLS, então o Compose sobe com
> `COOKIE_SECURE=0` e os cookies saem sem a flag `Secure`. Sobre http, só
> Chromium e Firefox aceitam cookie `Secure` em loopback; sem isso o login
> responde 200 mas o cookie do refresh é descartado, e o F5 devolve a tela de
> entrar. Atrás de TLS, `COOKIE_SECURE=1` (ver
> seção 4).
>
> Para abrir a demo de outra máquina, pelo IP da rede, não basta: as rotas de
> sessão comparam o `Origin`, então acrescente `http://<ip>:5173` a
> `CSRF_TRUSTED_ORIGINS` no `.env` — senão renovar e sair respondem 403.

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
administrativas da API — é o único permissionamento que existe aqui. **O admin
do Django não está instalado:** ele seria uma porta que grava na base sem passar
por service nenhum, e nenhuma regra deste domínio sobreviveria a ela. Para
inspecionar dados, use o Swagger (`/api/docs/`) ou `docker compose exec db psql`.
`GET /api/auth/me/` devolve `{id, username, role}`: é como o frontend sabe se
deve oferecer o painel administrativo.

### 1.2 Verificação rápida (o mesmo que o CI faz)

```bash
curl -sf localhost:8000/api/health/            # {"status":"ok"}
curl -sf localhost:8000/api/docs/  >/dev/null  # Swagger UI
curl -sf localhost:5173            >/dev/null  # app
```

### 1.3 Dados de demonstração

As quatro fichas do seed, os quatro quartos e os dois usuários estão na
seção 1 do [README](../README.md).

### 1.4 Fluxo de demonstração (≈ 5 minutos)

1. Abra <http://localhost:5173> e entre com **`atendente` / `atendente123`**.
2. **Aba "Todos" — localizar (RF3).** Digite `ana` na busca: o nome acha por
   fragmento. Agora `789` e depois `123.456.789-01`: os dois acham a
   mesma Ana Souza — documento e telefone estão em claro, já normalizados, e a
   busca é por fragmento em qualquer formatação. O mesmo vale para `98888`.
   Na tabela, CPF e telefone aparecem formatados pelo frontend, o telefone já
   com o código do país (`+55 (21) 98888-7777`), e a nacionalidade aparece pelo
   código, com o nome por extenso no `title`.
3. **Cadastrar (RF1).** "Novo hóspede" → nome, documento, telefone e
   nacionalidade → cadastrar. O telefone exige o **código do país**
   (`+55 21 98888-7777`): digitar `(21) 98888-7777` para no próprio campo, com
   a mesma frase que o servidor usaria, e a coluna guarda só os dígitos E.164
   (D9). A nacionalidade é um código ISO 3166-1 alpha-2, escolhido numa lista
   com o Brasil no topo. O formulário abre em seguida a criação da reserva
   desse hóspede (RF2): a entrada não pode ser no passado e o mínimo é 1 noite.
4. **Reservar com quarto e acompanhantes (RF2, D16, D19).** No formulário de
   reserva, escolher entrada e saída carrega a lista de **quartos livres no
   período** (`GET /api/rooms/available/`), já filtrada pela capacidade — somar
   um acompanhante refaz a consulta com uma pessoa a mais, e um quarto que sai
   da lista é desmarcado em vez de seguir para um 409 certo. Acompanhante é
   hóspede completo: só se escolhe quem já está cadastrado. Se outro atendente
   tomar o quarto no meio do caminho, o `409 ROOM_UNAVAILABLE` aparece no topo
   do formulário com a data da reserva conflitante, e a lista é recarregada.
5. **Check-in (RF6, RN4).** Aba "Check-in pendente" → linha da Ana Souza →
   "Check-in". Antes do horário de abertura, a API responde `409 EARLY_CHECKIN`
   e a aplicação abre o alerta com a hora do servidor ("São 13:45 — o check-in
   abre às 14:00. Confirmar mesmo assim?"); confirmar reenvia com `allow_early:
   true` e efetiva. O horário do texto é o `opens_at` da **política vigente**,
   não uma constante da tela: publicar outra abertura muda a frase. A partir
   dele, o check-in é direto. O briefing pede *alerta*, não bloqueio (D4).
6. **Checkout com extrato (RF7, RN5, RN6).** Aba "No hotel" → a estadia do
   Bruno aparece em duas linhas, a dele e a da acompanhante Eva, as duas com o
   quarto 102 e a segunda marcada como "Acompanhante". Linha do Bruno Lima →
   "Checkout". Abre o extrato: uma linha por diária (data, dia da
   semana, diária, vaga), subtotais, a linha de multa **apenas** se houve saída
   após as 12h, e o total em destaque. A linha da multa nomeia a **base** sobre
   a qual ela incide, e não uma porcentagem: o fator vem da política e o extrato
   não o carrega. Os totais ficam congelados na reserva na mesma transação — um
   segundo checkout responde `409 INVALID_STATUS`. Abaixo do total, a conta
   aparece como **"Em aberto"**: escolha a forma de pagamento e clique em
   "Registrar pagamento" (D18). O extrato passa a mostrar "Pago em … · Pix ·
   por atendente" e não muda em mais nada — pagar não recalcula. Pagar de novo
   responde `409 INVALID_STATUS` com o `paid_at`, e a tela relê o extrato já
   pago em vez de insistir num botão que não cabe mais.
7. **Reservas (`/reservas`).** O menu leva à lista completa, com filtro por
   status e — só sobre conta fechada — por pagamento. Os filtros e a página
   vivem na **URL** (`?status=CHECKED_OUT&paid=false`), então recarregar,
   voltar e compartilhar preservam a consulta. O filtro de pagamento aparece
   apenas em "Finalizada" de propósito: no servidor `paid=false` casa também
   toda reserva que ainda não pagou porque nem fechou.
8. **Detalhe da reserva (`/reservas/:id`).** "Detalhes" abre a ficha: quarto e
   datas, titular com documento, telefone e nacionalidade formatados,
   acompanhantes, e o **histórico com ator** — quem criou, quem fez o check-in,
   quem fechou, quem recebeu. A conta congelada aparece só depois do checkout,
   e "Ver extrato" reimprime a 2ª via (idêntica, porque o servidor hidrata as
   linhas gravadas em vez de recalcular). As ações disponíveis seguem o status:
   uma reserva cancelada não oferece nenhuma.
9. **Quartos (`/quartos`).** O atendente vê o inventário em leitura — número,
   capacidade e situação —, o que ajuda no balcão. Saia e entre como **`admin`
   / `admin123`**: aparecem o chip "admin" no cabeçalho, "Novo quarto" e, em
   cada linha, o menu **"⋯"** ("Ações do quarto 101") com "Editar capacidade",
   "Desativar"/"Reativar" e "Excluir". Cadastre o 301, edite uma capacidade pelo menu
   (abaixo do maior grupo com reserva ativa o servidor recusa no próprio
   campo) e tente desativar o 102, que tem estadia em curso: `409` no aviso, e
   a confirmação continua aberta. Excluir o 301 (acabou de nascer, sem reserva)
   some com a linha; tentar excluir o 102 responde `409` — histórico de reserva
   fica, e o caminho é desativar. Nenhum 403 chega ao atendente, porque nem o
   menu nem "Novo quarto" são renderizados para ele.
10. **Tarifas (`/tarifas`).** Ainda como `admin`: a tarifa vigente aparece com
    diárias, vagas, fator da multa e horários; o histórico lista o que já
    valeu, com quem publicou. "Publicar nova tarifa" abre o formulário **já
    preenchido com a vigente** — mude a abertura do check-in para `23:00` e
    publique. O próximo check-in responde "Check-in permitido a partir das
    23:00", e o extrato da Carla continua **R$ 425,00**: a política é amarrada
    no check-in (D15), então publicar muda o futuro e nunca o passado. O
    formulário aceita `120,5` e envia `"120.50"` — a normalização é de texto
    (`toDecimalString`), sem passar por ponto flutuante.
11. **Contrato navegável.** Abra <http://localhost:8000/api/docs/>: todos os
   endpoints do mapa da API (README §6), com exemplos de request, de resposta
   e dos erros de cada rota.

Para derrubar tudo: `docker compose down` (some com os containers) ou
`docker compose down -v` (some também com o volume do banco).

---

## 2. Sem Docker completo (caminho híbrido)

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
uv run python manage.py collectstatic --noinput   # CSS do Swagger com DEBUG=0
uv run python manage.py seed_demo
uv run python manage.py runserver 0.0.0.0:8000

# 3. frontend nativo (outro terminal, na raiz do repositório)
cd frontend
pnpm install --frozen-lockfile
pnpm run dev
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
  passo (ou rodando-o com o servidor já no ar), `/api/docs/` responde 200 mas
  sem CSS.
- `runserver` é servidor de desenvolvimento, sem gunicorn: o runtime
  **entregue e testado** é o da seção 1.

---

## 3. Geração de chaves

Nenhum segredo vive no repositório. O `.env.example` documenta cada variável; o
`.env` é local e está no `.gitignore`.

```bash
# SECRET_KEY — assinatura do Django
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

## 4. Matriz de variáveis de ambiente

O Django lê **variáveis de ambiente** (não há carregador de `.env` embutido).
Dentro do Compose, quem as entrega é `env_file: .env` no serviço `backend`;
fora dele, exporte com `set -a && . ../.env && set +a`, como na seção 2.

| Variável | Obrigatória | Default | Papel |
|---|---|---|---|
| `SECRET_KEY` | **sim** | `insecure-dev-key-change-me` | Assinatura do Django. Gere a sua (5.1). |
| `DEBUG` | não | `0` | O Compose fixa `0` no serviço `backend`. |
| `COOKIE_SECURE` | não | `not DEBUG` | Flag `Secure` dos cookies (sessão, `csrftoken` e refresh). O `.env.example` e o Compose usam `0`: sobre `http://`, só Chromium e Firefox aceitam cookie `Secure` em loopback; Safari e IPs de rede o descartam. Atrás de TLS, `1`. |
| `ALLOWED_HOSTS` | não | `localhost,127.0.0.1,backend` | O Compose fixa o valor acima. |
| `CSRF_TRUSTED_ORIGINS` | não | `http://localhost:5173,http://127.0.0.1:5173` | Origens que o CSRF aceita. O proxy do Vite reescreve o `Host` mas repassa o `Origin` do navegador; sem esta lista as rotas de sessão respondem 403. O `127.0.0.1` é o `baseURL` do Playwright. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | não | `hotel` / `hotel` / `hotel` | Credenciais do banco; valem para o serviço `db` e para o backend. |
| `DB_HOST` | não | `localhost` | Host do banco **visto pelo backend**. O Compose injeta `db`; o default serve ao caminho híbrido. |
| `DB_PORT` | não | `5432` | Porta do banco **vista pelo backend**. O Compose injeta `5432` (rede interna); no caminho híbrido, iguale a `DB_PORT_HOST`. |
| `DB_PORT_HOST` | não | `5432` | Porta que o serviço `db` **publica no host**. Troque (ex.: `5433`) se 5432 já estiver em uso na sua máquina — foi exatamente o caso na máquina de desenvolvimento deste projeto. |
| `REDIS_URL` | não | vazio | Cache do throttle do DRF. O Compose injeta `redis://redis:6379/1` no serviço `backend`; **vazia** (execução nativa ou híbrida) o cache cai no próprio PostgreSQL, na tabela do `createcachetable`. Nenhum requisito depende do Redis, e a denylist do refresh nunca mora nele — cache evicta, e evicção de denylist ressuscitaria token revogado em silêncio. |
| `THROTTLE_LOGIN` | não | `10/min` | Limite do login, por IP. |
| `THROTTLE_REFRESH` | não | `60/min` | Limite da renovação, por IP. Escopo próprio: o boot do frontend renova a cada carga de página, e o balcão divide um IP atrás do NAT. |
| `SECURE_HSTS_SECONDS` | não | `31536000` | HSTS; só tem efeito atrás de TLS. |
| `GUNICORN_WORKERS` | não | `3` (demo) / `2` (prod) | Workers do gunicorn. Com 1 worker sync, uma pergunta à Íris — várias chamadas HTTP para fora, orçamento de 15 s — congelaria a API inteira; o compose ainda soma `--threads 2`. |
| `NUM_PROXIES` | não | `0` | `0` = gunicorn exposto (demo): `X-Forwarded-For` é ignorado. `1` = atrás do Caddy, e aí o Django passa a confiar em `X-Forwarded-Proto` para casar cookie `Secure` e HSTS com o esquema que o navegador usou. |
| `DOMAIN` | não | `:80` | Só no `docker-compose.prod.yml`: o site que o Caddy serve. Um domínio real liga o TLS automático; `:80` serve por HTTP no IP da VM. |
| `HTTP_PORT` / `HTTPS_PORT` | não | `80` / `443` | Só no `docker-compose.prod.yml`: portas que o Caddy publica no host. |
| `THROTTLE_AI` | não | `20/min` | Limite da Íris, por usuário autenticado. Cada pergunta gasta uma unidade aqui e de 2 a 7 chamadas no provedor. |
| `OPENAI_API_KEY` | não | vazio | **Liga** a Íris ([`IRIS.md`](IRIS.md)). Vazio = feature desligada. |
| `OPENAI_MODEL` | não | `gpt-4.1-nano` | Modelo usado pela Íris. Opcional; troque sem tocar no código se quiser o degrau seguinte (`gpt-4.1-mini`). Se você a adicionar ao `.env`, o Compose a entrega ao backend como qualquer outra. |


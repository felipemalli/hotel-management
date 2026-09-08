# Relia · Gestão de Hóspedes de Hotel

Sistema de recepção para o balcão de um hotel: cadastro de hóspedes, reservas,
busca por nome, documento e telefone, check-in com alerta antes das 14h,
checkout com extrato detalhado (diárias, vaga e multa de saída após as 12h) e
integração com LLM. Construído para o desafio descrito em
[docs/CHALLENGE.md](./docs/CHALLENGE.md).

**Stack:** Python 3.13 · Django 5.2 · DRF · PostgreSQL 17 · React 18 ·
TypeScript · Vite · Tailwind · shadcn (Base UI) · Docker Compose · Pytest ·
Vitest · Playwright.

🌐 **Deploy:** <https://reliapms.online/> (AWS EC2, Docker Compose + Caddy)

🎥 **Vídeo de apresentação:** https://youtu.be/LE8lIVfArUI

📖 **Documentação:**

- [✅ O desafio e a prova de conclusão](./docs/CHALLENGE.md)
- [📜 Regras de negócio](./docs/BUSINESS_RULE.md)
- [🏗️ Arquitetura](./docs/ARCHITECTURE.md)
- [🤖 Íris, o copiloto de IA](./docs/concepts/IRIS.md)
- Conceitos: [Autenticação](./docs/concepts/AUTH.md) · [Qualidade e testes](./docs/concepts/QUALITY.md)
- Código explicado: [Conta e extrato](./docs/code/BILL-CODE.md) · [Transações e locks](./docs/code/TRANSACTIONS-CODE.md) · [Exceções e envelope de erro](./docs/code/EXCEPTIONS-CODE.md) · [Íris por dentro](./docs/code/IRIS-CODE.md)

## Pré-requisitos

- Docker v20.10+ (com Compose v2)
- git

Nem Python, nem Node, nem PostgreSQL na máquina.

## Inicialização

```bash
git clone https://github.com/felipemalli/hotel-management.git
cd hotel-management
cp .env.example .env
```

Gere uma `SECRET_KEY` e cole no `.env`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

> Sem `python3` na máquina: `docker compose build backend && docker compose run --rm --no-deps backend uv run python -c "import secrets; print(secrets.token_urlsafe(50))"`

**Executar o projeto:**

```bash
docker compose up --build
```

O Compose sobe PostgreSQL, Redis, backend (`migrate → createcachetable →
collectstatic → seed_demo → gunicorn`, cadeia definida no próprio
`docker-compose.yml`) e frontend (Vite). O seed cria os usuários e o cenário de demonstração; o log imprime as credenciais ao fim.

> Subindo sobre um volume antigo, rode `docker compose down -v` antes.
> Opcional: `OPENAI_API_KEY` no `.env` liga a Íris.

## Execução

|                              |                                                   |
| ---------------------------- | ------------------------------------------------- |
| Aplicação                    | <http://localhost:5173>                           |
| API                          | <http://localhost:8000/api/>                      |
| Swagger (contrato navegável) | <http://localhost:8000/api/docs/>                 |
| Credenciais de demonstração  | `atendente` / `atendente123` · `admin` / `admin123` |

O `atendente` opera o balcão; o `admin` também cadastra quartos e publica
tarifas.

## Testes

```bash
# backend: unitários do motor de cálculo, banco (PostgreSQL real) e API, com piso de cobertura
docker compose exec backend uv run pytest --cov=hotel --cov=accounts --cov=core --cov=ai --cov-fail-under=85 -q

# grafo de dependências entre os apps (o mesmo contrato que o CI cobra)
docker compose exec backend uv run lint-imports

# frontend: typecheck · lint · format:check · test:coverage · build
docker compose exec -e TZ=America/Sao_Paulo frontend pnpm run check

# e2e: o Playwright sobe gunicorn e Vite nativos contra o banco do Compose.
# Exige Node 24 + pnpm (corepack) e uv na máquina; o node_modules do host é separado do do container.
cd frontend && pnpm install --frozen-lockfile && pnpm exec playwright install chromium && pnpm run e2e
```

O que cada suíte prova, a doutrina de teste e o ferramental do CI:
[docs/concepts/QUALITY.md](./docs/concepts/QUALITY.md).

## Produção (um host, EC2)

```bash
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml exec backend uv run python manage.py seed_demo
```

Caddy na 80/443 com TLS automático; Postgres e Redis não saem na internet. As
variáveis (`DOMAIN`, `COOKIE_SECURE=1`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`)
estão comentadas no `.env.example`.

---

Desenvolvido com agentes de codificação sob revisão humana; todo commit passou
pela suíte completa.

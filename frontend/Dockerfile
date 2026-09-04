FROM node:24-slim

ENV NODE_ENV=development
WORKDIR /app

# corepack ja vem com a imagem node: ativa e fixa a versao declarada em
# `packageManager` (package.json), sem instalar pnpm global a parte. Precisa
# rodar como root (grava symlink em /usr/local/bin) antes do `USER node`.
RUN corepack enable

# Instala e copia ja como `node`: evita `chown -R` recursivo sobre node_modules,
# que custa minutos em overlayfs (WSL2) e inflaria a prova de clone limpo.
RUN chown node:node /app
USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY --chown=node:node . .

EXPOSE 5173
CMD ["pnpm", "run", "dev", "--", "--host"]

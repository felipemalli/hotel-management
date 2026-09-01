FROM node:24-slim

ENV NODE_ENV=development
WORKDIR /app

# Instala e copia ja como `node`: evita `chown -R` recursivo sobre node_modules,
# que custa minutos em overlayfs (WSL2) e inflaria a prova de clone limpo.
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-fund --no-audit

COPY --chown=node:node . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

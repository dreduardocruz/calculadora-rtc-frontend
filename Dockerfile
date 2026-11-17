# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# 1) Build da aplicação (Vite + React + TypeScript)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Instala as dependências primeiro (aproveita o cache de camadas)
COPY package.json package-lock.json ./
RUN npm ci

# Copia o restante do código e gera o bundle em /app/dist
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# 2) Imagem final — apenas os arquivos estáticos servidos pelo nginx
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Template do nginx. A variável ${API_TARGET} é substituída na inicialização
# do container (mecanismo de templates da imagem oficial do nginx).
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

# Backend padrão: API na máquina host (não é obrigatório em runtime).
ENV API_TARGET=http://host.docker.internal:8080

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

# syntax=docker/dockerfile:1.7
# Build a partir da raiz do monorepo: docker build -f apps/api/Dockerfile .

# Dependências de produção (sem devDeps e sem o odbc, que só serve no Windows)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --omit=optional --workspace @b3pt/core --workspace @b3pt/api

# Compilação TypeScript
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=optional --workspace @b3pt/core --workspace @b3pt/api --include-workspace-root
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run build -w @b3pt/core && npm run build -w @b3pt/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/db/migrations/postgres
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /repo/packages/core/package.json ./packages/core/package.json
COPY --from=build /repo/packages/core/dist ./packages/core/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY db/migrations ./db/migrations
USER node
EXPOSE 3333
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3333/health/ready || exit 1
CMD ["node", "apps/api/dist/server.js"]

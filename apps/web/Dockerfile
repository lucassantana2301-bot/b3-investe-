# syntax=docker/dockerfile:1.7
# Build a partir da raiz do monorepo: docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @b3pt/web --include-workspace-root
COPY apps/web apps/web
RUN npm run build -w @b3pt/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080

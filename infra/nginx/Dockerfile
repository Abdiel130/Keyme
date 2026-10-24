# syntax=docker/dockerfile:1
# Contexto: raíz del repo (la PWA usa packages/crypto y packages/models).
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/crypto/package.json packages/crypto/
COPY packages/models/package.json packages/models/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY packages packages
COPY apps/web apps/web
RUN npm run build -w @keyme/web

FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/nginx/keyme.conf /etc/nginx/conf.d/keyme.conf
COPY --from=build /src/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080

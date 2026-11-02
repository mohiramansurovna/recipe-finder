FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY vite.config.ts tsconfig.json ./
COPY web ./web
RUN npm run build:web

FROM busybox:1.36-uclibc

COPY --from=build /app/web/dist /dist

CMD ["sh", "-c", "mkdir -p /public && cp -R /dist/. /public/"]

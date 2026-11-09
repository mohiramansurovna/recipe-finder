FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node scripts/import-data.ts ./scripts/import-data.ts
COPY --chown=node:node scripts/migrate-account-schema.ts ./scripts/migrate-account-schema.ts
COPY --chown=node:node api/src/infrastructure/neo4j/account-schema.ts ./api/src/infrastructure/neo4j/account-schema.ts
COPY --chown=node:node api/src/infrastructure/neo4j/neo4j-sessions.ts ./api/src/infrastructure/neo4j/neo4j-sessions.ts
COPY --chown=node:node scripts/compose-import.sh ./scripts/compose-import.sh
RUN mkdir -p /app/.compose-state \
    && chown node:node /app/.compose-state \
    && chmod 755 /app/scripts/compose-import.sh

USER node

CMD ["npm", "run", "import:data"]

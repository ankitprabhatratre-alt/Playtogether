# syntax=docker/dockerfile:1
# PlayTogether: single container serving the built React client, REST API and Socket.IO.

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY prisma prisma
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/server/data ./server/data
COPY --from=build --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations when a database is configured, then start.
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then npx prisma migrate deploy --schema prisma/schema.prisma; fi; exec node server/dist/index.js"]

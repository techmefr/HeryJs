# Production image. Two targets built from one source: `migrate` applies the
# migrations once per release, `runtime` (the default) serves traffic. See the
# deployment guide: https://techmefr.github.io/HeryJs/guides/deployment/

FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
COPY . .
# The postinstall script runs `prisma generate`, so the client is built here.
RUN pnpm install --frozen-lockfile && pnpm run build

# One-shot job: `prisma migrate deploy` applies the committed migrations and
# exits. It is a target of its own because replicas must not race each other to
# migrate the same database, and because it needs the prisma CLI.
FROM build AS migrate
ENV NODE_ENV=production
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM node:24-slim AS runtime
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3000
# node_modules is copied whole, dev dependencies included: hery.config.ts and
# cors.config.ts are TypeScript read at boot through ts-node, and pruning
# either one away stops the process before it listens.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json /app/tsconfig.json /app/hery.config.ts /app/cors.config.ts ./
USER node
EXPOSE 3000
# Liveness only: a dependency outage must not restart a healthy process.
# Point the orchestrator's readiness probe at /health/ready.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/src/main"]

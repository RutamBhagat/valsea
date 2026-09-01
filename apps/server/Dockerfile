FROM oven/bun:1 AS builder
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

ENV NODE_ENV=production
RUN cd apps/server && bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
LABEL service="valsea"

COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/benchmark/package.json ./packages/benchmark/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/env/package.json ./packages/env/package.json
COPY packages/infra/package.json ./packages/infra/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --production --filter @valsea/server

COPY --from=builder /app/apps/server/dist/index.mjs ./apps/server/dist/index.mjs
COPY --from=builder /app/packages/db/drizzle.config.ts ./packages/db/drizzle.config.ts
COPY --from=builder /app/packages/db/src/migrations ./packages/db/src/migrations
COPY --from=builder /app/apps/qwen-modal/benchmark_result.json /app/apps/qwen-modal/benchmark_result.json

EXPOSE 3000
WORKDIR /app/apps/server
USER bun
CMD ["bun", "run", "start"]

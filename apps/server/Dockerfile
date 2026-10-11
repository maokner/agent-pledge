# Build from the repo root:  docker build -f apps/server/Dockerfile -t agent-pledge-server .
# Runs TypeScript directly with tsx (no build step). Migrations run at startup.
FROM node:22-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/ledger/package.json packages/ledger/
RUN pnpm install --frozen-lockfile --filter "@agent-pledge/server..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/ledger packages/ledger
COPY apps/server apps/server

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
EXPOSE 3001
WORKDIR /app/apps/server
CMD ["node", "--import", "tsx", "src/server.ts"]

# syntax=docker/dockerfile:1.7
#
# Medusa backend (API server, worker, migration job - one image, three roles).
# Build from the repository root:
#   docker build -f infra/docker/medusa.Dockerfile -t fashion-medusa .
#
# Role is chosen at runtime, not build time:
#   MEDUSA_WORKER_MODE=server  -> HTTP only (scale on request load)
#   MEDUSA_WORKER_MODE=worker  -> jobs + subscribers only (scale on queue depth)
#   command: npx medusa db:migrate -> one-shot migration job

ARG NODE_VERSION=22

# ---- build -------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS build
ENV CI=true PNPM_HOME=/pnpm PATH=/pnpm:$PATH MEDUSA_DISABLE_TELEMETRY=true
RUN corepack enable
WORKDIR /repo

# Dependency layer: changes only when manifests/lockfile change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/medusa/package.json apps/medusa/package.json
COPY packages packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter medusa...

COPY apps/medusa apps/medusa
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm --filter medusa build

# Production-only node_modules (workspace packages are materialised, not linked).
RUN pnpm --filter medusa deploy --prod --legacy /out \
 && rm -rf /out/src /out/medusa-config.ts /out/instrumentation.ts /out/integration-tests \
           /out/tsconfig.json /out/tsconfig.fashion.json /out/README.md \
 && cp -R apps/medusa/.medusa/server/src /out/src \
 && cp -R apps/medusa/.medusa/server/public /out/public \
 && cp apps/medusa/.medusa/server/medusa-config.js apps/medusa/.medusa/server/instrumentation.js /out/

# ---- runtime -------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production MEDUSA_DISABLE_TELEMETRY=true PORT=9000
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 9000
# Liveness only (cheap). Readiness (DB reachable) is /internal/ready, used by k8s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "medusa", "start"]

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
# The build type-checks everything; pre-existing template code still reports
# type-only errors (see scripts/check-build-errors.mjs). Any error outside that
# known legacy code fails the build.
RUN pnpm --filter medusa build > /tmp/build.log 2>&1 || true; \
    tail -5 /tmp/build.log; \
    cd apps/medusa && node scripts/check-build-errors.mjs /tmp/build.log

# Production-only node_modules (workspace packages are materialised, not linked).
RUN pnpm --filter medusa deploy --prod --legacy /out \
 && rm -rf /out/src /out/medusa-config.ts /out/instrumentation.ts /out/integration-tests \
           /out/tsconfig.json /out/tsconfig.fashion.json /out/README.md \
 && cp -R apps/medusa/.medusa/server/src /out/src \
 && cp -R apps/medusa/.medusa/server/public /out/public \
 && cp apps/medusa/.medusa/server/medusa-config.js apps/medusa/.medusa/server/instrumentation.js /out/

# @ecommerce/email is shipped as TSX source: its package.json "exports" point at
# src/index.tsx, which Node cannot load. Compile it to CommonJS and point the
# deployed copy at the output. Without this the SMTP notification provider fails
# at start-up ("Unexpected identifier ...") and Medusa cannot boot with real email.
# Type errors do not block the emit (the package has its own check-types script).
RUN set -eu; \
    cd packages/email; \
    npx tsc -p tsconfig.json --outDir /tmp/email-cjs --rootDir src \
      --module nodenext --moduleResolution nodenext \
      --verbatimModuleSyntax false --composite false --incremental false \
      --declaration false --declarationMap false --sourceMap false \
      --noUnusedLocals false --noUnusedParameters false || true; \
    test -f /tmp/email-cjs/index.js; \
    target="$(readlink -f /out/node_modules/@ecommerce/email)"; \
    cp -R /tmp/email-cjs "$target/dist"; \
    node -e "const fs=require('fs');const f=process.argv[1]+'/package.json';const p=JSON.parse(fs.readFileSync(f,'utf8'));p.exports={'.':{default:'./dist/index.js'}};p.main='./dist/index.js';fs.writeFileSync(f,JSON.stringify(p,null,2))" "$target"

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

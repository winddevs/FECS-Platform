# syntax=docker/dockerfile:1.7
# Storefront (Next.js + Payload CMS admin) production image.
#
# Build from the repo root:  scripts/deploy.sh release store
# (do not run `docker build` by hand: the build needs the Medusa API and the CMS
# database reachable, and the script opens an SSH tunnel for that).
#
# Stages
#   source   workspace + dependencies + app source.
#   migrate  `payload migrate`, before `next build`, because the build reads
#            the CMS database (generateStaticParams) and the Medusa API.
#   build    `next build` with output=standalone.
#   runtime  the standalone server only (no pnpm, no dev dependencies).
#
# Build-time environment (NEXT_PUBLIC_*, DATABASE_URL, PAYLOAD_SECRET, ...) is
# read from a BuildKit secret mounted at /run/secrets/build_env, never from ARG,
# so it does not end up in image layers or `docker history`.
ARG NODE_VERSION=22

# ---- source ------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS source
ENV CI=true PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Dependency layer: changes only when manifests or the lockfile change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/store/package.json apps/store/package.json
COPY packages packages
RUN --mount=type=cache,id=pnpm-store-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter store...

COPY apps/store apps/store

# ---- migrate -----------------------------------------------------------------
# Applies Payload migrations to the live CMS database. This stage has a side
# effect, so scripts/deploy.sh builds with `--no-cache-filter migrate` to make
# it run on every release. There is no stdin: if Payload ever asks for
# confirmation (it does when the database was changed in dev mode) the build
# fails instead of answering yes for you.
FROM source AS migrate
RUN --mount=type=secret,id=build_env \
    set -eu; \
    set -a; . /run/secrets/build_env; set +a; \
    cd apps/store && pnpm exec payload migrate

# ---- build -------------------------------------------------------------------
FROM migrate AS build
ENV NEXT_OUTPUT=standalone NODE_ENV=production
# Known type errors in the storefront (see next.config.mjs). Dev, CI and local builds stay strict.
ENV NEXT_IGNORE_TYPE_ERRORS=true
# Fewer prerender workers: under QEMU emulation 7 workers segfault intermittently.
# Raise or remove this when building natively or with Rosetta.
ENV NEXT_BUILD_CPUS=2
# 3 GB heap for the Next + Payload build. The Docker Desktop VM has 7 GB.
# Raise it if the build runs out of memory.
ENV NODE_OPTIONS="--max-old-space-size=3072 --no-deprecation"
RUN --mount=type=secret,id=build_env \
    set -eu; \
    set -a; . /run/secrets/build_env; set +a; \
    cd apps/store && pnpm exec next build

# ---- runtime -----------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone keeps the monorepo layout, so the server is apps/store/server.js.
COPY --from=build --chown=node:node /repo/apps/store/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/store/.next/static ./apps/store/.next/static
COPY --from=build --chown=node:node /repo/apps/store/public ./apps/store/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/store/server.js"]

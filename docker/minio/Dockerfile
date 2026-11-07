# Builds the MinIO S3 server from source (https://github.com/minio/minio).
# The upstream repo is archived and no longer publishes images, so we pin a
# commit and compile it here.
ARG GO_VERSION=1.24

# Build on the host's own architecture and cross-compile: Go does not need emulation,
# and the pure-Go binary (CGO off) runs on the target platform unchanged.
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS build
ARG TARGETOS
ARG TARGETARCH
ARG MINIO_REF=7aac2a2c5b7c882e68c1ce017d8256be2feea27f
RUN apk add --no-cache git
WORKDIR /src
RUN git init . \
  && git remote add origin https://github.com/minio/minio.git \
  && git fetch --depth 1 origin "${MINIO_REF}" \
  && git checkout FETCH_HEAD
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} GOFLAGS=-trimpath go build -ldflags "-s -w" -o /out/minio .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates curl
COPY --from=build /out/minio /usr/bin/minio
VOLUME ["/data"]
EXPOSE 9000 9001
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -fsS http://localhost:9000/minio/health/live || exit 1
ENTRYPOINT ["/usr/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]

# Stage 1: deps — install workspace dependencies
FROM oven/bun:1.3.11-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/crypto/package.json packages/crypto/
COPY packages/storage/package.json packages/storage/
COPY packages/auth/package.json packages/auth/
COPY packages/stacks/package.json packages/stacks/
COPY packages/updates/package.json packages/updates/
COPY packages/api/package.json packages/api/
COPY apps/server/package.json apps/server/
# Stub UI package.json so workspace resolution succeeds
RUN mkdir -p apps/ui && echo '{"name":"@procella/ui","private":true}' > apps/ui/package.json
RUN mkdir -p apps/docs && echo '{"name":"@procella/docs","private":true}' > apps/docs/package.json
RUN bun install --frozen-lockfile

# Stage 2: build — compile server into a standalone binary
FROM deps AS build
COPY tsconfig.json ./
COPY packages/ packages/
COPY apps/server/ apps/server/
RUN bun build --compile --minify apps/server/src/index.ts --outfile procella

# Stage 3: runtime — distroless (no shell, no pkg manager, ~25 MB)
# cc-debian12 provides glibc + libgcc + ca-certificates which the
# dynamically-linked Bun binary requires. scratch is not viable.
FROM gcr.io/distroless/cc-debian12
COPY --from=build /app/procella /procella
EXPOSE 9090
ENTRYPOINT ["/procella"]

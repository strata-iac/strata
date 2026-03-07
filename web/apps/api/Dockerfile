FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY web/package.json web/bun.lock ./
COPY web/apps/api/package.json apps/api/package.json

# Install deps
RUN bun install --frozen-lockfile --production

# Copy source
COPY web/apps/api/ apps/api/

# Build standalone binary
WORKDIR /app/apps/api
RUN bun build src/index.ts --compile --outfile /strata-web

FROM gcr.io/distroless/cc-debian12:nonroot

COPY --from=builder /strata-web /strata-web

EXPOSE 3000

CMD ["/strata-web"]

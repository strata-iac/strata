FROM golang:1.26.1-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /strata ./cmd/strata

FROM scratch

COPY --from=builder /strata /strata

EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD ["/strata", "healthcheck"]

CMD ["/strata"]

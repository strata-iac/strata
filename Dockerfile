FROM golang:1.25.7-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /strata ./cmd/strata

FROM alpine:3.21

COPY --from=builder /strata /strata

EXPOSE 8080

CMD ["/strata"]

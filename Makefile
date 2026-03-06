GO := $(shell mise which go 2>/dev/null || which go)

.PHONY: dev deps down build go-build go-vet

dev:
	docker compose --profile dev up --build

deps:
	docker compose up -d

down:
	docker compose --profile dev down -v

build:
	docker build -t strata:dev .

go-build:
	$(GO) build ./...

go-vet:
	$(GO) vet ./...

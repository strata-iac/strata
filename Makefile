MISE_EXEC := mise exec --
GO := $(MISE_EXEC) go
GOFUMPT := $(MISE_EXEC) gofumpt
GOLANGCI_LINT := $(MISE_EXEC) golangci-lint
GOSEC := $(MISE_EXEC) gosec
GOVULNCHECK := $(MISE_EXEC) govulncheck

.PHONY: dev deps down build go-build go-vet lint fmt sec vuln test check

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

fmt:
	$(GOFUMPT) -w .

fmt-check:
	@test -z "$$($(GOFUMPT) -l .)" || (echo "gofumpt: files need formatting:" && $(GOFUMPT) -l . && exit 1)

lint:
	$(GOLANGCI_LINT) run ./...

lint-fix:
	$(GOLANGCI_LINT) run --fix ./...

sec:
	$(GOSEC) -quiet ./...

vuln:
	$(GOVULNCHECK) ./...

test:
	$(GO) test -race -count=1 ./...

check: fmt-check lint sec vuln go-build test

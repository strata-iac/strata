// Procella ESC evaluator Lambda.
//
// Embeds github.com/pulumi/esc as a library (Path A per
// .sisyphus/analysis/esc-evaluator-decision.md). Accepts a pre-resolved
// {definition, imports, encryptionKeyHex} payload — the TS side resolves the
// import graph from PostgreSQL before invoking, so this Lambda never reads
// the DB or the network for imports.
//
// Scaffold only (procella-yj7.3). Real handler (procella-yj7.11) implements
// EnvironmentLoader, ProviderLoader, Decrypter and wires them to
// eval.EvalEnvironment.

package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/aws/aws-lambda-go/lambda"
)

// EvaluateRequest mirrors the TS EvaluatePayload in packages/esc/src/evaluator-client.ts.
type EvaluateRequest struct {
	Definition       string            `json:"definition"`
	Imports          map[string]string `json:"imports"`
	EncryptionKeyHex string            `json:"encryptionKeyHex"`
}

type EvaluateDiagnostic struct {
	Severity string   `json:"severity"`
	Summary  string   `json:"summary"`
	Path     []string `json:"path,omitempty"`
}

type EvaluateResponse struct {
	Values      map[string]any       `json:"values"`
	Secrets     []string             `json:"secrets"`
	Diagnostics []EvaluateDiagnostic `json:"diagnostics"`
}

func handle(ctx context.Context, req EvaluateRequest) (EvaluateResponse, error) {
	if req.Definition == "" {
		return EvaluateResponse{}, errors.New("definition is required")
	}
	if _, err := hex.DecodeString(req.EncryptionKeyHex); err != nil {
		return EvaluateResponse{}, fmt.Errorf("encryptionKeyHex: %w", err)
	}

	return EvaluateResponse{}, errors.New("not implemented — see procella-yj7.11")
}

func main() {
	lambda.Start(handle)
}

//go:build e2e

package e2e

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestPulumiConfigSetSecret sets a secret config value, then reads it back.
// This exercises the encrypt and decrypt endpoints end-to-end via the CLI.
func TestPulumiConfigSetSecret(t *testing.T) {
	truncateDB(t)
	env := newTestEnv(t, "secret-project")
	env.login()

	fqn := devOrgLogin + "/secret-project/dev"
	env.run("stack", "init", "--stack", fqn)

	// Set a secret config value. This triggers POST .../encrypt.
	env.run("config", "set", "--secret", "--stack", fqn, "mySecret", "super-secret-value-42")

	// Read it back. This triggers POST .../decrypt (via stack export + config resolution).
	stdout, _ := env.run("config", "get", "--stack", fqn, "mySecret")
	got := strings.TrimSpace(stdout)
	if got != "super-secret-value-42" {
		t.Fatalf("expected config get to return %q, got %q", "super-secret-value-42", got)
	}
}

// TestPulumiConfigSetSecretJSON verifies secret values appear as "[secret]" in JSON config output.
func TestPulumiConfigSetSecretJSON(t *testing.T) {
	truncateDB(t)
	env := newTestEnv(t, "secret-json-project")
	env.login()

	fqn := devOrgLogin + "/secret-json-project/dev"
	env.run("stack", "init", "--stack", fqn)

	// Set a plain and a secret config value.
	env.run("config", "set", "--stack", fqn, "plainKey", "visible-value")
	env.run("config", "set", "--secret", "--stack", fqn, "secretKey", "hidden-value")

	// Get config as JSON — secret should be masked.
	stdout, _ := env.run("config", "--json", "--stack", fqn)

	var configMap map[string]struct {
		Value  string `json:"value"`
		Secret bool   `json:"secret"`
	}
	if err := json.Unmarshal([]byte(stdout), &configMap); err != nil {
		t.Fatalf("parse config JSON: %v\noutput: %s", err, stdout)
	}

	plain, ok := configMap["secret-json-project:plainKey"]
	if !ok {
		t.Fatalf("expected plainKey in config, got keys: %v", configMap)
	}
	if plain.Value != "visible-value" {
		t.Fatalf("expected plainKey value %q, got %q", "visible-value", plain.Value)
	}

	secret, ok := configMap["secret-json-project:secretKey"]
	if !ok {
		t.Fatalf("expected secretKey in config, got keys: %v", configMap)
	}
	if !secret.Secret {
		t.Fatal("expected secretKey to be marked as secret")
	}
}

// TestEncryptDecryptViaHTTP exercises the encrypt/decrypt endpoints directly via HTTP.
func TestEncryptDecryptViaHTTP(t *testing.T) {
	truncateDB(t)
	env := newTestEnv(t, "crypto-http-project")
	env.login()

	fqn := devOrgLogin + "/crypto-http-project/dev"
	env.run("stack", "init", "--stack", fqn)

	// Encrypt a value via HTTP.
	encResp := env.httpDo("POST",
		"/api/stacks/"+devOrgLogin+"/crypto-http-project/dev/encrypt",
		`{"plaintext":"aGVsbG8gd29ybGQ="}`) // base64("hello world")
	defer encResp.Body.Close()

	if encResp.StatusCode != 200 {
		t.Fatalf("encrypt: expected 200, got %d", encResp.StatusCode)
	}

	var encResult struct {
		Ciphertext string `json:"ciphertext"` // base64-encoded
	}
	if err := json.NewDecoder(encResp.Body).Decode(&encResult); err != nil {
		t.Fatalf("decode encrypt response: %v", err)
	}
	if encResult.Ciphertext == "" {
		t.Fatal("expected non-empty ciphertext")
	}

	// Decrypt it back.
	decResp := env.httpDo("POST",
		"/api/stacks/"+devOrgLogin+"/crypto-http-project/dev/decrypt",
		`{"ciphertext":"`+encResult.Ciphertext+`"}`)
	defer decResp.Body.Close()

	if decResp.StatusCode != 200 {
		t.Fatalf("decrypt: expected 200, got %d", decResp.StatusCode)
	}

	var decResult struct {
		Plaintext string `json:"plaintext"` // base64-encoded
	}
	if err := json.NewDecoder(decResp.Body).Decode(&decResult); err != nil {
		t.Fatalf("decode decrypt response: %v", err)
	}
	if decResult.Plaintext != "aGVsbG8gd29ybGQ=" {
		t.Fatalf("expected plaintext %q, got %q", "aGVsbG8gd29ybGQ=", decResult.Plaintext)
	}
}

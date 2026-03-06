package blobs

import (
	"bytes"
	"context"
	"io"
	"path/filepath"
	"testing"
)

func TestLocalStoreSmoke(t *testing.T) {
	t.Parallel()

	basePath := t.TempDir()
	store, err := NewLocalStore(basePath)
	if err != nil {
		t.Fatalf("new local store: %v", err)
	}

	ctx := context.Background()
	key := filepath.Join("org-a", "stack-a", "checkpoint.bin")
	payload := []byte("local-store-payload")

	if err := store.Put(ctx, key, bytes.NewReader(payload), int64(len(payload))); err != nil {
		t.Fatalf("put blob: %v", err)
	}

	exists, err := store.Exists(ctx, key)
	if err != nil {
		t.Fatalf("exists after put: %v", err)
	}
	if !exists {
		t.Fatalf("expected blob to exist")
	}

	r, err := store.Get(ctx, key)
	if err != nil {
		t.Fatalf("get blob: %v", err)
	}
	defer r.Close()

	body, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("read blob: %v", err)
	}
	if !bytes.Equal(body, payload) {
		t.Fatalf("blob payload mismatch: got %q want %q", string(body), string(payload))
	}

	if err := store.Delete(ctx, key); err != nil {
		t.Fatalf("delete blob: %v", err)
	}

	exists, err = store.Exists(ctx, key)
	if err != nil {
		t.Fatalf("exists after delete: %v", err)
	}
	if exists {
		t.Fatalf("expected blob to be deleted")
	}
}

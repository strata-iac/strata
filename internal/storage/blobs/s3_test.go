package blobs

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestS3StoreSmokeWithMinIO(t *testing.T) {
	t.Setenv("AWS_ACCESS_KEY_ID", "minioadmin")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "minioadmin")
	t.Setenv("AWS_REGION", "us-east-1")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	store, err := NewS3Store(ctx, "strata-checkpoints", "http://localhost:9000")
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "connect") || strings.Contains(strings.ToLower(err.Error()), "refused") {
			t.Skipf("minio is not reachable: %v", err)
		}
		t.Fatalf("new s3 store: %v", err)
	}

	key := "smoke/" + uuid.NewString() + ".bin"
	payload := []byte("s3-store-payload")

	if err := store.Put(ctx, key, bytes.NewReader(payload), int64(len(payload))); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "connect") || strings.Contains(strings.ToLower(err.Error()), "refused") {
			t.Skipf("minio is not reachable: %v", err)
		}
		t.Fatalf("put object: %v", err)
	}

	exists, err := store.Exists(ctx, key)
	if err != nil {
		t.Fatalf("exists after put: %v", err)
	}
	if !exists {
		t.Fatalf("expected object to exist")
	}

	r, err := store.Get(ctx, key)
	if err != nil {
		t.Fatalf("get object: %v", err)
	}
	defer r.Close()

	body, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("read object body: %v", err)
	}
	if !bytes.Equal(body, payload) {
		t.Fatalf("object payload mismatch: got %q want %q", string(body), string(payload))
	}

	if err := store.Delete(ctx, key); err != nil {
		t.Fatalf("delete object: %v", err)
	}

	exists, err = store.Exists(ctx, key)
	if err != nil {
		t.Fatalf("exists after delete: %v", err)
	}
	if exists {
		t.Fatalf("expected object to be deleted")
	}
}

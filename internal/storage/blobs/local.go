package blobs

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type LocalStore struct {
	basePath string
}

func NewLocalStore(basePath string) (*LocalStore, error) {
	if basePath == "" {
		return nil, fmt.Errorf("base path is required")
	}

	if err := os.MkdirAll(basePath, 0o755); err != nil {
		return nil, fmt.Errorf("create base path %q: %w", basePath, err)
	}

	return &LocalStore{basePath: basePath}, nil
}

func (s *LocalStore) Put(_ context.Context, key string, r io.Reader, _ int64) error {
	path := filepath.Join(s.basePath, key)
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create parent directory for %q: %w", key, err)
	}

	tmpPath := path + ".tmp"
	tmpFile, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temp file for %q: %w", key, err)
	}
	tmpGeneratedPath := tmpFile.Name()

	if _, err := io.Copy(tmpFile, r); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpGeneratedPath)
		return fmt.Errorf("write temp file for %q: %w", key, err)
	}

	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpGeneratedPath)
		return fmt.Errorf("close temp file for %q: %w", key, err)
	}

	if err := os.Rename(tmpGeneratedPath, tmpPath); err != nil {
		_ = os.Remove(tmpGeneratedPath)
		return fmt.Errorf("rename generated temp file for %q: %w", key, err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("rename temp file for %q: %w", key, err)
	}

	return nil
}

func (s *LocalStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	path := filepath.Join(s.basePath, key)

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open blob %q: %w", key, err)
	}

	return f, nil
}

func (s *LocalStore) Delete(_ context.Context, key string) error {
	path := filepath.Join(s.basePath, key)

	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove blob %q: %w", key, err)
	}

	return nil
}

func (s *LocalStore) Exists(_ context.Context, key string) (bool, error) {
	path := filepath.Join(s.basePath, key)

	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}

	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}

	return false, fmt.Errorf("stat blob %q: %w", key, err)
}

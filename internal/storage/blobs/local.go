package blobs

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type LocalStore struct {
	basePath string
}

func NewLocalStore(basePath string) (*LocalStore, error) {
	if basePath == "" {
		return nil, fmt.Errorf("base path is required")
	}

	absBase, err := filepath.Abs(basePath)
	if err != nil {
		return nil, fmt.Errorf("resolve base path %q: %w", basePath, err)
	}

	if err := os.MkdirAll(absBase, 0o750); err != nil {
		return nil, fmt.Errorf("create base path %q: %w", absBase, err)
	}

	return &LocalStore{basePath: absBase}, nil
}

func (s *LocalStore) safePath(key string) (string, error) {
	joined := filepath.Join(s.basePath, filepath.Clean("/"+key))
	if !strings.HasPrefix(joined, s.basePath+string(filepath.Separator)) && joined != s.basePath {
		return "", fmt.Errorf("invalid key %q: path traversal detected", key)
	}

	return joined, nil
}

func (s *LocalStore) Put(_ context.Context, key string, r io.Reader, _ int64) error {
	path, err := s.safePath(key)
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
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
	path, err := s.safePath(key)
	if err != nil {
		return nil, err
	}

	f, err := os.Open(path) //#nosec G304 -- path validated by safePath
	if err != nil {
		return nil, fmt.Errorf("open blob %q: %w", key, err)
	}

	return f, nil
}

func (s *LocalStore) Delete(_ context.Context, key string) error {
	path, err := s.safePath(key)
	if err != nil {
		return err
	}

	if err = os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove blob %q: %w", key, err)
	}

	return nil
}

func (s *LocalStore) Exists(_ context.Context, key string) (bool, error) {
	path, err := s.safePath(key)
	if err != nil {
		return false, err
	}

	_, err = os.Stat(path)
	if err == nil {
		return true, nil
	}

	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}

	return false, fmt.Errorf("stat blob %q: %w", key, err)
}

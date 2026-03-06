package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"sync"
)

// Gzip handles both:
// 1. Request decompression: if Content-Encoding: gzip, decompress body before handlers see it
// 2. Response compression: if Accept-Encoding: gzip, compress response

var gzipReaderPool = sync.Pool{
	New: func() any { return new(gzip.Reader) },
}

var gzipWriterPool = sync.Pool{
	New: func() any { return gzip.NewWriter(io.Discard) },
}

func Gzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Decompress request body if gzipped
		if r.Header.Get("Content-Encoding") == "gzip" {
			gr := gzipReaderPool.Get().(*gzip.Reader)
			if err := gr.Reset(r.Body); err != nil {
				http.Error(w, "failed to decompress request", http.StatusBadRequest)
				return
			}
			r.Body = &pooledGzipReadCloser{Reader: gr, original: r.Body}
			r.Header.Del("Content-Encoding")
			r.ContentLength = -1 // unknown after decompression
		}

		// Compress response if client accepts gzip
		if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			gw := gzipWriterPool.Get().(*gzip.Writer)
			gw.Reset(w)

			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Del("Content-Length") // length changes

			grw := &gzipResponseWriter{ResponseWriter: w, Writer: gw}
			defer func() {
				gw.Close()
				gzipWriterPool.Put(gw)
			}()

			next.ServeHTTP(grw, r)
			return
		}

		next.ServeHTTP(w, r)
	})
}

type pooledGzipReadCloser struct {
	*gzip.Reader
	original io.ReadCloser
}

func (r *pooledGzipReadCloser) Close() error {
	err := r.Reader.Close()
	gzipReaderPool.Put(r.Reader)
	_ = r.original.Close()
	return err
}

type gzipResponseWriter struct {
	http.ResponseWriter
	Writer      *gzip.Writer
	wroteHeader bool
}

func (w *gzipResponseWriter) WriteHeader(code int) {
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(code)
}

func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.Writer.Write(b)
}

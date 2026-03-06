package updates

import (
	"encoding/json"
	"testing"
)

func TestApplyDelta_EmptyEdits(t *testing.T) {
	base := []byte(`{"resources":[{"urn":"a"}]}`)
	result, err := applyDelta(base, json.RawMessage(`[]`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(result) != string(base) {
		t.Errorf("expected %q, got %q", base, result)
	}
}

func TestApplyDelta_SingleReplacement(t *testing.T) {
	base := []byte(`{"key":"old-value","other":"data"}`)
	// "old-value" (with quotes) spans bytes 7..18
	edits := []textEdit{
		{
			Span:    textEditSpan{Start: textEditPoint{Offset: 7}, End: textEditPoint{Offset: 18}},
			NewText: `"new-value"`,
		},
	}
	deltaJSON, _ := json.Marshal(edits)

	result, err := applyDelta(base, deltaJSON)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := `{"key":"new-value","other":"data"}`
	if string(result) != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestApplyDelta_MultipleReplacements(t *testing.T) {
	base := []byte(`AAABBBCCC`)
	edits := []textEdit{
		{
			Span:    textEditSpan{Start: textEditPoint{Offset: 0}, End: textEditPoint{Offset: 3}},
			NewText: "XX",
		},
		{
			Span:    textEditSpan{Start: textEditPoint{Offset: 6}, End: textEditPoint{Offset: 9}},
			NewText: "ZZZZ",
		},
	}
	deltaJSON, _ := json.Marshal(edits)

	result, err := applyDelta(base, deltaJSON)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "XXBBBZZZZ"
	if string(result) != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestApplyDelta_Insertion(t *testing.T) {
	base := []byte(`AABB`)
	edits := []textEdit{
		{
			Span:    textEditSpan{Start: textEditPoint{Offset: 2}, End: textEditPoint{Offset: 2}},
			NewText: "CC",
		},
	}
	deltaJSON, _ := json.Marshal(edits)

	result, err := applyDelta(base, deltaJSON)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "AACCBB"
	if string(result) != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestApplyDelta_Deletion(t *testing.T) {
	base := []byte(`AABBCC`)
	edits := []textEdit{
		{
			Span:    textEditSpan{Start: textEditPoint{Offset: 2}, End: textEditPoint{Offset: 4}},
			NewText: "",
		},
	}
	deltaJSON, _ := json.Marshal(edits)

	result, err := applyDelta(base, deltaJSON)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "AACC"
	if string(result) != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestApplyDelta_UnsortedEdits(t *testing.T) {
	base := []byte(`AAABBBCCC`)
	edits := []textEdit{
		{
			Span:    textEditSpan{Start: textEditPoint{Offset: 6}, End: textEditPoint{Offset: 9}},
			NewText: "ZZ",
		},
		{
			Span:    textEditSpan{Start: textEditPoint{Offset: 0}, End: textEditPoint{Offset: 3}},
			NewText: "XX",
		},
	}
	deltaJSON, _ := json.Marshal(edits)

	result, err := applyDelta(base, deltaJSON)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "XXBBBZZ"
	if string(result) != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestApplyDelta_InvalidSpan(t *testing.T) {
	base := []byte(`SHORT`)
	edits := []textEdit{
		{
			Span:    textEditSpan{Start: textEditPoint{Offset: 0}, End: textEditPoint{Offset: 100}},
			NewText: "X",
		},
	}
	deltaJSON, _ := json.Marshal(edits)

	_, err := applyDelta(base, deltaJSON)
	if err == nil {
		t.Fatal("expected error for invalid span, got nil")
	}
}

func TestChecksumDeployment(t *testing.T) {
	data := []byte(`{"hello":"world"}`)
	hash := checksumDeployment(data)

	if len(hash) != 64 {
		t.Errorf("expected 64-char hex hash, got %d chars: %s", len(hash), hash)
	}

	hash2 := checksumDeployment(data)
	if hash != hash2 {
		t.Errorf("hash should be deterministic: %s != %s", hash, hash2)
	}

	hash3 := checksumDeployment([]byte(`{"hello":"other"}`))
	if hash == hash3 {
		t.Error("different data should produce different hashes")
	}
}

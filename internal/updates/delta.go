package updates

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// textEditPoint is the wire format for a gotextdiff span point.
type textEditPoint struct {
	Line   int `json:"line"`
	Column int `json:"column"`
	Offset int `json:"offset"`
}

// textEditSpan is the wire format for a gotextdiff span.
type textEditSpan struct {
	URI   string        `json:"uri"`
	Start textEditPoint `json:"start"`
	End   textEditPoint `json:"end"`
}

// textEdit is the wire format for a gotextdiff TextEdit.
type textEdit struct {
	Span    textEditSpan `json:"Span"`
	NewText string       `json:"NewText"`
}

// applyDelta parses a JSON-encoded array of text edits and applies them to the
// base deployment, returning the resulting deployment. The edits use byte offsets
// to specify replacement spans — the same format the Pulumi CLI produces via
// the gotextdiff library.
func applyDelta(base []byte, deltaJSON json.RawMessage) ([]byte, error) {
	var edits []textEdit
	if err := json.Unmarshal(deltaJSON, &edits); err != nil {
		return nil, fmt.Errorf("unmarshal delta edits: %w", err)
	}

	if len(edits) == 0 {
		result := make([]byte, len(base))
		copy(result, base)
		return result, nil
	}

	sort.Slice(edits, func(i, j int) bool {
		return edits[i].Span.Start.Offset < edits[j].Span.Start.Offset
	})

	var b strings.Builder
	b.Grow(len(base))
	last := 0

	for _, edit := range edits {
		start := edit.Span.Start.Offset
		end := edit.Span.End.Offset

		if start < last || start > len(base) || end > len(base) || end < start {
			return nil, fmt.Errorf("invalid edit span [%d:%d] for base of length %d (last=%d)", start, end, len(base), last)
		}

		if start > last {
			b.Write(base[last:start])
		}
		b.WriteString(edit.NewText)
		last = end
	}

	if last < len(base) {
		b.Write(base[last:])
	}

	return []byte(b.String()), nil
}

// checksumDeployment computes the SHA-256 hex digest of a deployment blob.
func checksumDeployment(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

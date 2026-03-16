#!/usr/bin/env sh
# Regenerate TypeScript types from the Pulumi Go SDK apitype package.
# Usage: sh packages/types/tygo/generate.sh (or: bun run types:generate)
set -eu

TYGO_DIR="$(cd "$(dirname "$0")" && pwd)"
GEN_FILE="$TYGO_DIR/../src/pulumi.gen.ts"

# Resolve dependencies and generate TypeScript types
cd "$TYGO_DIR"
go mod tidy
tygo generate

# Extract SDK version from go.mod for the header comment
SDK_VERSION=$(grep 'github.com/pulumi/pulumi/sdk/v3' "$TYGO_DIR/go.mod" | head -1 | awk '{print $2}')

# Inject SDK version into the generated header
sed -i.bak "s|// Pulumi SDK version is read from packages/types/tygo/go.mod|// Pulumi SDK ${SDK_VERSION}|" "$GEN_FILE"

# Fix UpdateStatus type — tygo generates a narrow union but the protocol uses arbitrary strings
sed -i.bak 's/export type UpdateStatus = typeof UpdateStatusSucceeded | typeof UpdateStatusFailed | typeof UpdateStatusCancelled;/export type UpdateStatus = string;/' "$GEN_FILE"

# Clean up sed backup files (needed for cross-platform compat: macOS + GNU sed)
rm -f "$GEN_FILE.bak"

echo "✓ Generated $GEN_FILE from Pulumi SDK $SDK_VERSION"

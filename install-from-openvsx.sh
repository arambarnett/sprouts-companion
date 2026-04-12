#!/usr/bin/env bash
# Install / upgrade Sprouts Companion from Open VS X (latest published .vsix).
# Requires: curl, node. Then reload the editor: Developer → Reload Window.
set -euo pipefail

API_URL="https://open-vsx.org/api/sprouts/sprouts-companion/latest"
TMP="${TMPDIR:-/tmp}/sprouts-companion-latest.vsix"

echo "→ Fetching latest version metadata from Open VS X…"
VSIX_URL=$(curl -fsSL "$API_URL" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).downloads.universal")

echo "→ Downloading VSIX…"
curl -fsSL -o "$TMP" "$VSIX_URL"

try_cursor_app() {
  local exe="/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
  if [[ -x "$exe" ]]; then
    echo "→ Installing with Cursor (macOS app)…"
    "$exe" --install-extension "$TMP"
    echo "→ Done. In Cursor: Developer → Reload Window"
    exit 0
  fi
}

try_cursor_app

if command -v cursor &>/dev/null; then
  echo "→ Installing with cursor (PATH)…"
  cursor --install-extension "$TMP"
  echo "→ Done. Developer → Reload Window"
  exit 0
fi

if command -v code &>/dev/null; then
  echo "→ Installing with code…"
  code --install-extension "$TMP"
  echo "→ Done. Developer → Reload Window"
  exit 0
fi

echo "Could not find Cursor or VS Code CLI."
echo "Install manually: Editor → Install from VSIX… → $TMP"
exit 1

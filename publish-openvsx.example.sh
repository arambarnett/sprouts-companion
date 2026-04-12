#!/usr/bin/env bash
# Publish Sprouts Companion to Open VSX.
# 1. Create a PAT at https://open-vsx.org/ (Profile → Access Tokens).
# 2. export OPEN_VSX_PAT='ovsxat_...'   # never commit this
# 3. First time only: create the publisher namespace (once per publisher):
#    npx ovsx@0.10.0 create-namespace sprouts -p "$OPEN_VSX_PAT"
#    (Use Node 20+ if global `ovsx` fails with @node-rs/crc32 — prefer npx as below.)
# 4. chmod +x publish-openvsx.example.sh && ./publish-openvsx.example.sh
set -euo pipefail
cd "$(dirname "$0")"
if [[ -z "${OPEN_VSX_PAT:-}" ]]; then
  echo "export OPEN_VSX_PAT first (never commit it)." >&2
  exit 1
fi
npm run compile
npm run bundle-mcp
npm run bundle-pixel-sprite
npx @vscode/vsce package --no-dependencies
VSIX=$(ls -t sprouts-companion-*.vsix 2>/dev/null | head -1)
if [[ -z "$VSIX" ]]; then
  echo "No sprouts-companion-*.vsix found after package." >&2
  exit 1
fi
echo "Publishing $VSIX ..."
# ovsx@0.10.x avoids broken native crc32 bindings on some Node 22 + global installs
npx ovsx@0.10.0 publish "$VSIX" -p "$OPEN_VSX_PAT"

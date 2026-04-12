# Public mirror notes

This directory is a **snapshot** of `extensions/sprouts-companion` from the Sprouts monorepo, produced for **public audit / marketplace forms** (e.g. Cursor publisher link).

## Regenerate

From the monorepo root:

```bash
./scripts/export-sprouts-companion-public-mirror.sh /path/to/your/public/clone
```

Default output if you omit the path: `../sprouts-companion-public` (sibling of the monorepo folder).

## Build verification

After `npm install`:

- `npm run compile`
- `npm run bundle-mcp` (writes `mcp/sprouts-mcp.cjs` — excluded from mirror export by default)
- `npm run verify-extension` (optional)

## Distribution

- **Open VS X:** [sprouts.sprouts-companion](https://open-vsx.org/extension/sprouts/sprouts-companion)
- **Product:** https://getsprouts.io

Last export: 2026-04-12T19:55Z

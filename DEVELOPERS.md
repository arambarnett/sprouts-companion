# Sprouts Companion — maintainer notes

Internal use: F5 debugging, bundling, Open VS X publish, and backend requirements. **End users** should read [README.md](./README.md).

## Develop

**Test locally before publishing (recommended):**

1. `cd extensions/sprouts-companion && npm install && npm run compile && npm run bundle-mcp && npm run bundle-pixel-sprite`
2. Open Cursor on **either** the repo root **`sprouts`** or only **`extensions/sprouts-companion`**.
3. Press **F5** — pick **Sprouts Companion: Run Extension** if the workspace is the monorepo root, or **Run Extension** if the workspace is the extension folder alone. A new **Extension Development Host** window loads **this dev build** (not the marketplace copy).

   If you use the monorepo root but run **Run Extension** with `extensionDevelopmentPath` = repo root, **nothing loads** (there is no extension at the repo root).
4. In that window: after a few seconds the extension should write **`.cursor/mcp.json`** in **whatever folder is the workspace** (repo root vs `extensions/sprouts-companion` are different paths). **Reload** when prompted, then check **Tools & MCP** for **sprouts**. Requires `npm run bundle-mcp` so `mcp/sprouts-mcp.cjs` exists.
5. Check the **left activity bar** for Sprouts, open **Companion**, confirm the webview renders.
6. If something breaks, use **Help → Toggle Developer Tools** in the **host** window and check **Console** for webview errors.

That way you verify icons + sidebar + scripts **before** `npm run package` and Open VS X publish.

**Branding:** **Activity bar + mini panel:** `media/activity-bar-outline.svg` (stroke `currentColor`, theme-safe). Do **not** use opaque RGB PNGs without alpha here — Cursor/VS Code show a gray square. **Open VS X / marketplace icon:** `media/marketplace-icon.png` (128×128). **Filled glyph PNG:** `npm run rasterize-icons` writes `activity-bar-icon.png` from `sprouts-activity-icon.svg`. Legacy `activity-bar-filled.png` is a 28×28 RGBA sprout outline (white on transparent) for local experiments only, not referenced by `package.json`.

```bash
cd extensions/sprouts-companion
npm install
npm run rasterize-icons     # when sprouts-activity-icon.svg changed — regenerates PNGs
npm run compile
npm run bundle-mcp          # required for F5 / MCP setup — bundles ../../packages/sprouts-mcp
npm run bundle-pixel-sprite # procedural sprite pipeline → media/dist/sprouts-pixel.js (runs on vscode:prepublish)
npm run verify-extension    # after prepublish: confirms icons, bundles, webviews exist
```

Optional (not shipped in VSIX): `npm run sync-3d-models` and `npm run bundle-viewport` for local Three.js experiments. GLBs under `media/models/` are **gitignored** and listed in **`.vscodeignore`** so they never ship in the Open VS X package.

**Version bump** (before packaging): from `extensions/sprouts-companion`, run `npm run version:patch` (or `version:minor` / `version:major`). That only edits `package.json`; use plain `npm version patch` if you want a git commit + tag.

Open the right workspace and press **F5** as in step 3 above.

**README screenshots:** In the screenshot table, use **public HTTPS URLs** — e.g. **`https://getsprouts.io/product/ide-companion-*.png`** (same assets as `website/public/product/`, kept in sync with `media/screenshots/`). Open VS X does not load **relative** `./media/...` paths, and **`raw.githubusercontent.com`** returns **404** for **private** repos when the marketplace fetches images without authentication.

## Public mirror repo (Cursor marketplace / audit)

Cursor’s publisher form asks for a **public GitHub URL** for the plugin. If the main monorepo stays private, generate a **snapshot** of this extension and push it to a **separate public repo** (do not commit the mirror inside the monorepo).

From the **monorepo root**:

```bash
chmod +x scripts/export-sprouts-companion-public-mirror.sh
./scripts/export-sprouts-companion-public-mirror.sh
```

By default this writes **`../sprouts-companion-public/`** next to your `sprouts` folder. Or pass a path: `./scripts/export-sprouts-companion-public-mirror.sh ~/src/sprouts-companion-public`.

Then `cd` into that folder, `git init`, create a **public** repo on GitHub, and push. The export **excludes** `node_modules`, `out`, `*.vsix`, and `mcp/sprouts-mcp.cjs` (run `npm run bundle-mcp` after `npm install` to reproduce the MCP bundle). See generated **`SYNC.md`** in the export.

Re-run the script before major submissions so the public tree matches the version you ship.

## Publish (Open VS X)

**Never commit** your Open VS X personal access token. Create one at [open-vsx.org](https://open-vsx.org/) → Profile → **Access Tokens**. Claim the **`sprouts`** publisher namespace (or change `publisher` in `package.json`).

**Before publishing:** bump `version` in this folder’s `package.json`, update `CHANGELOG.md`, then publish. `vscode:prepublish` runs compile, MCP bundle, and pixel sprite bundle.

### CI publish (GitHub Actions → Open VS X)

1. Add `OPEN_VSX_PAT` to `backend/.env` or `backend/_env` (see `backend/.env.example`).
2. One-time: from repo root, `node backend/scripts/sync-openvsx-github-secret.cjs` (requires `gh auth login`) so the **GitHub Actions secret** `OPEN_VSX_PAT` is set.
3. Trigger **Publish extension (Open VS X)** in the repo’s **Actions** tab (**Run workflow**), or push tag `companion-v*` (e.g. after bumping `package.json`, `git tag companion-v0.5.37 && git push origin companion-v0.5.37`). The workflow packages `extensions/sprouts-companion` and runs `ovsx publish` with `--skip-duplicate`.

### Scripted (example)

```bash
export OPEN_VSX_PAT='ovsxat_...'   # not stored in git
chmod +x publish-openvsx.example.sh
./publish-openvsx.example.sh
```

### Manual

```bash
npm run compile
npm run bundle-mcp
npm run bundle-pixel-sprite
npm run verify-extension
npx --yes @vscode/vsce package --no-dependencies
npx --yes ovsx@0.10.0 publish sprouts-companion-0.5.13.vsix -p "$OPEN_VSX_PAT"
```

(Replace the `.vsix` filename with the version produced by `vsce`.)

Install locally without publishing: **Extensions: Install from VSIX…**.

## Backend requirements (for a working Sprouts stack)

- Backend with `IDE_JWT_SECRET` and `IDE_CONNECT_BASE_URL` set, and DB migration `ide_device_sessions` applied.
- Website `/ide/connect` deployed at the URL configured in `IDE_CONNECT_BASE_URL`.

Arena / PvP / friends / matchmaking require the Express **`/api/ide/...`** routes on the API host users point **Sprouts: API URL** at (not a static or Next-only host without those routes).

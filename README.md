# Sprouts Companion (Cursor / VS Code)

**Sprouts** is a **lightweight pixel pet game** that lives next to your code. You **sign in** once, then raise a **Sprout**: care for it with **Feed**, buy **mystery eggs** and **incubators**, and **hatch** when the extension credits a **git commit**—the server picks a fun random name you can change anytime. Each Sprout has **DNA stats** you improve with attribute points as you **level up** (XP from gameplay; growth stages and grades unlock over time). You always see a sharp **procedural 64×64 sprite** (species, mood, vitals, egg/incubator when relevant).

**Sprout Arena** (editor panel + **Arena** tab in the sidebar): turn-based battles using your Sprout’s stats—**CPU practice** runs locally; **PvP** adds friends, email challenges, and matchmaking when your API supports it. You can **retreat** from a fight; that costs **half your current Feed** (rounded down), enforced on the server when you’re online.

**Cursor Chat:** Enable the bundled **sprouts** MCP server (**Tools & MCP**) and the **sprouts** skill so the model can call `sprouts_list` / `sprouts_get` and talk **in character** using your Sprout’s **personality** from the API.

**UI:** Sidebar **Companion**, **Mini** panel (quick peek + shortcuts), status bar heart, optional **greetings** / **notify on save**, **Compact** mode.

## Screenshots

<!-- Open VS X loads README images without GitHub auth; raw.githubusercontent.com 404s for private repos. Host copies on the public site (kept in sync with media/screenshots/). -->
| Sidebar companion | Mini panel (bottom) | Sprout Arena |
| --- | --- | --- |
| ![Sprouts sidebar with sprout profile, vitals, and chat actions](https://getsprouts.io/product/ide-companion-sidebar.png) | ![Sprouts mini panel with spirit preview and shortcuts](https://getsprouts.io/product/ide-companion-mini.png) | ![Sprout Arena turn-based battle in an editor tab](https://getsprouts.io/product/ide-companion-arena.png) |

## How to install (everyone)

The extension is published on **[Open VS X](https://open-vsx.org/extension/sprouts/sprouts-companion)** as a **`.vsix`**. Cursor often **does not** list it in the Extensions search, so most people install by **script** (downloads latest VSIX), **Install from VSIX…**, or a direct **Download** from the Open VS X page. You only need to do this **once** (or again when you want an upgrade).

### Easiest: install from the terminal (Cursor / VS Code)

From **any** directory (needs **curl** + **Node** on PATH):

```bash
bash /path/to/sprouts/extensions/sprouts-companion/install-from-openvsx.sh
```

If you already cloned the repo, run it from there. It downloads the **latest** `.vsix` from Open VS X and runs **`cursor`** or **`code --install-extension`**. Then **Developer: Reload Window**.

**No clone?** Save [install-from-openvsx.sh](https://github.com/arambarnett/sprouts/raw/master/extensions/sprouts-companion/install-from-openvsx.sh) (Raw from GitHub) and `bash install-from-openvsx.sh`, or use **Install from VSIX…** with the file from Open VS X.

### GUI

| Editor | What works |
|--------|------------|
| **Cursor** | Search often **won’t** list this extension. **⌘⇧P** → **Extensions: Install from VSIX…** → download **.vsix** from the [Open VS X page](https://open-vsx.org/extension/sprouts/sprouts-companion) (**Download**). |
| **VS Code (Microsoft)** | Marketplace is **Microsoft’s** — Sprouts won’t appear in search. Same **Install from VSIX…** flow, or **VSCodium** (Open VS X gallery). |
| **Google Antigravity** | VS Code–compatible IDE; use **Install from VSIX…** with the Open VS X **.vsix** (or your gallery if Open VSX is enabled), same as VS Code when the extension ID isn’t built-in. |

`cursor --install-extension sprouts.sprouts-companion` **does not** pull from Open VS X in most setups (unresolved id). Use the **VSIX** (script or download).

### Auto-update vs “I’m stuck on an old version”

- **Reloading the window** does **not** by itself download a new extension build.
- **Auto Update** in Extensions only helps when the editor is updating from a **marketplace gallery** that serves this extension. **VSIX installs** are often treated as **manual** — Cursor may **not** bump you from 0.3.3 → 0.3.4 automatically.
- **To upgrade:** run **`install-from-openvsx.sh`** again, or **Install from VSIX…** with the new file, or **Check for Extension Updates** if your build supports Open VS X for this package.

**`sprouts-cli`** (`npx sprouts-cli login`) is only for **sign-in / API tokens**, not for installing the extension.

**GitHub:** The extension installs from **Open VS X** (the `.vsix` file). You do **not** need to push to GitHub for users to install or upgrade. Pushing to GitHub only matters for the **Updates** banner (GitHub Releases) and clone-based workflows.

### Cursor plugin marketplace (publisher application)

Cursor’s **Become a plugin publisher** form asks for a **public GitHub repository** containing the plugin so reviewers can read the source. Options:

1. Make the monorepo (or a fork) **public** and submit a link that highlights the extension tree, e.g. `https://github.com/<you>/sprouts/tree/master/extensions/sprouts-companion`, or  
2. Publish a **small public mirror** repo: from the monorepo root run **`./scripts/export-sprouts-companion-public-mirror.sh`** (see **[DEVELOPERS.md](./DEVELOPERS.md)** → *Public mirror repo*), then push the output folder to a **public** GitHub repo and submit that URL.

Keep secrets out of the repo; use env vars / Supabase Dashboard for keys. Contact: **marketplace-publishing@cursor.com** (per Cursor’s form).

### No sprout icon / no sidebar (Cursor)

1. **Developer → Reload Window** after installing or upgrading the VSIX.
2. **⌘⇧P** → **Sprouts: Open Companion (sidebar)** (works even when the activity bar icon is missing).
3. **⌘⇧P** → **Sprouts: Set up Cursor (MCP + skill in this workspace)** — writes `.cursor/mcp.json`; you do **not** need the sidebar for MCP setup.
4. **View** (menu bar) → Sprouts entries: open Companion, MCP setup, Mini, Sign in, **Open Cursor Chat**.
5. **View → Appearance**: confirm the **activity bar** is visible; **right‑click** the activity bar and ensure **Sprouts** is checked.
6. Status bar **♥ Sprouts** (when the extension is running): click to open the **Mini** panel.
7. If things feel broken, remove stale copies under `~/.cursor/extensions/` (`sprouts.sprouts-companion-*`), keeping only the newest, or run `cursor --uninstall-extension sprouts.sprouts-companion` and install again.

## Simplest path (after install)

1. Run `npx sprouts-cli login` and finish sign-in in the browser (token is saved under `~/.sprouts/`).
2. **Open any folder as a workspace.** By default the extension **writes** `.cursor/mcp.json` and `.cursor/skills/sprouts/` after a short delay so **sprouts** shows up under **Settings → Tools & MCP** (you still **turn the server on**). You’ll get a toast with **Reload Window** — use it so Cursor picks up the new MCP entry.
3. Optional: **MCP + skill** in the Companion, or **⌘⇧P** → **Sprouts: Set up Cursor**, if you turned off auto-install (**Sprouts: Auto install workspace MCP**) or need to re-run setup.
4. **Reload the window** when prompted (if you skipped it in step 2), then in **Tools & MCP** enable the **sprouts** toggle.
5. Click the **Sprouts** icon on the **far-left** bar. If you do not see it, use the **⌄** on the activity bar and enable **Sprouts**.

**Updates:** use **Updates** in the Companion panel (tries **GitHub Releases** first, then **Open VS X** if GitHub is rate-limited or unreachable) or **⌘⇧P** → **Sprouts: Check for extension updates**. Installing a newer **VSIX** still upgrades the extension without the CLI.

You do **not** need **F5** unless you are **developing** this extension from source (that key runs “Start Debugging” in VS Code/Cursor).

## Cursor Chat / Composer (MCP + skill)

**Bundled:** the VSIX includes `mcp/sprouts-mcp.cjs` (esbuild bundle of [`packages/sprouts-mcp`](../../packages/sprouts-mcp)) and `resources/sprouts.SKILL.md`. **MCP + skill** setup writes them into your workspace `.cursor/` tree.

**Manual / monorepo dev:** you can still point MCP at `packages/sprouts-mcp/dist/index.js` — see [`.cursor/mcp.json.example`](../../.cursor/mcp.json.example). Keep repo [`.cursor/skills/sprouts/SKILL.md`](../../.cursor/skills/sprouts/SKILL.md) aligned with `resources/sprouts.SKILL.md` when you edit the skill.

Use **Open Cursor Chat** in the Companion, **⌘⇧P** → **Sprouts: Open Cursor Chat (talk to your Sprout)**, or the link in **Sprouts Mini**. Then chat normally; the model should call **sprouts** tools for facts. Your **Cursor model picker** chooses the LLM (no server-side Together chat for this flow).

**Sprouts Mini** — bottom panel; status bar **$(heart)** opens Mini (opens **Sprout Arena** in the full editor panel). **Sprouts: Enable greetings** — opt-in daily toast with **Open Cursor Chat**.

## API URL (everyone)

In **Settings → Sprouts → API URL**, set your **Sprouts API** base (no trailing slash).

- **Default:** `https://getsprouts.io` (production; main site serves **`/api/ide/...`**). Override only if you use another host. If you see “web page instead of JSON” or HTML 404, the URL is pointing at a host that does not run the Express API (wrong port or subdomain).
- **Local backend (contributors):** `http://127.0.0.1:3000` when you run `npm run dev` in `backend/`. You can also set `SPROUTS_API_URL` or `~/.sprouts/config.json` (`apiUrl`); see the setting description for resolution order.

## Contributors

**Extension development, bundling, Open VS X publish, and stack requirements** → see **[DEVELOPERS.md](./DEVELOPERS.md)** (not shown on the marketplace overview).

**Run API + website locally** when you test against your own machine:

1. Start the **API** and **website** the way this monorepo documents (repo root / `backend` / `website` READMEs).
2. Point **`IDE_CONNECT_BASE_URL`** at your running **`/ide/connect`** (see `backend/.env.example`).
3. **`npx sprouts-cli login`** against that API if you test the CLI flow.
4. In the extension: **Sprouts: Refresh** if you rely on `~/.sprouts/ide-token.json`.
5. Set **Sprouts: API URL** to your Express API (e.g. `http://127.0.0.1:3000`) so Feed, Store, and Arena see **JSON** from `/api/ide/...`, not an HTML 404 page.

If Supabase OAuth rejects `http://127.0.0.1`, use an HTTPS tunnel for the **connect** page, add that URL to **Supabase Auth → Redirect URLs**, and set **`IDE_CONNECT_BASE_URL`** accordingly.

### Troubleshooting

- **`spawn node ENOENT` (MCP):** Cursor often launches MCP with a minimal `PATH`, so `node` is not found. **Sprouts: Set up Cursor** writes an **absolute** path to `node` when it can detect one (Homebrew: `/opt/homebrew/bin/node`, Intel Mac: `/usr/local/bin/node`). If it still fails, set **Sprouts: Node path** in Settings to your Node binary, then run **MCP + skill** again and reload.
- **Feed / Store: “Unexpected token `<`”:** The API returned **HTML** (wrong **Sprouts: API URL**, API unreachable, or a login/proxy page). Fix **Sprouts: API URL** to a running Sprouts API (yours in prod; local only when **you** are testing the stack).
- **MCP list icon:** Cursor shows a **generic** server avatar for MCP entries; that UI is **not** controlled by `mcp.json` today. Branding is the **Sprouts** activity bar / extension icon after install.

## Legal & transparency

- [Privacy Policy](https://getsprouts.io/privacy)
- [Terms of Service](https://getsprouts.io/terms)
- [Transparency disclosure](https://getsprouts.io/transparency) (GitHub App / IDE integration; data handling summary)

## Commands

- **Sprouts: Sign in** — starts pairing; completes in the browser at `/ide/connect`.
- **Sprouts: Sign out** — clears the stored IDE token. Optional: `npx sprouts-cli logout` removes `~/.sprouts/ide-token.json` if you paired via CLI; you still need **Sign out** in the editor if the extension cached a token.
- **Sprouts: Refresh panel** — reloads sprouts from the API.
- **Sprouts: Toggle compact view** — denser sidebar layout (persisted).
- **Sprouts: Open Cursor Chat (talk to your Sprout)** — focuses Cursor Chat/Composer (use with MCP + skill).
- **Sprouts: Copy API diagnostics** — copies resolved API URL, whether Cursor settings override `~/.sprouts/config.json`, and related hints (use when Feed/Store/Arena return HTML or 404).
- **Sprouts: Open Sprout Arena** — full-size arena panel (CPU practice, PvP hub when the API is reachable).

## Settings

- `sprouts.apiUrl` — **Express backend** base URL (default **`https://getsprouts.io`**). If you point at **port 3001** (Next.js), Feed/Store will show “web page instead of JSON” / 404 — the API is usually **3000** for local `backend/`. **Resolution order:** `SPROUTS_API_URL` env → if you never customized this setting in Cursor, then `~/.sprouts/config.json` `apiUrl` → setting → default. The Companion shows the resolved URL and probes `GET /health` to warn if the host is wrong. If you previously set **`https://api.getsprouts.io`** and see 404/HTML, clear the setting or align it with a host that serves `/api/ide/*`.
- `sprouts.nodePath` — Absolute path to `node` for generated `.cursor/mcp.json` (fixes `spawn node ENOENT` when auto-detect fails), e.g. `/opt/homebrew/bin/node`.
- `sprouts.notifyOnSave` — When true, debounced refresh + occasional toast after file saves (points you to Cursor Chat).
- `sprouts.enableGreetings` — Daily “says hi!” with option to open Chat or Companion.
- `sprouts.autoInstallWorkspaceMcp` — **Default on:** writes `.cursor/mcp.json` + skill into the **opened folder** so **sprouts** appears under Tools & MCP (toggle still off until the user enables it).
- `sprouts.offerWorkspaceSetup` — When auto-install is **off**, one-time toast to confirm MCP + skill setup.

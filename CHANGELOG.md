# Changelog — Sprouts Companion

## 0.5.36

- **Account strip:** **Lv** and lead label use the **selected Sprout** (name + level); streak, XP, pts, and commits stay **account** stats from `/me`.

## 0.5.35

- **Share strip (screenshot card):** Title uses the **selected Sprout’s** name, **level**, and **growth stage** (plus **grade** when not Normal) — not trainer `/me` level or band, so level-ups and picker changes show up when you share.

## 0.5.34

- **Sprout tab → Stats:** **Level up** control for hatched Sprouts (not eggs): spend **Feed + account XP** for **+1 level** (cost scales with current Sprout level). Chooses whichever Sprout is selected in the picker. Backend: shared progression helper with goal-tracked XP so stage/grade/AP stay consistent.

## 0.5.33

- **Open VS X README:** Screenshot table uses **`https://getsprouts.io/product/ide-companion-*.png`** so gallery images load on **private** GitHub repos (`raw.githubusercontent.com` 404s for unauthenticated requests).

## 0.5.32

- **Open VS X README:** Screenshot table now uses **`raw.githubusercontent.com/.../media/screenshots/*.png`** links (marketplace pages do not load relative `./media/...` image paths).
- **Arena hub:** Subtitle **“Silicon Valley Edition”** → **“Beta Build”** (`arena.html`).

## 0.5.31

- **Activity bar / Mini tab icon:** `viewsContainers` icons now use **`media/activity-bar-outline.svg`** (`currentColor`, sprout outline). The previous **`activity-bar-filled.png`** was 28×28 **RGB without alpha**, which composited as a **solid gray block** in Cursor. Regenerated **`activity-bar-filled.png`** as 28×28 **RGBA** (outline only) for asset hygiene; listings still use the SVG path.

## 0.5.30

- **Navigation:** Main sidebar tabs consolidated to **Sprout · Arena · Shop · Settings**. **Shop** groups Care (Feed), Wardrobe, Season, Pass, and Eggs with horizontal scroll; legacy deep links still work. **Arena** tab no longer auto-opens the arena panel (use **Open Sprout Arena**). **Mini** panel: clearer “Open in sidebar” jumps (Care, Wardrobe, Season, Pass, Eggs).
- **Sprout tab:** Contextual **commit/hatch hint** (hidden for hatched pets; shorter text for eggs). **DNA** subtab removed — identity rows (species, NFT, etc.) live under **Stats**. **Vitals · Stats · Moves** only; redundant **stat line** under the sprite hidden when the detail panel is shown. **Composer** area: primary **Open Chat** + **MCP + skill**; long setup copy under **How chat & preview work** (`<details>`).
- **Tabs:** Primary, Shop, and sprout **subtabs** use single-row **horizontal scroll** (+ light scroll snapping) so narrow sidebars don’t wrap.
- **Docs:** Extension **README** screenshot gallery; website **home** and **/docs/ide** use the same product PNGs under `website/public/product/`.

## 0.5.28

- **Arena battle:** Full-width Game Boy field (larger sprites), **Exit** in the header — ends finished battles to menu/hub; during an active battle confirms then **retreats** (half Feed) like the Retreat button. CPU practice shows a short “Preparing battle…” state while loading your move loadout.
- **PvP hub:** Trainer-style hero banner, clearer section titles, card-style friend/challenge rows.
- **Sprout sidebar → Moves tab:** View your four PvP moves, spend **Feed** to assign a move to a slot (40) or train **power** (+8% damage per tier, max 5, 25 Feed/step). Backend stores loadout on `Sprout.idePvpLoadout`; battles use it for **PvP and CPU** (server + client damage math).

## 0.5.27

- **Arena battle UI:** Game Boy–style field (foe top-right / you bottom-left), dual HP bars with numeric HP, ATK, and commit bonus; single-line dialogue that refreshes each beat (no stacked log).
- **Battle sprites:** Attack flashes use the angry mood; KOs use the dead animation.
- **Default API URL:** Production default is **`https://getsprouts.io`** (serves `/api/ide/*`). The previous **`https://api.getsprouts.io`** default could return HTML/404 when that host did not proxy to Express. Bundled MCP fallback matches.

## 0.5.26

- **Season Pass:** UI reflects **$6.99/mo** standard pricing (no intro/Season 2 discount copy); amounts still from API.
- **Package:** Removed unused `media/bear.png` (~1.4 MB). If `sprouts-pixel.js` fails to load, the preview still uses the **🥚** emoji fallback only (`#sprite` legacy img is unused).

## 0.5.25

- **Season Pass copy:** $4/mo Season 1 intro, free core play / cosmetics framing, quarterly seasons and planned Season 2 $6.70/mo note (amounts still come from API).

## 0.5.24

- **GitHub App (Settings):** Install link comes from the API **or** new editor setting **`sprouts.githubAppInstallUrl`** (https only). If neither is set, a short hint explains how to configure the server or settings. Copy clarifies that GitHub is optional when local git sync already credits commits.

## 0.5.23

- **Sidebar header:** Single full-width brand row — title is **Sprouts** or **Sprouts Pro** (gradient) when the Season Pass is active; removed compact toggle, settings gear, and refresh from the header (compact stays via **Sprouts: Toggle compact view**; updates via **Settings → Check for updates**).
- **Stripe:** No long in-panel Stripe warning on reload; disabled Season checkout shows a short **tooltip** on the Season tab CTA instead.

## 0.5.22

- **GitHub App (Settings):** Clearer steps to find the **installation ID**; optional **Install GitHub App (browser)** button when the API returns **`githubAppInstallUrl`** (set **`GITHUB_APP_SLUG`** or **`GITHUB_APP_INSTALL_URL`** on the server).

## 0.5.21

- **Sign out:** Clears **`~/.sprouts/ide-token.json`** as well as the editor secret. Previously the next refresh re-imported the token from that file via `syncIdeTokenFromCliFile`, so the UI stayed signed in after **Sign out**.

## 0.5.20

- **Auth UI:** **Sign in** and **Sign out** in the companion sidebar (under the account strip); messages call the same commands as the palette. Mini panel: **Sign in** on the title starts device sign-in; **Sign out** when signed in; `miniState` includes **`signedIn`** so “no sprout yet” stays distinct from signed out.

## 0.5.17

- **Branding:** Marketplace / Open VSX icon is the Sprouts app art (`sprouts_app_icon.png` → `media/marketplace-icon.png`, 128×128). Activity bar and mini panel use **`media/activity-bar-filled.png`** instead of the outline PNG.
- **Listing:** Shorter `package.json` `description` for the gallery header.

## 0.5.13

- **Activity bar / panel:** Ship **128×128 PNG** icons (`media/activity-bar-icon.png`) from `sprouts-activity-icon.svg` via `rsvg-convert` (`npm run rasterize-icons` — requires [librsvg](https://wiki.gnome.org/Projects/LibRsvg)). `viewsContainers` use PNG so Cursor/VS Code never show an empty/grey slot if SVG masking fails.
- **Marketplace:** `media/marketplace-icon.png` generated the same way (fixes missing `marketplace-icon.png` for Open VS X listing).
- **CI / release:** `npm run verify-extension` checks `main`, contributed icons, MCP bundle, pixel bundle, and webview HTML after `vscode:prepublish`.

## 0.5.12

- **Activity bar / panel:** `viewsContainers` icons pointed at missing `activity-bar-filled.png` (grey square in Cursor/VS Code). Icons now use packaged **`media/sprouts-activity-icon.svg`** (monochrome sprout, `currentColor`). **`sprouts-activity-icon.svg`** stem opacity tightened for a clearer silhouette.

## 0.5.11

- **UI:** Sidebar tab label **Eggs** (incubator flows unchanged internally).
- **Mini:** Tabs **Sprout · Feed · Store · Eggs** jump to the matching sidebar tab; bottom hint explains MCP + skill setup more clearly.
- **Preview:** If `sprouts-pixel.js` does not load, show **🥚** instead of **bear.png** (Companion + Mini). Preview params use no species for signed-out egg so the pixel egg path is consistent.
- **Marketplace:** Extension description adds leveling (XP, level×100 progress model, stages, grades, attribute points), drops the sidebar-LLM aside; README adds **Levels** and streamlines chat setup copy; default **production** API and install steps documented.

## 0.5.9

- **Preview:** signed out or zero sprouts → animated **egg** on canvas (Companion + Mini); bear PNG remains only if `sprouts-pixel.js` fails to load.
- **Death / neglect:** `resolvePetAnimation` now forces **`dead`** when `healthPoints <= 0` or `isDormant` is true, before API mood (so stale “happy” cannot hide the dead pose). Vitals still drive sad/angry from low rest/water/food.

## 0.5.8

- **VSIX size:** `.vscodeignore` excludes `media/models/*.glb`, extra species PNG fallbacks, `media-src/`, `scripts/`, and unused `sprouts-app-icon.png`. Legacy no-pixel fallback uses `bear.png` only.
- **Git:** GLBs and redundant PNGs removed from the repo; `media/models/*.glb` is gitignored (local `sync-3d-models` only).

## 0.5.7

- **Activation:** removed wildcard `*` activation (use `onStartupFinished` + views/commands) to avoid competing with extension host startup and timeouts.
- **Preview:** sprites only — dropped bundled Three.js viewport (`sprouts-viewport.js`, ~600KB) and `vscode:prepublish` GLB sync. Removed `sprouts.assetBaseUrl` setting.
- Optional scripts `bundle-viewport` / `sync-3d-models` remain for local experiments only.

## 0.5.4

- Website: mini-panel product image updated (`ide-companion-mini.png`).
- Docs: production API is intended to run on **Vercel** (serverless); `node-cron` jobs only start when not on Vercel (use Vercel Cron or another scheduler for decay/sync in production).

## 0.5.3

- **Mini panel:** same 3D GLB viewport as Companion (orbit + click reaction), with PNG fallback when WebGL/model is unavailable. Slightly larger preview area (96×96).
- Website: product screenshot `ide-companion-sidebar.png` updated from current UI.

## 0.5.2

- Docs: publishing steps aligned with full VSIX build (MCP + viewport + 3D sync); monorepo `docs/DEPLOYMENT.md`, `docs/PUBLIC_RESOURCES.md`, `docs/CHARACTER_3D_AND_TEXTURES.md`.
- Version bump for Open VS X republish (no breaking API changes vs 0.5.1).
- For install, MCP, and Cursor behavior, see README and [IDE setup](https://github.com/arambarnett/sprouts/tree/master/website/app/docs/ide) (`/docs/ide` when deployed).

## 0.5.1 and earlier

See git history and [Open VS X version list](https://open-vsx.org/extension/sprouts/sprouts-companion).

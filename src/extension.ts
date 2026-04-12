import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

const SECRET_KEY = "sprouts.ideAccessToken";
const MAX_SPROUT_NAME_LEN = 48;
const COMPACT_STATE_KEY = "sprouts.compactView";

const execFileAsync = promisify(execFile);

const IDE_TOKEN_FILE = path.join(os.homedir(), ".sprouts", "ide-token.json");
const SPROUTS_ACTIVITY_VIEW = "workbench.view.extension.sprouts";
const SPROUTS_MINI_PANEL = "workbench.view.extension.sproutsMini";

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function apiUrlResolutionMeta(): {
  userSetInEditor: boolean;
  homeConfigUrl: string | undefined;
} {
  const cfg = vscode.workspace.getConfiguration("sprouts");
  const ins = cfg.inspect<string>("apiUrl");
  const userSetInEditor =
    ins?.globalValue !== undefined ||
    ins?.workspaceValue !== undefined ||
    ins?.workspaceFolderValue !== undefined;
  return { userSetInEditor, homeConfigUrl: readHomeSproutsConfigApiUrl() };
}

function formatApiDiagnosticsText(): string {
  const base = apiUrl();
  const meta = apiUrlResolutionMeta();
  const gh = githubAppInstallUrlFromEditorSettings();
  return [
    "Sprouts API diagnostics",
    `resolvedApiUrl: ${base}`,
    `userSetSproutsApiUrlInEditor: ${meta.userSetInEditor}`,
    `homeConfigJsonApiUrl: ${meta.homeConfigUrl ?? "(none)"}`,
    `SPROUTS_API_URL env: ${process.env.SPROUTS_API_URL ?? "(unset)"}`,
    `editorGithubAppInstallUrl: ${gh ?? "(unset)"}`,
    "",
    "Tip: Feed / Store / rename need Express /api/ide/* on this host (usually port 3000, not Next.js 3001).",
    'Clear "Sprouts: API URL" if it should match ~/.sprouts/config.json from the CLI.',
  ].join("\n");
}

/** Editor fallback when the API omits githubAppInstallUrl (self-host). Must be https. */
function githubAppInstallUrlFromEditorSettings(): string | undefined {
  const v = vscode.workspace.getConfiguration("sprouts").get<string>("githubAppInstallUrl");
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return undefined;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return undefined;
    return t.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function mergeGithubAppInstallUrl(apiValue: string | undefined): string | undefined {
  const fromApi =
    typeof apiValue === "string" && apiValue.trim().length > 0
      ? apiValue.trim().replace(/\/$/, "")
      : undefined;
  return fromApi || githubAppInstallUrlFromEditorSettings();
}

function collectCspExtraOrigins(): string[] {
  const set = new Set<string>();
  for (const raw of [apiUrl()].filter(Boolean) as string[]) {
    try {
      const u = new URL(raw);
      set.add(`${u.protocol}//${u.host}`);
    } catch {
      /* skip */
    }
  }
  return [...set];
}

function buildContentSecurityPolicy(webview: vscode.Webview): string {
  const extra = collectCspExtraOrigins();
  const connect = [webview.cspSource, ...extra, "data:", "blob:"].join(" ");
  const img = [webview.cspSource, ...extra, "https:", "data:"].join(" ");
  return [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `img-src ${img}`,
    `font-src ${webview.cspSource}`,
    `script-src ${webview.cspSource}`,
    `connect-src ${connect}`,
  ].join("; ");
}

async function probeSproutsApiBase(base: string): Promise<{ ok: boolean; hint?: string }> {
  try {
    const res = await fetch(`${base}/health`, { method: "GET" });
    const text = await res.text();
    const t = text.trim();
    if (t.startsWith("<!") || t.toLowerCase().startsWith("<html")) {
      return { ok: false, hint: "This host returned HTML for /health — not the Sprouts Express API." };
    }
    try {
      const j = JSON.parse(text) as { status?: string };
      if (res.ok && j.status === "OK") return { ok: true };
    } catch {
      /* fall through */
    }
    if (!res.ok) return { ok: false, hint: `GET /health returned HTTP ${res.status}.` };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      hint: e instanceof Error ? e.message : "Cannot reach API (network error).",
    };
  }
}

async function getGitHeadSha(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd,
      maxBuffer: 64 * 1024,
    });
    const s = String(stdout).trim();
    if (/^[a-f0-9]{7,64}$/i.test(s)) return s.toLowerCase();
    return null;
  } catch {
    return null;
  }
}

async function tryReportDevGitBonus(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  onAfterGrant?: () => Promise<void>
): Promise<void> {
  const token = await context.secrets.get(SECRET_KEY);
  if (!token) return;
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return;
  const head = await getGitHeadSha(folders[0].uri.fsPath);
  if (!head) return;
  const base = apiUrl();
  try {
    const res = await fetch(`${base}/api/ide/me/dev-activity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ headSha: head }),
    });
    const parsed = await readSproutsApiResponse<{
      granted?: number;
      grantedFeed?: number;
      reason?: string;
      headSha?: string;
      hatched?: boolean;
      sprout?: Record<string, unknown>;
    }>(res, base);
    if (!parsed.ok) return;
    const g = parsed.data.granted ?? 0;
    const gf = parsed.data.grantedFeed ?? 0;
    const parts: string[] = [];
    if (g > 0) parts.push(`+${g} XP`);
    if (gf > 0) parts.push(`+${gf} Feed`);
    if (parts.length > 0) {
      webview.postMessage({
        type: "devActivityToast",
        granted: g,
        message: `Commit bonus: ${parts.join(" · ")} (local git)`,
      });
    }
    if (parsed.data.hatched === true && parsed.data.sprout) {
      webview.postMessage({
        type: "hatchResult",
        ok: true,
        sprout: parsed.data.sprout,
      });
    }
    const shouldRefresh =
      g > 0 || gf > 0 || parsed.data.hatched === true;
    if (shouldRefresh && onAfterGrant) {
      await onAfterGrant();
    }
  } catch {
    /* ignore */
  }
}

function loadWebviewHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  fileBase: "companion" | "mini" | "arena"
): string {
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "companion.css")
  );
  const mediaUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media"));
  const csp = buildContentSecurityPolicy(webview);

  const htmlPath = path.join(context.extensionPath, "media", `${fileBase}.html`);
  let html = fs.readFileSync(htmlPath, "utf8");
  html = html.replace(/__CSP__/g, csp);
  html = html.replace(/__CSS_URI__/g, cssUri.toString());
  html = html.replace(/__MEDIA_BASE__/g, mediaUri.toString());
  html = html.replace(/__MEDIA_ATTR__/g, escapeHtmlAttribute(mediaUri.toString()));

  const pixelJsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "dist", "sprouts-pixel.js")
  );
  html = html.replace(/__PIXEL_JS_URI__/g, pixelJsUri.toString());

  if (fileBase === "companion") {
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "media", "companion-webview.js")
    );
    html = html.replace(/__JS_URI__/g, jsUri.toString());
  } else if (fileBase === "mini") {
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "media", "mini-webview.js")
    );
    html = html.replace(/__MINI_JS_URI__/g, jsUri.toString());
  } else {
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "media", "arena-webview.js")
    );
    html = html.replace(/__ARENA_JS_URI__/g, jsUri.toString());
  }
  return html;
}

async function pushArenaState(
  webview: vscode.Webview,
  context: vscode.ExtensionContext
): Promise<void> {
  await syncIdeTokenFromCliFile(context);
  const token = await context.secrets.get(SECRET_KEY);
  const base = apiUrl();
  if (!token) {
    webview.postMessage({ type: "arenaState", signedIn: false, sprout: null, profile: null });
    return;
  }
  try {
    const [sprRes, meRes] = await Promise.all([
      fetch(`${base}/api/ide/me/sprouts`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${base}/api/ide/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    const parsed = await readSproutsApiResponse<{ sprouts?: Record<string, unknown>[] }>(
      sprRes,
      base
    );
    const meParsed = await readSproutsApiResponse<{
      email?: string | null;
      name?: string | null;
      totalCreditedCommits?: number;
    }>(meRes, base);
    if (!parsed.ok) {
      webview.postMessage({ type: "arenaState", signedIn: true, sprout: null, profile: null });
      return;
    }
    const sprouts = parsed.data.sprouts || [];
    const profile = meParsed.ok
      ? {
          email: meParsed.data.email ?? null,
          name: meParsed.data.name ?? null,
          totalCreditedCommits: meParsed.data.totalCreditedCommits ?? 0,
        }
      : null;
    webview.postMessage({
      type: "arenaState",
      signedIn: true,
      sprout: sprouts[0] ?? null,
      profile,
    });
  } catch {
    webview.postMessage({ type: "arenaState", signedIn: true, sprout: null, profile: null });
  }
}

function openSproutsArenaPanel(context: vscode.ExtensionContext): void {
  const column = vscode.window.activeTextEditor?.viewColumn;
  if (arenaPanel) {
    arenaPanel.reveal(column ?? vscode.ViewColumn.Beside, true);
    void pushArenaState(arenaPanel.webview, context);
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    "sproutsArena",
    "Sprouts Arena",
    { viewColumn: column ?? vscode.ViewColumn.Beside, preserveFocus: false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    }
  );
  arenaPanel = panel;
  panel.webview.html = loadWebviewHtml(context, panel.webview, "arena");
  panel.webview.onDidReceiveMessage(async (msg: unknown) => {
    const m = msg as Record<string, unknown>;
    if (m.type === "arenaReady") {
      await pushArenaState(panel.webview, context);
      return;
    }
    if (m.type === "arenaReloadState") {
      await pushArenaState(panel.webview, context);
      return;
    }
    if (m.type === "companionSignIn") {
      void vscode.commands.executeCommand("sprouts.signIn");
      return;
    }
    if (m.type === "companionSignOut") {
      await vscode.commands.executeCommand("sprouts.signOut");
      return;
    }
    if (m.type === "ideArenaApi" && typeof m.op === "string") {
      await handleIdeArenaApiMessage(panel.webview, context, m, "arenaApiResult");
    }
  });
  panel.onDidDispose(() => {
    arenaPanel = undefined;
  });
}

/** Open Cursor Chat / Composer (no clipboard). Dialogue uses the user’s model + Sprouts MCP + skill. */
async function focusCursorChat(): Promise<void> {
  const tryOpen = [
    "workbench.action.chat.open",
    "composer.startComposerPrompt",
    "aichat.newchataction",
    "cursor.chat.toggle",
  ];
  for (const cmd of tryOpen) {
    try {
      await vscode.commands.executeCommand(cmd);
      return;
    } catch {
      /* try next */
    }
  }
  await vscode.window.showInformationMessage(
    "Sprouts: open Cursor Chat or Composer from the sidebar, then talk to your Sprout — enable the sprouts MCP server and sprouts skill (MCP + skill in the Sprout panel)."
  );
}

type IdeSproutRow = {
  id?: string;
  name?: string;
  species?: string;
  personality?: string | null;
};

function buildSproutComposerPrompt(s: IdeSproutRow): string {
  const name = typeof s.name === "string" && s.name.trim() ? s.name.trim() : "Sprout";
  const species = typeof s.species === "string" && s.species.trim() ? s.species.trim() : "sprout";
  const personality =
    typeof s.personality === "string" && s.personality.trim().length > 0
      ? s.personality.trim()
      : "Be playful, supportive, and brief — you're my coding companion Sprout.";
  return [
    "### Sprouts roleplay (Composer)",
    `You are **${name}**, my ${species} Sprout in the Sprouts game.`,
    "",
    "**Stay in character using this personality:**",
    personality,
    "",
    "---",
    "Use Sprouts MCP tools (`sprouts_list`, `sprouts_get`) when you need live stats, mood, or needs. Reply in first person as this Sprout unless I ask otherwise.",
  ].join("\n");
}

/**
 * Opens Chat/Composer and seeds the model with this sprout’s `personality` from the API when possible.
 * Cursor command IDs vary by version — if none accept a prompt argument, we copy context to the clipboard.
 */
async function openSproutChatWithPersonality(context: vscode.ExtensionContext): Promise<void> {
  const token = await context.secrets.get(SECRET_KEY);
  if (!token) {
    await vscode.window.showWarningMessage(
      "Sprouts: sign in first (device code flow from the Sprout panel)."
    );
    return;
  }
  const base = apiUrl();
  let sprout: IdeSproutRow | null = null;
  try {
    const res = await fetch(`${base}/api/ide/me/sprouts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsed = await readSproutsApiResponse<{ sprouts?: IdeSproutRow[] }>(res, base);
    if (!parsed.ok || !parsed.data.sprouts?.length) {
      await vscode.window.showWarningMessage(
        "Sprouts: no sprout found — hatch or create one in the app first."
      );
      await focusCursorChat();
      return;
    }
    const list = parsed.data.sprouts;
    if (list.length === 1) {
      sprout = list[0] ?? null;
    } else {
      const items = list.map((x) => ({
        label: `${x.name ?? "Sprout"} (${x.species ?? "?"})`,
        sprout: x,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Which Sprout should Composer talk as?",
      });
      sprout = picked?.sprout ?? null;
      if (!sprout) return;
    }
  } catch (e) {
    await vscode.window.showErrorMessage(
      `Sprouts: could not load sprout — ${e instanceof Error ? e.message : "network error"}`
    );
    await focusCursorChat();
    return;
  }

  const prompt = buildSproutComposerPrompt(sprout!);

  const attempts: [string, unknown][] = [
    ["composer.startComposerPrompt", prompt],
    ["workbench.action.chat.open", prompt],
    ["composer.startComposerPrompt", { prompt }],
    ["workbench.action.chat.open", { query: prompt }],
  ];

  for (const [cmd, arg] of attempts) {
    try {
      await vscode.commands.executeCommand(cmd, arg as never);
      return;
    } catch {
      /* try next */
    }
  }

  await vscode.env.clipboard.writeText(prompt);
  await focusCursorChat();
  void vscode.window.showInformationMessage(
    "Sprouts: sprout personality copied to clipboard — paste into Composer (⌘V / Ctrl+V), then chat."
  );
}

async function maybeSproutGreeting(
  context: vscode.ExtensionContext,
  sproutId: string,
  sproutName: string
): Promise<void> {
  const enabled = vscode.workspace.getConfiguration("sprouts").get<boolean>("enableGreetings");
  if (enabled !== true) return;
  if (sproutGreetingBusy) return;
  const key = `sprouts.greeting.${sproutId}`;
  const today = new Date().toISOString().slice(0, 10);
  const last = context.globalState.get<string>(key);
  if (last === today) return;
  sproutGreetingBusy = true;
  try {
    await context.globalState.update(key, today);
    const openChat = "Open Cursor Chat";
    const openCompanion = "Open Sprout";
    const pick = await vscode.window.showInformationMessage(
      `${sproutName} says hi! Chat in Cursor (sprouts MCP + skill).`,
      openChat,
      openCompanion
    );
    if (pick === openChat) {
      await openSproutChatWithPersonality(context);
    } else if (pick === openCompanion) {
      try {
        await vscode.commands.executeCommand(SPROUTS_ACTIVITY_VIEW);
      } catch {
        /* ignore */
      }
    }
  } finally {
    sproutGreetingBusy = false;
  }
}

/** Remove CLI pairing file so Sign out cannot be undone by the next pushState (syncIdeTokenFromCliFile). */
function clearIdeTokenCliFile(): void {
  try {
    if (fs.existsSync(IDE_TOKEN_FILE)) {
      fs.unlinkSync(IDE_TOKEN_FILE);
    }
  } catch {
    /* ignore */
  }
}

async function syncIdeTokenFromCliFile(context: vscode.ExtensionContext): Promise<boolean> {
  try {
    const existing = await context.secrets.get(SECRET_KEY);
    if (existing) return false;
    if (!fs.existsSync(IDE_TOKEN_FILE)) return false;
    const raw = fs.readFileSync(IDE_TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as { access_token?: string };
    if (parsed.access_token?.length) {
      await context.secrets.store(SECRET_KEY, parsed.access_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function revealSproutsCompanion(toast?: string): Promise<void> {
  try {
    await vscode.commands.executeCommand("workbench.action.focusSideBar");
  } catch {
    /* ignore */
  }
  try {
    await vscode.commands.executeCommand(SPROUTS_ACTIVITY_VIEW);
  } catch {
    /* ignore */
  }
  if (toast) {
    vscode.window.showInformationMessage(toast);
  }
}

function readHomeSproutsConfigApiUrl(): string | undefined {
  try {
    const p = path.join(os.homedir(), ".sprouts", "config.json");
    if (!fs.existsSync(p)) return undefined;
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { apiUrl?: string };
    const u = j.apiUrl?.trim().replace(/\/$/, "");
    return u || undefined;
  } catch {
    return undefined;
  }
}

/** API base for all extension fetches. Order: env → Cursor settings if user set them → ~/.sprouts/config.json → default. */
function apiUrl(): string {
  const env = process.env.SPROUTS_API_URL?.trim().replace(/\/$/, "");
  if (env) return env;

  const cfg = vscode.workspace.getConfiguration("sprouts");
  const ins = cfg.inspect<string>("apiUrl");
  const userSetInEditor =
    ins?.globalValue !== undefined ||
    ins?.workspaceValue !== undefined ||
    ins?.workspaceFolderValue !== undefined;

  if (!userSetInEditor) {
    const fromHome = readHomeSproutsConfigApiUrl();
    if (fromHome) return fromHome;
  }

  /** Production API is served on the main site (`/api/*`); `api.getsprouts.io` may not route to Express. */
  const PRODUCTION_API = "https://getsprouts.io";
  return (cfg.get<string>("apiUrl") || PRODUCTION_API).replace(/\/$/, "");
}

/** Resolve absolute `node` for MCP stdio — Cursor often has no Node on PATH (spawn ENOENT). */
function resolveNodeForMcp(): string {
  const raw = vscode.workspace.getConfiguration("sprouts").get<string>("nodePath");
  if (raw?.trim()) {
    const resolved = path.resolve(raw.trim().replace(/^~(?=$|[/\\])/, os.homedir()));
    if (fs.existsSync(resolved)) return resolved;
  }
  for (const c of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) {
    if (fs.existsSync(c)) return c;
  }
  const home = os.homedir();
  const pathAug = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".fnm", "aliases", "default", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".nvm", "current", "bin"),
  ].join(path.delimiter);
  try {
    const out = execSync("command -v node", {
      encoding: "utf8",
      env: { ...process.env, PATH: `${pathAug}${path.delimiter}${process.env.PATH || ""}` },
    }).trim();
    if (out && fs.existsSync(out)) return out;
  } catch {
    /* ignore */
  }
  return "node";
}

/** Extra hint when the configured URL is the Next app or another non-API server. */
function apiUrlDiagnostics(apiBase: string, status: number): string {
  const hints: string[] = [];
  if (/:3001\b/.test(apiBase)) {
    hints.push(
      "Port 3001 is usually the Next.js frontend. Set Sprouts: API URL to http://127.0.0.1:3000 (run npm run dev in backend/)."
    );
  }
  if (status === 404) {
    hints.push(
      "404 + HTML means this host is not serving `/api/ide/…` (wrong port or not the Express API)."
    );
    hints.push(
      'Cursor setting "Sprouts: API URL" overrides ~/.sprouts/config.json when set — clear it or set both to your Express URL (e.g. http://127.0.0.1:3000).'
    );
  }
  return hints.length ? ` ${hints.join(" ")}` : "";
}

/** Parse JSON bodies; treat HTML (wrong host / 404 page) as a clear error. */
async function readSproutsApiResponse<T>(
  res: Response,
  apiBase: string
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html")) {
    return {
      ok: false,
      error: `Got a web page instead of JSON — is the API running at ${apiBase}? (HTTP ${res.status})${apiUrlDiagnostics(apiBase, res.status)}`,
    };
  }
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    return {
      ok: false,
      error: `Invalid JSON (HTTP ${res.status}): ${trimmed.slice(0, 100)}${trimmed.length > 100 ? "…" : ""}${apiUrlDiagnostics(apiBase, res.status)}`,
    };
  }
  if (!res.ok) {
    const err = (data as { error?: string }).error;
    return { ok: false, error: err || `HTTP ${res.status}` };
  }
  return { ok: true, data };
}

/** Parse JSON for responses that may be non-2xx but still JSON (e.g. device token polling). */
async function readJsonBodyUnlessHtml<T>(res: Response, apiBase: string): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html")) {
    throw new Error(
      `Got a web page instead of JSON — check ${apiBase} (HTTP ${res.status})${apiUrlDiagnostics(apiBase, res.status)}`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from API (HTTP ${res.status})`);
  }
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function workspaceHasSproutsMcp(workspaceRoot: string): boolean {
  const mcpPath = path.join(workspaceRoot, ".cursor", "mcp.json");
  if (!fs.existsSync(mcpPath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
    return !!(data.mcpServers && data.mcpServers.sprouts);
  } catch {
    return false;
  }
}

/** True when workspace mcp.json points at this extension's bundled MCP (not another install / old VSIX path). */
function workspaceSproutsMcpBundleMatchesExtension(
  workspaceRoot: string,
  extensionPath: string
): boolean {
  const expected = path.normalize(path.join(extensionPath, "mcp", "sprouts-mcp.cjs"));
  const mcpPath = path.join(workspaceRoot, ".cursor", "mcp.json");
  if (!fs.existsSync(mcpPath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
      mcpServers?: { sprouts?: { args?: string[] } };
    };
    const args = data.mcpServers?.sprouts?.args;
    if (!Array.isArray(args) || typeof args[0] !== "string") return false;
    return path.normalize(args[0]) === expected;
  } catch {
    return false;
  }
}

function mergeWorkspaceMcpJson(
  workspaceRoot: string,
  extensionPath: string,
  apiBase: string
): void {
  const cursorDir = path.join(workspaceRoot, ".cursor");
  const mcpPath = path.join(cursorDir, "mcp.json");
  let data: { mcpServers?: Record<string, unknown> } = {};
  if (fs.existsSync(mcpPath)) {
    try {
      data = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as { mcpServers?: Record<string, unknown> };
    } catch {
      data = {};
    }
  }
  if (!data.mcpServers || typeof data.mcpServers !== "object") {
    data.mcpServers = {};
  }
  const bundle = path.join(extensionPath, "mcp", "sprouts-mcp.cjs");
  const nodeBin = resolveNodeForMcp();
  data.mcpServers.sprouts = {
    command: nodeBin,
    args: [bundle],
    env: {
      SPROUTS_API_URL: apiBase,
    },
  };
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(mcpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

type ApplyWorkspaceMcpResult =
  | { ok: true; nodeForMcp: string }
  | { ok: false; error: string; silent?: boolean };

/** Writes skill + merged mcp.json for workspace folder [0]. No UI. */
function applyWorkspaceMcpAndSkillFiles(context: vscode.ExtensionContext): ApplyWorkspaceMcpResult {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return { ok: false, error: "no folder", silent: true };
  }
  const root = folders[0].uri.fsPath;
  const extRoot = context.extensionPath;
  const bundle = path.join(extRoot, "mcp", "sprouts-mcp.cjs");
  if (!fs.existsSync(bundle)) {
    return {
      ok: false,
      error:
        "Sprouts: MCP bundle missing. From the repo run: cd extensions/sprouts-companion && npm run bundle-mcp — or reinstall the VSIX.",
    };
  }
  const skillSrc = path.join(extRoot, "resources", "sprouts.SKILL.md");
  if (!fs.existsSync(skillSrc)) {
    return { ok: false, error: "Sprouts: bundled skill missing — reinstall the extension." };
  }
  const skillDir = path.join(root, ".cursor", "skills", "sprouts");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(skillSrc, path.join(skillDir, "SKILL.md"));
  const nodeForMcp = resolveNodeForMcp();
  mergeWorkspaceMcpJson(root, extRoot, apiUrl());
  return { ok: true, nodeForMcp };
}

async function showMcpSetupCompleteDialog(nodeForMcp: string): Promise<void> {
  const reload = "Reload Window";
  const help = "MCP docs";
  const nodeHint =
    nodeForMcp === "node"
      ? " If MCP shows spawn node ENOENT, set Sprouts: Node path to your Node binary (e.g. /opt/homebrew/bin/node) and run MCP + skill again."
      : "";
  const pick = await vscode.window.showInformationMessage(
    `Sprouts: wrote .cursor/mcp.json (node: ${nodeForMcp}) and .cursor/skills/sprouts/SKILL.md. Reload Cursor, enable the sprouts MCP server, then talk to your Sprout in Cursor Chat.${nodeHint}`,
    reload,
    help
  );
  if (pick === reload) {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
  if (pick === help) {
    await vscode.env.openExternal(vscode.Uri.parse("https://docs.cursor.com/context/mcp"));
  }
}

async function setupWorkspaceMcpAndSkill(context: vscode.ExtensionContext): Promise<boolean> {
  const applied = applyWorkspaceMcpAndSkillFiles(context);
  if (!applied.ok) {
    if (!applied.silent) {
      vscode.window.showErrorMessage(applied.error);
    } else {
      vscode.window.showErrorMessage(
        "Sprouts: open a folder first, then use MCP + skill or the command Sprouts: Set up Cursor (MCP + skill in this workspace)."
      );
    }
    return false;
  }
  await context.workspaceState.update("sprouts.didWorkspaceSetup", true);
  await showMcpSetupCompleteDialog(applied.nodeForMcp);
  return true;
}

async function checkExtensionUpdates(
  context: vscode.ExtensionContext,
  webview?: vscode.Webview
): Promise<void> {
  const current = context.extension.packageJSON.version as string;
  const pkg = context.extension.packageJSON as { repository?: { url?: string } };
  let owner = "arambarnett";
  let repo = "sprouts";
  const u = pkg.repository?.url || "";
  const gh = u.match(/github\.com[/:]([^/]+)\/([^/.\s]+)/i);
  if (gh) {
    owner = gh[1];
    repo = gh[2].replace(/\.git$/i, "");
  }
  const apiUrlGh = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const fallbackRelease = `https://github.com/${owner}/${repo}/releases/latest`;
  const openVsxLatest = "https://open-vsx.org/api/sprouts/sprouts-companion/latest";
  const openVsxPage = "https://open-vsx.org/extension/sprouts/sprouts-companion";

  type Source = "github" | "openvsx";
  const tryGitHub = async (): Promise<{ tag: string; url: string } | null> => {
    const res = await fetch(apiUrlGh, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "sprouts-companion-extension",
      },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { tag_name?: string; html_url?: string };
    const tag = (j.tag_name || "").replace(/^v/i, "").trim();
    if (!tag) return null;
    return { tag, url: j.html_url || fallbackRelease };
  };

  const tryOpenVsx = async (): Promise<{ tag: string; url: string } | null> => {
    const res = await fetch(openVsxLatest, {
      headers: { Accept: "application/json", "User-Agent": "sprouts-companion-extension" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { version?: string };
    const tag = (j.version || "").trim();
    if (!tag) return null;
    return { tag, url: openVsxPage };
  };

  try {
    let info = await tryGitHub();
    let source: Source = "github";
    if (!info) {
      info = await tryOpenVsx();
      source = "openvsx";
    }
    if (!info) throw new Error("no registry");

    const cmp = compareSemver(info.tag, current);
    const releaseUrl = info.url;
    if (webview) {
      webview.postMessage({
        type: "updateCheckResult",
        current,
        latest: info.tag,
        newer: cmp > 0,
        url: releaseUrl,
        source,
      });
    } else if (cmp > 0) {
      const open = "Open release";
      const x = await vscode.window.showInformationMessage(
        `Sprouts Companion ${info.tag} is available (installed: ${current}).`,
        open
      );
      if (x === open) {
        await vscode.env.openExternal(vscode.Uri.parse(releaseUrl));
      }
    } else {
      await vscode.window.showInformationMessage(`Sprouts Companion is up to date (${current}).`);
    }
  } catch {
    if (webview) {
      webview.postMessage({
        type: "updateCheckResult",
        current,
        latest: null,
        newer: false,
        error: true,
      });
    } else {
      vscode.window.showWarningMessage(
        "Sprouts: could not reach GitHub or Open VSX for updates. Install a newer .vsix with Extensions: Install from VSIX… if you have one."
      );
    }
  }
}

async function maybeOfferWorkspaceSetup(context: vscode.ExtensionContext): Promise<void> {
  const offer = vscode.workspace.getConfiguration("sprouts").get<boolean>("offerWorkspaceSetup");
  if (offer === false) return;
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return;
  const root = folders[0].uri.fsPath;
  if (workspaceSproutsMcpBundleMatchesExtension(root, context.extensionPath)) return;

  if (workspaceHasSproutsMcp(root)) {
    await context.workspaceState.update("sprouts.workspaceSetupOffered", false);
    await context.workspaceState.update("sprouts.declinedWorkspaceSetup", false);
    await context.workspaceState.update("sprouts.didWorkspaceSetup", false);
  }

  if (context.workspaceState.get("sprouts.declinedWorkspaceSetup")) return;
  if (context.workspaceState.get("sprouts.workspaceSetupOffered")) return;
  const setup = "Set up MCP + skill";
  const skip = "Not now";
  const pick = await vscode.window.showInformationMessage(
    "Sprouts: install bundled MCP + skill for Cursor Chat / Composer? (writes .cursor/mcp.json and .cursor/skills/sprouts/)",
    setup,
    skip
  );
  await context.workspaceState.update("sprouts.workspaceSetupOffered", true);
  if (pick === setup) {
    await setupWorkspaceMcpAndSkill(context);
  } else if (pick === skip) {
    await context.workspaceState.update("sprouts.declinedWorkspaceSetup", true);
  }
}

/**
 * Cursor lists MCP under Tools & MCP from the **opened folder's** `.cursor/mcp.json`.
 * Auto-install writes that file + the skill so **sprouts** appears without an extra confirmation.
 */
async function maybeAutoInstallOrOfferWorkspaceSetup(context: vscode.ExtensionContext): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return;
  const root = folders[0].uri.fsPath;
  if (workspaceSproutsMcpBundleMatchesExtension(root, context.extensionPath)) return;

  const auto =
    vscode.workspace.getConfiguration("sprouts").get<boolean>("autoInstallWorkspaceMcp") !== false;

  if (auto) {
    const applied = applyWorkspaceMcpAndSkillFiles(context);
    if (applied.ok) {
      await context.workspaceState.update("sprouts.didWorkspaceSetup", true);
      await context.workspaceState.update("sprouts.workspaceSetupOffered", true);
      await context.workspaceState.update("sprouts.declinedWorkspaceSetup", false);
      await showMcpSetupCompleteDialog(applied.nodeForMcp);
      return;
    }
    if (!applied.silent) {
      vscode.window.showErrorMessage(applied.error);
    }
    return;
  }

  await maybeOfferWorkspaceSetup(context);
}

async function startDeviceSignIn(context: vscode.ExtensionContext): Promise<void> {
  const base = apiUrl();
  const startRes = await fetch(`${base}/api/ide/device/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const startParsed = await readSproutsApiResponse<{
    device_code: string;
    verification_uri: string;
    interval?: number;
  }>(startRes, base);
  if (!startParsed.ok) {
    vscode.window.showErrorMessage(`Sprouts: could not start sign-in — ${startParsed.error}`);
    return;
  }
  const start = startParsed.data;
  await vscode.env.openExternal(vscode.Uri.parse(start.verification_uri));
  vscode.window.showInformationMessage(
    "Finish signing in in your browser, then wait — Sprouts will connect automatically."
  );

  const intervalSec = start.interval && start.interval >= 2 ? start.interval : 5;
  const maxWait = 15 * 60 * 1000;
  const t0 = Date.now();

  while (Date.now() - t0 < maxWait) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    const tokenRes = await fetch(`${base}/api/ide/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: start.device_code }),
    });
    let data: { status?: string; access_token?: string; error?: string };
    try {
      data = await readJsonBodyUnlessHtml(tokenRes, base);
    } catch (e) {
      vscode.window.showErrorMessage(
        e instanceof Error ? e.message : "Sprouts: invalid response while pairing"
      );
      return;
    }
    if (tokenRes.status === 410) {
      vscode.window.showErrorMessage(data.error || "Pairing expired. Run Sign in again.");
      return;
    }
    if (data.status === "complete" && data.access_token) {
      await context.secrets.store(SECRET_KEY, data.access_token);
      lastKnownPvpIncomingCount = -1;
      await revealSproutsCompanion("Sprouts: signed in — Sprout panel opened.");
      await companionInstance?.refresh();
      await miniInstance?.refresh();
      return;
    }
  }
  vscode.window.showErrorMessage("Sprouts: sign-in timed out.");
}

let companionInstance: SproutsViewProvider | undefined;
let miniInstance: SproutsMiniViewProvider | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let sproutGreetingBusy = false;
/** Tracks PvP invite count for desktop toasts when new challenges arrive. */
let lastKnownPvpIncomingCount = -1;
let arenaPanel: vscode.WebviewPanel | undefined;

function updatePvpIncomingNotify(count: number): void {
  if (lastKnownPvpIncomingCount < 0) {
    lastKnownPvpIncomingCount = count;
    return;
  }
  if (count > lastKnownPvpIncomingCount && count > 0) {
    void vscode.window
      .showInformationMessage(
        `Sprouts: You have ${count} Arena challenge(s) waiting.`,
        "Open Arena",
        "Show Mini"
      )
      .then((choice) => {
        if (choice === "Open Arena") void vscode.commands.executeCommand("sprouts.openArena");
        else if (choice === "Show Mini") void vscode.commands.executeCommand("sprouts.openMiniPanel");
      });
  }
  lastKnownPvpIncomingCount = count;
}

async function pollPvpInvitesForToast(context: vscode.ExtensionContext): Promise<void> {
  const token = await context.secrets.get(SECRET_KEY);
  if (!token) return;
  const base = apiUrl();
  try {
    const res = await fetch(`${base}/api/ide/me/pvp/invites`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsed = await readSproutsApiResponse<{ incoming?: unknown[] }>(res, base);
    if (!parsed.ok) return;
    const n = parsed.data.incoming?.length ?? 0;
    updatePvpIncomingNotify(n);
  } catch {
    /* ignore */
  }
}

function updateStatusBar(sprout: Record<string, unknown> | null): void {
  if (!statusBarItem) return;
  if (!sprout) {
    statusBarItem.text = "$(heart) Sprouts";
    statusBarItem.tooltip = "Sprouts — sign in from Sprout panel; talk to your Sprout in Cursor Chat (MCP + skill)";
  } else {
    const name = (sprout.name as string) || "Sprout";
    const mood = (sprout.mood as string) || "—";
    const rarity = typeof sprout.rarity === "string" ? sprout.rarity : "";
    statusBarItem.text = `$(heart) ${name}`;
    statusBarItem.tooltip = `Sprouts: ${name}${rarity ? ` · ${rarity}` : ""} · ${mood} — Chat uses MCP + skill for personality`;
  }
  statusBarItem.show();
}

class SproutsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "sprouts.sidebar";
  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async refresh(): Promise<void> {
    if (this.view) {
      await this.pushState(this.view.webview);
    }
  }

  /** After Stripe checkout in browser — webview reloads Feed balance when user returns. */
  notifyWindowFocused(): void {
    this.view?.webview.postMessage({ type: "windowFocused" });
    this.requestDevGitSync();
  }

  /** Ask the webview to run a git HEAD sync for the dev-activity / hatch credit path. */
  requestDevGitSync(): void {
    this.view?.webview.postMessage({ type: "requestDevGitSync" });
  }

  postIdeProgress(kind: string): void {
    this.view?.webview.postMessage({ type: "ideProgress", kind });
  }

  /** Open sidebar to a main tab or legacy id (feed → Shop › Care, etc.). */
  navigateToTab(tab: string): void {
    const allowed = new Set([
      "sprout",
      "arena",
      "shop",
      "feed",
      "store",
      "incubator",
      "wardrobe",
      "season-pass",
      "settings",
    ]);
    if (!allowed.has(tab)) return;
    this.view?.webview.postMessage({ type: "navigateTab", tab });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = loadWebviewHtml(this.context, webviewView.webview, "companion");

    const gitPollMs = 45_000;
    const gitPollTimer = setInterval(() => {
      webviewView.webview.postMessage({ type: "requestDevGitSync" });
    }, gitPollMs);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "ready") {
        await this.pushState(webviewView.webview);
        webviewView.webview.postMessage({ type: "requestDevGitSync" });
      }
      if (msg.type === "syncDevGitBonus") {
        await tryReportDevGitBonus(this.context, webviewView.webview, async () => {
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        });
        return;
      }
      if (msg.type === "toggleCompact") {
        const next = !(this.context.globalState.get(COMPACT_STATE_KEY) === true);
        await this.context.globalState.update(COMPACT_STATE_KEY, next);
        await this.pushState(webviewView.webview);
      }

      if (msg.type === "openCursorChat") {
        await openSproutChatWithPersonality(this.context);
        return;
      }

      if (msg.type === "openArena") {
        void vscode.commands.executeCommand("sprouts.openArena");
        return;
      }

      if (msg.type === "setupCursor") {
        await setupWorkspaceMcpAndSkill(this.context);
        return;
      }
      if (msg.type === "checkUpdates") {
        await checkExtensionUpdates(this.context, webviewView.webview);
        return;
      }
      if (msg.type === "openExternal" && typeof msg.url === "string" && msg.url.length > 0) {
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        return;
      }
      if (msg.type === "companionSignIn") {
        void vscode.commands.executeCommand("sprouts.signIn");
        return;
      }
      if (msg.type === "companionSignOut") {
        await vscode.commands.executeCommand("sprouts.signOut");
        return;
      }

      const token = await this.context.secrets.get(SECRET_KEY);
      const base = apiUrl();

      if (msg.type === "linkGithubInstallation") {
        const rawId = (msg as { installationId?: unknown }).installationId;
        const installationId =
          typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0
            ? rawId
            : typeof rawId === "string" && /^\d+$/.test(rawId.trim())
              ? parseInt(rawId.trim(), 10)
              : NaN;
        if (!token) {
          webviewView.webview.postMessage({
            type: "linkGithubInstallationResult",
            ok: false,
            error: "Not signed in",
          });
          return;
        }
        if (!Number.isFinite(installationId) || installationId <= 0) {
          webviewView.webview.postMessage({
            type: "linkGithubInstallationResult",
            ok: false,
            error: "Enter the numeric installation ID from your GitHub App (URL or API).",
          });
          return;
        }
        try {
          const res = await fetch(`${base}/api/ide/me/github/link-installation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ installationId }),
          });
          const parsed = await readSproutsApiResponse<{
            ok?: boolean;
            error?: string;
            accountLogin?: string;
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "linkGithubInstallationResult",
              ok: false,
              error: parsed.error,
            });
            return;
          }
          const login = parsed.data.accountLogin ?? "";
          webviewView.webview.postMessage({
            type: "linkGithubInstallationResult",
            ok: true,
            accountLogin: login,
            installationId,
          });
          void vscode.window.showInformationMessage(
            login
              ? `GitHub App linked (@${login}). Push events can credit commits.`
              : "GitHub App installation linked. Push events can credit commits."
          );
        } catch (e) {
          webviewView.webview.postMessage({
            type: "linkGithubInstallationResult",
            ok: false,
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (msg.type === "loadFood") {
        if (!token) {
          webviewView.webview.postMessage({ type: "food", error: "Not signed in" });
          return;
        }
        try {
          const res = await fetch(`${base}/api/ide/me/food`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const parsed = await readSproutsApiResponse<{ foodBalance?: number; error?: string }>(
            res,
            base
          );
          if (!parsed.ok) {
            webviewView.webview.postMessage({ type: "food", error: parsed.error });
            return;
          }
          webviewView.webview.postMessage({
            type: "food",
            foodBalance: parsed.data.foodBalance ?? 0,
          });
        } catch (e) {
          webviewView.webview.postMessage({
            type: "food",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (msg.type === "feedStat" && msg.sproutId && msg.statType) {
        if (!token) {
          webviewView.webview.postMessage({ type: "feedResult", error: "Not signed in" });
          return;
        }
        const amount = typeof msg.amount === "number" ? msg.amount : 10;
        try {
          const res = await fetch(`${base}/api/ide/me/feed`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              sproutId: msg.sproutId,
              statType: msg.statType,
              amount,
            }),
          });
          const parsed = await readSproutsApiResponse<{
            error?: string;
            sprout?: Record<string, unknown>;
            foodBalance?: number;
            message?: string;
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "feedResult",
              error: parsed.error,
            });
            return;
          }
          const data = parsed.data;
          webviewView.webview.postMessage({
            type: "feedResult",
            ok: true,
            sprout: data.sprout,
            foodBalance: data.foodBalance,
            message: data.message,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "feedResult",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (msg.type === "reviveSprout" && typeof msg.sproutId === "string") {
        if (!token) {
          webviewView.webview.postMessage({
            type: "reviveResult",
            error: "Not signed in",
          });
          return;
        }
        const cost = typeof msg.cost === "number" && msg.cost > 0 ? msg.cost : 500;
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}/revive`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ cost }),
            }
          );
          const parsed = await readSproutsApiResponse<{
            error?: string;
            message?: string;
            sprout?: Record<string, unknown>;
            newFeedBalance?: number;
            foodBalance?: number;
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "reviveResult",
              error: parsed.error,
            });
            return;
          }
          const data = parsed.data;
          webviewView.webview.postMessage({
            type: "reviveResult",
            message: data.message,
            sprout: data.sprout,
            newFeedBalance: data.newFeedBalance ?? data.foodBalance,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "reviveResult",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (msg.type === "loadShop") {
        if (!token) {
          webviewView.webview.postMessage({
            type: "shop",
            error: "Not signed in",
            stripeConfigured: false,
            seasonPass: null,
          });
          return;
        }
        try {
          const res = await fetch(`${base}/api/ide/me/shop/season1`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const parsed = await readSproutsApiResponse<{
            stripeConfigured?: boolean;
            seasonPass?: {
              name: string;
              description?: string;
              recurring?: boolean;
              priceUsdMonthly?: number;
              billingNote?: string;
            };
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "shop",
              error: parsed.error,
              stripeConfigured: false,
              seasonPass: null,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "shop",
            stripeConfigured: parsed.data.stripeConfigured === true,
            seasonPass: parsed.data.seasonPass ?? null,
          });
        } catch (e) {
          webviewView.webview.postMessage({
            type: "shop",
            error: e instanceof Error ? e.message : "Network error",
            stripeConfigured: false,
            seasonPass: null,
          });
        }
        return;
      }

      if (msg.type === "loadIncubatorTab") {
        if (!token) {
          webviewView.webview.postMessage({
            type: "incubatorTab",
            error: "Not signed in",
            incubatorCatalog: [],
            userIncubators: [],
          });
          return;
        }
        try {
          const [incShopRes, incMineRes] = await Promise.all([
            fetch(`${base}/api/ide/me/shop/incubators`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${base}/api/ide/me/incubators`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);
          const incShopParsed = await readSproutsApiResponse<{
            incubators?: {
              type: string;
              name: string;
              feedCost: number;
              speedBoost: number;
              maxUses: number;
              usesLabel: string;
              purchasableWithFeed: boolean;
            }[];
          }>(incShopRes, base);
          const incMineParsed = await readSproutsApiResponse<{
            incubators?: {
              id: string;
              type: string;
              speedBoost: number;
              maxUses: number;
              currentUses: number;
              isActive: boolean;
              remainingUses: number | string;
            }[];
          }>(incMineRes, base);
          const incubatorCatalog = incShopParsed.ok ? incShopParsed.data.incubators || [] : [];
          const userIncubators = incMineParsed.ok ? incMineParsed.data.incubators || [] : [];
          const parts: string[] = [];
          if (!incShopParsed.ok) parts.push(incShopParsed.error);
          if (!incMineParsed.ok) parts.push(incMineParsed.error);
          webviewView.webview.postMessage({
            type: "incubatorTab",
            error: parts.filter(Boolean).join(" · ") || undefined,
            incubatorCatalog,
            userIncubators,
          });
        } catch (e) {
          webviewView.webview.postMessage({
            type: "incubatorTab",
            error: e instanceof Error ? e.message : "Network error",
            incubatorCatalog: [],
            userIncubators: [],
          });
        }
        return;
      }

      if (msg.type === "checkoutFoodPack" && typeof msg.packType === "string") {
        if (!token) {
          vscode.window.showErrorMessage("Sprouts: sign in to purchase.");
          return;
        }
        try {
          const res = await fetch(`${base}/api/ide/me/checkout/food-pack`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ packType: msg.packType }),
          });
          const parsed = await readSproutsApiResponse<{ url?: string; error?: string }>(res, base);
          if (!parsed.ok) {
            vscode.window.showErrorMessage(parsed.error);
            return;
          }
          const data = parsed.data;
          if (!data.url) {
            vscode.window.showErrorMessage(data.error || "Checkout URL missing");
            return;
          }
          await vscode.env.openExternal(vscode.Uri.parse(data.url));
          vscode.window.showInformationMessage(
            "Sprouts: complete payment in your browser, then return — Shop › Care refreshes Feed balance when the window focuses."
          );
        } catch (e) {
          vscode.window.showErrorMessage(
            e instanceof Error ? e.message : "Sprouts: checkout request failed"
          );
        }
        return;
      }

      if (msg.type === "checkoutEgg") {
        if (!token) {
          vscode.window.showErrorMessage("Sprouts: sign in to purchase.");
          return;
        }
        const qty =
          typeof msg.quantity === "number" && msg.quantity >= 1 && msg.quantity <= 10
            ? Math.floor(msg.quantity)
            : 1;
        try {
          const res = await fetch(`${base}/api/ide/me/checkout/egg`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ quantity: qty }),
          });
          const parsed = await readSproutsApiResponse<{ url?: string; error?: string }>(res, base);
          if (!parsed.ok) {
            vscode.window.showErrorMessage(parsed.error);
            return;
          }
          const data = parsed.data;
          if (!data.url) {
            vscode.window.showErrorMessage(data.error || "Checkout URL missing");
            return;
          }
          await vscode.env.openExternal(vscode.Uri.parse(data.url));
          vscode.window.showInformationMessage("Sprouts: complete payment in your browser.");
        } catch (e) {
          vscode.window.showErrorMessage(
            e instanceof Error ? e.message : "Sprouts: checkout request failed"
          );
        }
        return;
      }

      if (msg.type === "checkoutSeasonPass") {
        if (!token) {
          vscode.window.showErrorMessage("Sprouts: sign in to subscribe.");
          return;
        }
        try {
          const res = await fetch(`${base}/api/ide/me/checkout/season-pass`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          });
          const parsed = await readSproutsApiResponse<{ url?: string; error?: string }>(res, base);
          if (!parsed.ok) {
            vscode.window.showErrorMessage(parsed.error);
            return;
          }
          const data = parsed.data;
          if (!data.url) {
            vscode.window.showErrorMessage(data.error || "Checkout URL missing");
            return;
          }
          await vscode.env.openExternal(vscode.Uri.parse(data.url));
          vscode.window.showInformationMessage(
            "Sprouts: complete checkout in your browser. When you return, refresh the panel — Sprouts Pro unlocks after Stripe confirms."
          );
        } catch (e) {
          vscode.window.showErrorMessage(
            e instanceof Error ? e.message : "Sprouts: checkout request failed"
          );
        }
        return;
      }

      if (msg.type === "purchaseIncubator" && typeof msg.incubatorType === "string") {
        if (!token) {
          webviewView.webview.postMessage({
            type: "purchaseIncubatorResult",
            error: "Not signed in",
          });
          return;
        }
        try {
          const res = await fetch(`${base}/api/ide/me/shop/purchase-incubator`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ type: msg.incubatorType }),
          });
          const parsed = await readSproutsApiResponse<{
            error?: string;
            required?: number;
            available?: number;
            feedBalance?: number;
            incubator?: { id: string; type: string };
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "purchaseIncubatorResult",
              error: parsed.error,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "purchaseIncubatorResult",
            ok: true,
            feedBalance: parsed.data.feedBalance,
            incubator: parsed.data.incubator,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "purchaseIncubatorResult",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (
        msg.type === "attachIncubator" &&
        typeof msg.sproutId === "string" &&
        typeof msg.incubatorId === "string"
      ) {
        if (!token) {
          webviewView.webview.postMessage({
            type: "attachIncubatorResult",
            error: "Not signed in",
          });
          return;
        }
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}/attach-incubator`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ incubatorId: msg.incubatorId }),
            }
          );
          const parsed = await readSproutsApiResponse<{
            error?: string;
            sprout?: Record<string, unknown>;
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "attachIncubatorResult",
              error: parsed.error,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "attachIncubatorResult",
            ok: true,
            sprout: parsed.data.sprout,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "attachIncubatorResult",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (msg.type === "detachIncubator" && typeof msg.sproutId === "string") {
        if (!token) {
          webviewView.webview.postMessage({
            type: "detachIncubatorResult",
            error: "Not signed in",
          });
          return;
        }
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}/detach-incubator`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({}),
            }
          );
          const parsed = await readSproutsApiResponse<{
            error?: string;
            sprout?: Record<string, unknown>;
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "detachIncubatorResult",
              error: parsed.error,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "detachIncubatorResult",
            ok: true,
            sprout: parsed.data.sprout,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "detachIncubatorResult",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (
        msg.type === "allocateAttribute" &&
        typeof msg.sproutId === "string" &&
        typeof msg.stat === "string"
      ) {
        if (!token) {
          webviewView.webview.postMessage({
            type: "allocateAttributeResult",
            error: "Not signed in",
          });
          return;
        }
        const stat = msg.stat;
        if (stat !== "strength" && stat !== "speed" && stat !== "intelligence") {
          webviewView.webview.postMessage({
            type: "allocateAttributeResult",
            error: "Invalid stat",
          });
          return;
        }
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}/allocate-attribute`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ stat }),
            }
          );
          const parsed = await readSproutsApiResponse<{
            error?: string;
            sprout?: Record<string, unknown>;
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "allocateAttributeResult",
              error: parsed.error,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "allocateAttributeResult",
            ok: true,
            sprout: parsed.data.sprout,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "allocateAttributeResult",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (msg.type === "sproutLevelUpPreview" && typeof msg.sproutId === "string") {
        if (!token) {
          webviewView.webview.postMessage({
            type: "sproutLevelUpPreviewResult",
            error: "Not signed in",
          });
          return;
        }
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}/level-up-cost`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const parsed = await readSproutsApiResponse<{
            error?: string;
            sproutLevel?: number;
            feedCost?: number;
            userXpCost?: number;
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "sproutLevelUpPreviewResult",
              error: parsed.error,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "sproutLevelUpPreviewResult",
            sproutId: msg.sproutId,
            feedCost: parsed.data.feedCost,
            userXpCost: parsed.data.userXpCost,
          });
        } catch (e) {
          webviewView.webview.postMessage({
            type: "sproutLevelUpPreviewResult",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (msg.type === "purchaseSproutLevelUp" && typeof msg.sproutId === "string") {
        if (!token) {
          webviewView.webview.postMessage({
            type: "purchaseSproutLevelUpResult",
            error: "Not signed in",
          });
          return;
        }
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}/purchase-level-up`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            }
          );
          const data = await readJsonBodyUnlessHtml<{
            error?: string;
            required?: { feed: number; userXp: number };
            have?: { feed: number; userXp: number };
            sprout?: Record<string, unknown>;
            foodBalance?: number;
            userExperience?: number;
          }>(res, base);
          if (!res.ok) {
            let err = data.error || `HTTP ${res.status}`;
            if (data.required && data.have) {
              err = `${err} (need ${data.required.feed} Feed + ${data.required.userXp} XP; have ${data.have.feed} Feed + ${data.have.userXp} XP)`;
            }
            webviewView.webview.postMessage({
              type: "purchaseSproutLevelUpResult",
              error: err,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "purchaseSproutLevelUpResult",
            ok: true,
            sprout: data.sprout,
            foodBalance: data.foodBalance,
            userExperience: data.userExperience,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "purchaseSproutLevelUpResult",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (msg.type === "loadArenaLoadout" && typeof msg.sproutId === "string") {
        if (!token) {
          webviewView.webview.postMessage({
            type: "arenaLoadoutError",
            error: "Not signed in",
          });
          return;
        }
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}/arena-loadout`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "arenaLoadoutError",
              error: parsed.error,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "arenaLoadoutData",
            ...parsed.data,
          });
        } catch (e) {
          webviewView.webview.postMessage({
            type: "arenaLoadoutError",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (
        msg.type === "arenaLoadoutAssignSlot" &&
        typeof msg.sproutId === "string" &&
        typeof msg.moveKey === "string"
      ) {
        if (!token) {
          webviewView.webview.postMessage({
            type: "arenaLoadoutError",
            error: "Not signed in",
          });
          return;
        }
        const slot = typeof msg.slot === "number" ? msg.slot : Number(msg.slot);
        if (!Number.isFinite(slot) || slot < 0 || slot > 3) {
          webviewView.webview.postMessage({
            type: "arenaLoadoutError",
            error: "Invalid slot",
          });
          return;
        }
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}/arena-loadout/slot`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ slot, moveKey: msg.moveKey }),
            }
          );
          const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "arenaLoadoutError",
              error: parsed.error,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "arenaLoadoutData",
            ...parsed.data,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "arenaLoadoutError",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (
        msg.type === "arenaLoadoutPowerUp" &&
        typeof msg.sproutId === "string" &&
        typeof msg.moveKey === "string"
      ) {
        if (!token) {
          webviewView.webview.postMessage({
            type: "arenaLoadoutError",
            error: "Not signed in",
          });
          return;
        }
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}/arena-loadout/power`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ moveKey: msg.moveKey }),
            }
          );
          const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "arenaLoadoutError",
              error: parsed.error,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "arenaLoadoutData",
            ...parsed.data,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "arenaLoadoutError",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

      if (
        msg.type === "renameSprout" &&
        typeof msg.sproutId === "string" &&
        typeof msg.name === "string"
      ) {
        if (!token) {
          webviewView.webview.postMessage({ type: "renameResult", error: "Not signed in" });
          return;
        }
        const name = String(msg.name).trim();
        if (name.length < 1 || name.length > MAX_SPROUT_NAME_LEN) {
          webviewView.webview.postMessage({
            type: "renameResult",
            error: "Name must be 1–48 characters",
          });
          return;
        }
        try {
          const res = await fetch(
            `${base}/api/ide/me/sprouts/${encodeURIComponent(msg.sproutId)}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ name }),
            }
          );
          const parsed = await readSproutsApiResponse<{
            error?: string;
            sprout?: Record<string, unknown>;
          }>(res, base);
          if (!parsed.ok) {
            webviewView.webview.postMessage({
              type: "renameResult",
              error: parsed.error,
            });
            return;
          }
          webviewView.webview.postMessage({
            type: "renameResult",
            ok: true,
            sprout: parsed.data.sprout,
          });
          await this.pushState(webviewView.webview);
          await miniInstance?.refresh();
        } catch (e) {
          webviewView.webview.postMessage({
            type: "renameResult",
            error: e instanceof Error ? e.message : "Network error",
          });
        }
        return;
      }

    });

    webviewView.onDidDispose(() => {
      clearInterval(gitPollTimer);
      this.view = undefined;
    });
  }

  private async pushState(webview: vscode.Webview): Promise<void> {
    await syncIdeTokenFromCliFile(this.context);
    const token = await this.context.secrets.get(SECRET_KEY);
    const base = apiUrl();
    const compact = this.context.globalState.get(COMPACT_STATE_KEY) === true;
    const meta = apiUrlResolutionMeta();
    const probe = await probeSproutsApiBase(base);
    const editorGhInstall = githubAppInstallUrlFromEditorSettings();
    webview.postMessage({
      type: "state",
      apiUrl: base,
      token: token || null,
      compact,
      apiProbeOk: probe.ok,
      apiProbeHint: probe.hint || null,
      apiUrlUserOverride: meta.userSetInEditor,
      homeConfigApiUrl: meta.homeConfigUrl ?? null,
      githubAppInstallUrl: editorGhInstall ?? null,
    });
    if (!token) {
      webview.postMessage({ type: "sprouts", sprouts: [] });
      webview.postMessage({ type: "ideProfile", profile: null });
      updateStatusBar(null);
      await miniInstance?.refresh();
      return;
    }
    try {
      const [resSprouts, resMe] = await Promise.all([
        fetch(`${base}/api/ide/me/sprouts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${base}/api/ide/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const parsedMe = await readSproutsApiResponse<{
        streak?: number;
        totalPoints?: number;
        level?: number;
        experience?: number;
        totalCreditedCommits?: number;
        seasonPassActive?: boolean;
        levelBand?: { id?: string; minLevel?: number; title?: string };
        githubAppInstallUrl?: string;
      }>(resMe, base);
      if (parsedMe.ok) {
        const lb = parsedMe.data.levelBand;
        const apiGh =
          typeof parsedMe.data.githubAppInstallUrl === "string" &&
          parsedMe.data.githubAppInstallUrl.trim().length > 0
            ? parsedMe.data.githubAppInstallUrl.trim()
            : undefined;
        const mergedGh = mergeGithubAppInstallUrl(apiGh);
        webview.postMessage({
          type: "ideProfile",
          profile: {
            streak: parsedMe.data.streak ?? 0,
            totalPoints: parsedMe.data.totalPoints ?? 0,
            level: parsedMe.data.level ?? 1,
            experience: parsedMe.data.experience ?? 0,
            totalCreditedCommits: parsedMe.data.totalCreditedCommits ?? 0,
            seasonPassActive: parsedMe.data.seasonPassActive === true,
            levelBand:
              lb && typeof lb === "object" && typeof lb.title === "string"
                ? { id: lb.id, minLevel: lb.minLevel, title: lb.title }
                : undefined,
            ...(mergedGh ? { githubAppInstallUrl: mergedGh } : {}),
          },
        });
      } else {
        webview.postMessage({ type: "ideProfile", profile: null, error: parsedMe.error });
      }

      const parsed = await readSproutsApiResponse<{ sprouts?: Record<string, unknown>[] }>(
        resSprouts,
        base
      );
      if (!parsed.ok) {
        webview.postMessage({ type: "sprouts", sprouts: [], error: parsed.error });
        updateStatusBar(null);
        await miniInstance?.refresh();
        return;
      }
      const sprouts = parsed.data.sprouts || [];
      webview.postMessage({ type: "sprouts", sprouts });
      const first = sprouts[0] ?? null;
      updateStatusBar(first);
      await miniInstance?.refresh();
      if (first && typeof first.id === "string") {
        const name = (first.name as string) || "Sprout";
        setTimeout(() => {
          void maybeSproutGreeting(this.context, first.id as string, name);
        }, 1500);
      }
    } catch (e) {
      webview.postMessage({ type: "ideProfile", profile: null });
      webview.postMessage({
        type: "sprouts",
        sprouts: [],
        error: e instanceof Error ? e.message : "Network error",
      });
      updateStatusBar(null);
      await miniInstance?.refresh();
    }
  }
}

type IdeApiResultChannel = "miniPvpResult" | "arenaApiResult";

function postIdeApiResult(
  webview: vscode.Webview,
  channel: IdeApiResultChannel,
  payload: Record<string, unknown>
): void {
  webview.postMessage({ type: channel, ...payload });
}

async function handleIdeArenaApiMessage(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  msg: Record<string, unknown>,
  resultChannel: IdeApiResultChannel
): Promise<void> {
  const base = apiUrl();
  const token = await context.secrets.get(SECRET_KEY);
  const op = typeof msg.op === "string" ? msg.op : "";
  if (!token) {
    postIdeApiResult(webview, resultChannel, { op, ok: false, error: "Not signed in" });
    return;
  }
  const auth = { Authorization: `Bearer ${token}` };
  try {
    switch (op) {
      case "invite": {
        const email = typeof msg.email === "string" ? msg.email : "";
        const sproutId = typeof msg.sproutId === "string" ? msg.sproutId : "";
        const targetUserId =
          typeof msg.targetUserId === "string" ? msg.targetUserId : "";
        const res = await fetch(`${base}/api/ide/me/pvp/invite`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ email, sproutId, targetUserId: targetUserId || undefined }),
        });
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "invites": {
        const res = await fetch(`${base}/api/ide/me/pvp/invites`, { headers: auth });
        const parsed = await readSproutsApiResponse<{
          incoming?: unknown[];
          outgoing?: unknown[];
        }>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "accept": {
        const inviteId = typeof msg.inviteId === "string" ? msg.inviteId : "";
        const sproutId = typeof msg.sproutId === "string" ? msg.sproutId : "";
        const res = await fetch(
          `${base}/api/ide/me/pvp/invites/${encodeURIComponent(inviteId)}/accept`,
          {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({ sproutId }),
          }
        );
        const parsed = await readSproutsApiResponse<{
          battleId?: string;
          state?: unknown;
        }>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, {
          op,
          ok: true,
          data: {
            battleId: parsed.data.battleId,
            state: parsed.data.state,
            role: "defender" as const,
          },
        });
        return;
      }
      case "decline": {
        const inviteId = typeof msg.inviteId === "string" ? msg.inviteId : "";
        const res = await fetch(
          `${base}/api/ide/me/pvp/invites/${encodeURIComponent(inviteId)}/decline`,
          {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "active": {
        const res = await fetch(`${base}/api/ide/me/pvp/battle/active`, { headers: auth });
        const parsed = await readSproutsApiResponse<{
          battle?: {
            id: string;
            role: string;
            state: unknown;
          } | null;
        }>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "move": {
        const battleId = typeof msg.battleId === "string" ? msg.battleId : "";
        const moveKey = typeof msg.moveKey === "string" ? msg.moveKey : "";
        const res = await fetch(
          `${base}/api/ide/me/pvp/battle/${encodeURIComponent(battleId)}/move`,
          {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({ moveKey }),
          }
        );
        const parsed = await readSproutsApiResponse<{
          state?: unknown;
          completed?: boolean;
          feedTransferred?: number;
        }>(res, base);
        if (!parsed.ok) {
          const cur = await fetch(`${base}/api/ide/me/pvp/battle/active`, { headers: auth });
          const curParsed = await readSproutsApiResponse<{
            battle?: { state?: unknown } | null;
          }>(cur, base);
          const st =
            curParsed.ok && curParsed.data.battle?.state != null
              ? curParsed.data.battle.state
              : undefined;
          postIdeApiResult(webview, resultChannel, {
            op,
            ok: false,
            error: parsed.error,
            ...(st != null ? { data: { state: st } } : {}),
          });
          return;
        }
        postIdeApiResult(webview, resultChannel, {
          op,
          ok: true,
          data: {
            state: parsed.data.state,
            completed: parsed.data.completed,
            feedTransferred: parsed.data.feedTransferred,
          },
        });
        if (parsed.data.completed === true) {
          void miniInstance?.refresh();
          void companionInstance?.refresh();
          if (arenaPanel) void pushArenaState(arenaPanel.webview, context);
        }
        return;
      }
      case "share": {
        const res = await fetch(`${base}/api/ide/me/arena/share`, { headers: auth });
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "shareRegenerate": {
        const res = await fetch(`${base}/api/ide/me/arena/share/regenerate`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "friends": {
        const res = await fetch(`${base}/api/ide/me/friends`, { headers: auth });
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "friendsIncoming": {
        const res = await fetch(`${base}/api/ide/me/friends/requests/incoming`, {
          headers: auth,
        });
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "friendRequest": {
        const email = typeof msg.email === "string" ? msg.email : "";
        const shareCode = typeof msg.shareCode === "string" ? msg.shareCode : "";
        const res = await fetch(`${base}/api/ide/me/friends/request`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ email, shareCode }),
        });
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "friendAccept": {
        const id = typeof msg.friendshipId === "string" ? msg.friendshipId : "";
        const res = await fetch(
          `${base}/api/ide/me/friends/${encodeURIComponent(id)}/accept`,
          {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "friendDecline": {
        const id = typeof msg.friendshipId === "string" ? msg.friendshipId : "";
        const res = await fetch(
          `${base}/api/ide/me/friends/${encodeURIComponent(id)}/decline`,
          {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "friendRemove": {
        const userId = typeof msg.userId === "string" ? msg.userId : "";
        const res = await fetch(
          `${base}/api/ide/me/friends/user/${encodeURIComponent(userId)}`,
          { method: "DELETE", headers: auth }
        );
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "queueJoin": {
        const sproutId = typeof msg.sproutId === "string" ? msg.sproutId : "";
        const res = await fetch(`${base}/api/ide/me/pvp/queue/join`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ sproutId }),
        });
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "queueLeave": {
        const res = await fetch(`${base}/api/ide/me/pvp/queue/leave`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "queueStatus": {
        const res = await fetch(`${base}/api/ide/me/pvp/queue/status`, { headers: auth });
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "cpuRetreat": {
        const res = await fetch(`${base}/api/ide/me/arena/cpu-retreat`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const cpuParsed = await readSproutsApiResponse<{
          feedPaid?: number;
          foodBalance?: number;
        }>(res, base);
        if (!cpuParsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: cpuParsed.error });
          return;
        }
        void miniInstance?.refresh();
        void companionInstance?.refresh();
        postIdeApiResult(webview, resultChannel, {
          op,
          ok: true,
          data: {
            feedPaid: cpuParsed.data.feedPaid ?? 0,
            foodBalance: cpuParsed.data.foodBalance,
          },
        });
        return;
      }
      case "surrender": {
        const battleId = typeof msg.battleId === "string" ? msg.battleId : "";
        if (!battleId.trim()) {
          postIdeApiResult(webview, resultChannel, {
            op,
            ok: false,
            error: "battleId required",
          });
          return;
        }
        const surRes = await fetch(
          `${base}/api/ide/me/pvp/battle/${encodeURIComponent(battleId)}/surrender`,
          {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );
        const surParsed = await readSproutsApiResponse<{
          state?: unknown;
          completed?: boolean;
          feedPaid?: number;
          foodBalance?: number;
        }>(surRes, base);
        if (!surParsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: surParsed.error });
          return;
        }
        void miniInstance?.refresh();
        void companionInstance?.refresh();
        if (arenaPanel) void pushArenaState(arenaPanel.webview, context);
        postIdeApiResult(webview, resultChannel, {
          op,
          ok: true,
          data: {
            state: surParsed.data.state,
            completed: surParsed.data.completed,
            feedPaid: surParsed.data.feedPaid ?? 0,
            foodBalance: surParsed.data.foodBalance,
          },
        });
        return;
      }
      case "arenaLoadout": {
        const sproutId = typeof msg.sproutId === "string" ? msg.sproutId : "";
        if (!sproutId.trim()) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: "sproutId required" });
          return;
        }
        const res = await fetch(
          `${base}/api/ide/me/sprouts/${encodeURIComponent(sproutId)}/arena-loadout`,
          { headers: auth }
        );
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "arenaLoadoutSlot": {
        const sproutId = typeof msg.sproutId === "string" ? msg.sproutId : "";
        const slot = typeof msg.slot === "number" ? msg.slot : Number(msg.slot);
        const moveKey = typeof msg.moveKey === "string" ? msg.moveKey : "";
        if (!sproutId.trim() || !moveKey.trim()) {
          postIdeApiResult(webview, resultChannel, {
            op,
            ok: false,
            error: "sproutId and moveKey required",
          });
          return;
        }
        const res = await fetch(
          `${base}/api/ide/me/sprouts/${encodeURIComponent(sproutId)}/arena-loadout/slot`,
          {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({ slot, moveKey }),
          }
        );
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        void miniInstance?.refresh();
        void companionInstance?.refresh();
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      case "arenaLoadoutPower": {
        const sproutId = typeof msg.sproutId === "string" ? msg.sproutId : "";
        const moveKey = typeof msg.moveKey === "string" ? msg.moveKey : "";
        if (!sproutId.trim() || !moveKey.trim()) {
          postIdeApiResult(webview, resultChannel, {
            op,
            ok: false,
            error: "sproutId and moveKey required",
          });
          return;
        }
        const res = await fetch(
          `${base}/api/ide/me/sprouts/${encodeURIComponent(sproutId)}/arena-loadout/power`,
          {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({ moveKey }),
          }
        );
        const parsed = await readSproutsApiResponse<Record<string, unknown>>(res, base);
        if (!parsed.ok) {
          postIdeApiResult(webview, resultChannel, { op, ok: false, error: parsed.error });
          return;
        }
        void miniInstance?.refresh();
        void companionInstance?.refresh();
        postIdeApiResult(webview, resultChannel, { op, ok: true, data: parsed.data });
        return;
      }
      default:
        postIdeApiResult(webview, resultChannel, {
          op,
          ok: false,
          error: "Unknown IDE arena API op",
        });
    }
  } catch (e) {
    postIdeApiResult(webview, resultChannel, {
      op,
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    });
  }
}

class SproutsMiniViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "sprouts.mini";
  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async refresh(): Promise<void> {
    if (this.view) {
      await this.pushMini(this.view.webview);
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    webviewView.webview.html = loadWebviewHtml(this.context, webviewView.webview, "mini");

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "miniReady") {
        await this.pushMini(webviewView.webview);
      }
      if (msg.type === "companionSignIn") {
        void vscode.commands.executeCommand("sprouts.signIn");
        return;
      }
      if (msg.type === "companionSignOut") {
        await vscode.commands.executeCommand("sprouts.signOut");
        return;
      }
      if (msg.type === "openCompanionSidebar") {
        try {
          await vscode.commands.executeCommand(SPROUTS_ACTIVITY_VIEW);
        } catch {
          vscode.window.showInformationMessage(
            "Sprouts: open the left activity bar → ⋯ → enable Sprouts, then click the sprout icon."
          );
        }
      }
      if (msg.type === "openCompanionTab" && typeof msg.tab === "string") {
        const allowed = new Set([
          "sprout",
          "arena",
          "shop",
          "feed",
          "store",
          "incubator",
          "wardrobe",
          "season-pass",
          "settings",
        ]);
        if (!allowed.has(msg.tab)) return;
        try {
          await vscode.commands.executeCommand(SPROUTS_ACTIVITY_VIEW);
        } catch {
          vscode.window.showInformationMessage(
            "Sprouts: open the left activity bar → ⋯ → enable Sprouts, then click the sprout icon."
          );
        }
        companionInstance?.navigateToTab(msg.tab);
      }
      if (msg.type === "openCursorChat") {
        await openSproutChatWithPersonality(this.context);
      }
      if (msg.type === "openArena") {
        void vscode.commands.executeCommand("sprouts.openArena");
        return;
      }
      if (msg.type === "miniPvp" && typeof msg.op === "string") {
        await handleIdeArenaApiMessage(
          webviewView.webview,
          this.context,
          msg,
          "miniPvpResult"
        );
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  private async pushMini(webview: vscode.Webview): Promise<void> {
    await syncIdeTokenFromCliFile(this.context);
    const token = await this.context.secrets.get(SECRET_KEY);
    const base = apiUrl();
    if (!token) {
      webview.postMessage({ type: "miniState", sprout: null, signedIn: false });
      return;
    }
    try {
      const [sprRes, meRes, invRes] = await Promise.all([
        fetch(`${base}/api/ide/me/sprouts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${base}/api/ide/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${base}/api/ide/me/pvp/invites`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const parsed = await readSproutsApiResponse<{ sprouts?: Record<string, unknown>[] }>(
        sprRes,
        base
      );
      const meParsed = await readSproutsApiResponse<{
        email?: string | null;
        name?: string | null;
        totalCreditedCommits?: number;
      }>(meRes, base);
      const invParsed = await readSproutsApiResponse<{
        incoming?: unknown[];
      }>(invRes, base);
      if (!parsed.ok) {
        webview.postMessage({ type: "miniState", sprout: null, signedIn: true });
        return;
      }
      const sprouts = parsed.data.sprouts || [];
      const incoming = invParsed.ok ? invParsed.data.incoming || [] : [];
      updatePvpIncomingNotify(incoming.length);
      const profile = meParsed.ok
        ? {
            email: meParsed.data.email ?? null,
            name: meParsed.data.name ?? null,
            totalCreditedCommits: meParsed.data.totalCreditedCommits ?? 0,
          }
        : null;
      webview.postMessage({
        type: "miniState",
        sprout: sprouts[0] ?? null,
        signedIn: true,
        profile,
        pvpIncomingCount: incoming.length,
      });
    } catch {
      webview.postMessage({ type: "miniState", sprout: null, signedIn: true });
    }
  }
}

async function applyIdeTokenFileIfUpdated(
  context: vscode.ExtensionContext,
  provider: SproutsViewProvider
): Promise<void> {
  try {
    if (!fs.existsSync(IDE_TOKEN_FILE)) return;
    const raw = fs.readFileSync(IDE_TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as { access_token?: string };
    const tok = parsed.access_token;
    if (!tok?.length) return;
    const prev = await context.secrets.get(SECRET_KEY);
    if (prev === tok) return;
    await context.secrets.store(SECRET_KEY, tok);
    await revealSproutsCompanion("Sprouts: signed in — opening Sprout panel.");
    await provider.refresh();
    await miniInstance?.refresh();
  } catch {
    /* ignore */
  }
}

function watchIdeTokenFile(
  context: vscode.ExtensionContext,
  provider: SproutsViewProvider
): void {
  const dir = path.dirname(IDE_TOKEN_FILE);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  let debounce: NodeJS.Timeout | undefined;
  const fire = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = undefined;
      void applyIdeTokenFileIfUpdated(context, provider);
    }, 500);
  };
  let dirWatcher: fs.FSWatcher | undefined;
  try {
    dirWatcher = fs.watch(dir, fire);
  } catch {
    return;
  }
  context.subscriptions.push(
    new vscode.Disposable(() => {
      if (debounce) clearTimeout(debounce);
      dirWatcher?.close();
    })
  );
}

const SAVE_REFRESH_DEBOUNCE_MS = 1200;
const SAVE_TOAST_MIN_INTERVAL_MS = 90_000;
const GIT_SYNC_AFTER_SAVE_DEBOUNCE_MS = 2000;

/** Optional: refresh Companion after saves so stats stay current; light nudge toast (debounced). */
function registerSproutsSaveHook(context: vscode.ExtensionContext): void {
  let refreshTimer: NodeJS.Timeout | undefined;
  let gitSyncTimer: NodeJS.Timeout | undefined;
  let lastToastAt = 0;
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.scheme !== "file") return;
      if (gitSyncTimer) clearTimeout(gitSyncTimer);
      gitSyncTimer = setTimeout(() => {
        gitSyncTimer = undefined;
        companionInstance?.requestDevGitSync();
      }, GIT_SYNC_AFTER_SAVE_DEBOUNCE_MS);
      void (async () => {
        const tok = await context.secrets.get(SECRET_KEY);
        if (tok) companionInstance?.postIdeProgress("save");
      })();
      if (!vscode.workspace.getConfiguration("sprouts").get<boolean>("notifyOnSave")) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void (async () => {
          const tok = await context.secrets.get(SECRET_KEY);
          if (!tok) return;
          await companionInstance?.refresh();
          await miniInstance?.refresh();
          const now = Date.now();
          if (now - lastToastAt < SAVE_TOAST_MIN_INTERVAL_MS) return;
          lastToastAt = now;
          const open = "Open Sprout";
          const pick = await vscode.window.showInformationMessage(
            "Sprouts: you saved files — stats refreshed. Say something to your Sprout in Cursor Chat (MCP + skill).",
            open
          );
          if (pick === open) {
            try {
              await vscode.commands.executeCommand(SPROUTS_ACTIVITY_VIEW);
            } catch {
              /* ignore */
            }
          }
        })();
      }, SAVE_REFRESH_DEBOUNCE_MS);
    })
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const importedFromCliFile = await syncIdeTokenFromCliFile(context);
  const provider = new SproutsViewProvider(context);
  const miniProvider = new SproutsMiniViewProvider(context);
  companionInstance = provider;
  miniInstance = miniProvider;

  if (importedFromCliFile) {
    await revealSproutsCompanion("Sprouts: loaded sign-in from CLI — Sprout panel opened.");
  }
  watchIdeTokenFile(context, provider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SproutsViewProvider.viewId, provider)
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SproutsMiniViewProvider.viewId, miniProvider)
  );

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  statusBarItem.command = "sprouts.openMiniPanel";
  context.subscriptions.push(statusBarItem);
  updateStatusBar(null);

  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.signIn", () => startDeviceSignIn(context))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.signOut", async () => {
      await context.secrets.delete(SECRET_KEY);
      clearIdeTokenCliFile();
      lastKnownPvpIncomingCount = -1;
      vscode.window.showInformationMessage("Sprouts: signed out.");
      await provider.refresh();
      await miniProvider.refresh();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.refresh", async () => {
      await provider.refresh();
      await miniProvider.refresh();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.toggleCompact", async () => {
      const next = !(context.globalState.get(COMPACT_STATE_KEY) === true);
      await context.globalState.update(COMPACT_STATE_KEY, next);
      await provider.refresh();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.openSproutChat", async () => {
      await openSproutChatWithPersonality(context);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.openMiniPanel", async () => {
      try {
        await vscode.commands.executeCommand(SPROUTS_MINI_PANEL);
      } catch {
        vscode.window.showInformationMessage(
          "Sprouts: open the bottom panel and select the Sprouts Mini view."
        );
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.openArena", () => {
      openSproutsArenaPanel(context);
    })
  );
  const pvpInvitePollMs = 90_000;
  const pvpInvitePoll = setInterval(() => {
    void pollPvpInvitesForToast(context);
  }, pvpInvitePollMs);
  context.subscriptions.push(
    new vscode.Disposable(() => {
      clearInterval(pvpInvitePoll);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.openCompanionSidebar", async () => {
      try {
        await vscode.commands.executeCommand(SPROUTS_ACTIVITY_VIEW);
      } catch {
        vscode.window.showInformationMessage(
          "Sprouts: use the left activity bar — open the ⋯ menu if Sprouts is hidden — then pick the sprout icon."
        );
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.setupWorkspaceMcpSkill", () =>
      setupWorkspaceMcpAndSkill(context)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.checkForUpdates", () => checkExtensionUpdates(context))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.copyApiDiagnostics", async () => {
      const text = formatApiDiagnosticsText();
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage("Sprouts: API diagnostics copied to clipboard.");
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sprouts.resetWorkspaceSetupPrompt", async () => {
      await context.workspaceState.update("sprouts.workspaceSetupOffered", false);
      await context.workspaceState.update("sprouts.declinedWorkspaceSetup", false);
      await context.workspaceState.update("sprouts.didWorkspaceSetup", false);
      vscode.window.showInformationMessage("Sprouts: workspace setup prompt reset for this folder.");
    })
  );

  setTimeout(() => {
    void maybeAutoInstallOrOfferWorkspaceSetup(context);
  }, 2500);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      setTimeout(() => {
        void maybeAutoInstallOrOfferWorkspaceSetup(context);
      }, 1500);
    })
  );

  registerSproutsSaveHook(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("sprouts")) {
        void provider.refresh();
        void miniProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      if (e.focused) {
        provider.notifyWindowFocused();
      }
    })
  );
}

export function deactivate(): void {
  companionInstance = undefined;
  miniInstance = undefined;
  statusBarItem = undefined;
}

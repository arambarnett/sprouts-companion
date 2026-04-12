/**
 * Copy canonical character GLBs from monorepo assets into the extension webview media folder.
 * Run from repo root: cd extensions/sprouts-companion && npm run sync-3d-models
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.join(__dirname, "..");
const repoRoot = path.join(extRoot, "..", "..");
const srcRoot = path.join(repoRoot, "assets", "characters", "3d_models");
const destDir = path.join(extRoot, "media", "models");
const species = ["bear", "deer", "fox", "owl", "penguin", "rabbit"];

if (!fs.existsSync(srcRoot)) {
  console.warn(
    "sync-3d-models: assets/characters/3d_models not found (build outside monorepo?). Skip."
  );
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
let n = 0;
for (const s of species) {
  const from = path.join(srcRoot, s, `${s}.glb`);
  if (!fs.existsSync(from)) {
    console.warn("sync-3d-models: missing", from);
    continue;
  }
  fs.copyFileSync(from, path.join(destDir, `${s}.glb`));
  n += 1;
  console.log("sync-3d-models:", s + ".glb");
}
if (n === 0) {
  console.warn("sync-3d-models: no files copied.");
}
process.exit(0);

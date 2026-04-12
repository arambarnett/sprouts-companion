'use strict';

/**
 * Sanity checks for packaging: entrypoint, contributed icons, MCP + pixel bundles.
 * Run after: npm run vscode:prepublish
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fail = (msg) => {
  console.error('verify-extension:', msg);
  process.exit(1);
};

const mustExist = (rel) => {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
};

mustExist('package.json');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
mustExist(pkg.main.replace(/^\.\//, ''));

const absIcon = (p) => path.join(root, p.replace(/^\.\//, ''));
const barIcon = pkg.contributes?.viewsContainers?.activitybar?.[0]?.icon;
const panelIcon = pkg.contributes?.viewsContainers?.panel?.[0]?.icon;
if (!barIcon || !panelIcon) fail('package.json missing viewsContainers icons');
[barIcon, panelIcon, pkg.icon].forEach((iconPath) => {
  if (iconPath) mustExist(iconPath);
});

mustExist('mcp/sprouts-mcp.cjs');
mustExist('media/dist/sprouts-pixel.js');
mustExist('media/companion.html');
mustExist('media/mini.html');
mustExist('media/arena.html');
mustExist('media/arena-webview.js');

console.log('verify-extension: OK (icons, main, MCP bundle, pixel bundle, webviews present)');

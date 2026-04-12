'use strict';

/**
 * Rasterize sprouts-activity-icon.svg → PNGs (activity bar + marketplace).
 * Requires `rsvg-convert` on PATH (macOS: brew install librsvg; Debian: librsvg2-bin).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'media', 'sprouts-activity-icon.svg');
const outlineSvgPath = path.join(root, 'media', 'activity-bar-outline.svg');

function rsvg(width, outName) {
  const out = path.join(root, 'media', outName);
  const r = spawnSync('rsvg-convert', ['-w', String(width), '-o', out, svgPath], {
    stdio: 'inherit',
  });
  if (r.error) {
    console.error(r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(
      'rsvg-convert failed. Install librsvg (e.g. brew install librsvg / apt install librsvg2-bin).'
    );
    process.exit(1);
  }
}

rsvg(128, 'activity-bar-icon.png');
rsvg(128, 'marketplace-icon.png');
console.log('Wrote media/activity-bar-icon.png, media/marketplace-icon.png (128×128)');

/** 28×28 RGBA sprout outline for tooling; package.json uses activity-bar-outline.svg (not this PNG). */
const whiteOutline = fs
  .readFileSync(outlineSvgPath, 'utf8')
  .replace(/currentColor/g, '#FFFFFF');
const tmpOutline = path.join(root, 'media', '.activity-bar-outline-white-tmp.svg');
fs.writeFileSync(tmpOutline, whiteOutline);
const r2 = spawnSync('rsvg-convert', ['-w', '28', '-h', '28', '-o', path.join(root, 'media', 'activity-bar-filled.png'), tmpOutline], {
  stdio: 'inherit',
});
fs.unlinkSync(tmpOutline);
if (r2.status !== 0) process.exit(1);
console.log('Wrote media/activity-bar-filled.png (28×28 RGBA outline, white on transparent)');

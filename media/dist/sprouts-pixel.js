"use strict";
(() => {
  // ../../website/lib/pixel-lab/ideCompanion/constants.ts
  var PALETTE = {
    0: "transparent",
    1: "#FF8C00",
    // Orange (Fox)
    2: "#B22222",
    // Dark Orange/Red (Outline)
    3: "#FFFFFF",
    // White
    4: "#FFA500",
    // Light Orange (Highlight)
    5: "#FFB6C1",
    // Pink (Blush)
    6: "#32CD32",
    // Green (Leaf)
    7: "#228B22",
    // Dark Green (Stem)
    8: "#000000",
    // Black (Eyes)
    9: "#8B4513",
    // Brown (Bear/Deer/Paws)
    10: "#A9A9A9",
    // Grey (Cat/Owl/Penguin/Rabbit)
    11: "#696969",
    // Dark Grey (Outline)
    12: "#FFD700",
    // Yellow (Beak/Feet)
    13: "#D3D3D3",
    // Light Grey (Highlight)
    14: "#00BFFF",
    // Deep Sky Blue (Tears)
    15: "#FF0000",
    // Red
    16: "#8B0000",
    // Dark Red
    17: "#0000FF",
    // Blue
    18: "#00008B",
    // Dark Blue
    19: "#ADD8E6",
    // Light Blue
    20: "#006400",
    // Darker Green
    21: "#61dafb",
    // React
    22: "#0078d4",
    // VS Code blue
    23: "#f7df1e",
    // JS yellow
    24: "#3776ab",
    // Python blue
    25: "#ffd43b",
    // Python yellow
    26: "#ce422b",
    // Rust-ish
    27: "#24292e",
    // GitHub dark
    28: "#ffffff"
    // GitHub white
  };
  var IDE_COMPANION_PALETTE = PALETTE;

  // ../../website/lib/pixel-lab/ideCompanion/utils64.ts
  var SIZE = 64;
  function empty64() {
    return new Array(SIZE * SIZE).fill(0);
  }
  function toGrid(d) {
    const grid = [];
    for (let y = 0; y < SIZE; y++) {
      grid.push(d.slice(y * SIZE, (y + 1) * SIZE));
    }
    return grid;
  }
  function set(d, x, y, color) {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) {
      d[y * SIZE + x] = color;
    }
  }
  function fillEllipse(d, cx, cy, rx, ry, color) {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if (x * x / (rx * rx) + y * y / (ry * ry) <= 1) {
          set(d, Math.round(cx + x), Math.round(cy + y), color);
        }
      }
    }
  }
  function fillTriangle(d, x1, y1, x2, y2, x3, y3, color) {
    const minX = Math.floor(Math.min(x1, x2, x3));
    const maxX = Math.ceil(Math.max(x1, x2, x3));
    const minY = Math.floor(Math.min(y1, y2, y3));
    const maxY = Math.ceil(Math.max(y1, y2, y3));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const b1 = (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2) < 0;
        const b2 = (x - x3) * (y2 - y3) - (x2 - x3) * (y - y3) < 0;
        const b3 = (x - x1) * (y3 - y1) - (x3 - x1) * (y - y1) < 0;
        if (b1 === b2 && b2 === b3) {
          set(d, x, y, color);
        }
      }
    }
  }
  function drawChibiEyes(d, lx, rx, y, mood, blink, config) {
    const { rw, rh } = config;
    const color = 8;
    if (blink) {
      for (let dx = -rw / 2; dx <= rw / 2; dx++) {
        set(d, Math.round(lx + dx), Math.round(y), color);
        set(d, Math.round(rx + dx), Math.round(y), color);
      }
      return;
    }
    if (mood === "happy") {
      for (let dx = -rw / 2; dx <= rw / 2; dx++) {
        const dy = -Math.abs(dx) / 2;
        set(d, Math.round(lx + dx), Math.round(y + dy), color);
        set(d, Math.round(rx + dx), Math.round(y + dy), color);
      }
    } else if (mood === "sad") {
      for (let dx = -rw / 2; dx <= rw / 2; dx++) {
        const dy = Math.abs(dx) / 2;
        set(d, Math.round(lx + dx), Math.round(y + dy), color);
        set(d, Math.round(rx + dx), Math.round(y + dy), color);
      }
    } else if (mood === "angry") {
      const eyebrowY = y - 6;
      fillEllipse(d, lx, y, rw / 2, rh / 2, color);
      fillEllipse(d, rx, y, rw / 2, rh / 2, color);
      set(d, Math.round(lx - 2), Math.round(y - 2), 3);
      set(d, Math.round(rx - 2), Math.round(y - 2), 3);
      for (let dx = -rw / 2; dx <= rw / 2; dx++) {
        set(d, Math.round(lx + dx), Math.round(eyebrowY + dx / 2), color);
        set(d, Math.round(rx + dx), Math.round(eyebrowY - dx / 2), color);
      }
    } else if (mood === "dead") {
      for (let i = -2; i <= 2; i++) {
        set(d, Math.round(lx + i), Math.round(y + i), color);
        set(d, Math.round(lx + i), Math.round(y - i), color);
        set(d, Math.round(rx + i), Math.round(y + i), color);
        set(d, Math.round(rx + i), Math.round(y - i), color);
      }
    } else {
      fillEllipse(d, lx, y, rw / 2, rh / 2, color);
      fillEllipse(d, rx, y, rw / 2, rh / 2, color);
      set(d, Math.round(lx - 2), Math.round(y - 2), 3);
      set(d, Math.round(rx - 2), Math.round(y - 2), 3);
    }
  }
  function drawEgg(d, x, y, p) {
    const { shake, crackLevel, eyesLookX = 0, eyesLookY = 0, blink = false, exploded = false } = p;
    const eggColor = 12;
    const spotColor = 1;
    const crackColor = 8;
    if (exploded) {
      drawExplosion(d, x, y);
      return;
    }
    fillEllipse(d, x + shake, y, 16, 20, eggColor);
    fillEllipse(d, x + shake - 4, y - 6, 3, 3, spotColor);
    fillEllipse(d, x + shake + 5, y + 4, 2, 2, spotColor);
    fillEllipse(d, x + shake - 2, y + 8, 2, 2, spotColor);
    if (crackLevel >= 1) {
      strokePolyline(d, [[x + shake - 10, y], [x + shake - 4, y + 2], [x + shake + 4, y - 2], [x + shake + 10, y]], 1, crackColor);
    }
    if (crackLevel >= 2) {
      strokePolyline(d, [[x + shake - 4, y - 10], [x + shake - 2, y - 6]], 1, crackColor);
      strokePolyline(d, [[x + shake + 4, y + 10], [x + shake + 2, y + 6]], 1, crackColor);
    }
    if (crackLevel >= 2) {
      const lx = x + shake - 4 + eyesLookX;
      const ly = y + eyesLookY;
      const rx = x + shake + 4 + eyesLookX;
      const ry = y + eyesLookY;
      if (!blink) {
        fillEllipse(d, lx, ly, 2, 3, 8);
        fillEllipse(d, rx, ry, 2, 3, 8);
        set(d, Math.round(lx - 1), Math.round(ly - 1), 3);
        set(d, Math.round(rx - 1), Math.round(ry - 1), 3);
      } else {
        strokePolyline(d, [[lx - 2, ly], [lx + 2, ly]], 1, 8);
        strokePolyline(d, [[rx - 2, ry], [rx + 2, ry]], 1, 8);
      }
    }
  }
  function drawExplosion(d, x, y) {
    const colors = [12, 1, 4, 3];
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 25;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      const size = Math.random() * 4 + 1;
      fillEllipse(d, px, py, size, size, colors[Math.floor(Math.random() * colors.length)]);
    }
  }
  function drawTear(d, x, y) {
    const color = 14;
    fillEllipse(d, x, y, 2, 3, color);
    set(d, x, y - 3, color);
  }
  function drawSprout(d, x, y, dy) {
    const stemColor = 7;
    const leafColor = 6;
    for (let i = 0; i < 6; i++) {
      set(d, x, y - i + dy, stemColor);
    }
    fillEllipse(d, x - 3, y - 6 + dy, 3, 2, leafColor);
    fillEllipse(d, x + 3, y - 6 + dy, 3, 2, leafColor);
  }
  function drawBlush(d, x, y) {
    fillEllipse(d, x, y, 4, 2, 5);
  }
  function drawGhost(d, x, y, color) {
    fillEllipse(d, x, y, 8, 10, color);
    fillEllipse(d, x - 3, y + 8, 3, 4, color);
    fillEllipse(d, x + 3, y + 8, 3, 4, color);
    set(d, x - 3, y - 2, 8);
    set(d, x + 3, y - 2, 8);
  }
  function drawAntlers(d, x, y, color) {
    strokePolyline(d, [[x, y], [x - 8, y - 12], [x - 12, y - 20]], 2, color);
    strokePolyline(d, [[x - 8, y - 12], [x - 14, y - 10]], 1, color);
    strokePolyline(d, [[x, y], [x + 8, y - 12], [x + 12, y - 20]], 2, color);
    strokePolyline(d, [[x + 8, y - 12], [x + 14, y - 10]], 1, color);
  }
  function drawIncubator(d, x, y, type, progress, egg) {
    const baseColor = type === "basic" ? 10 : type === "premium" ? 17 : 12;
    const glassColor = 19;
    const highlightColor = 3;
    const darkBase = 11;
    fillEllipse(d, x, y + 20, 24, 8, baseColor);
    fillEllipse(d, x, y + 18, 20, 6, darkBase);
    if (egg) {
      drawEgg(d, x, y + 5, { ...egg });
    }
    const domeHeight = 30;
    const domeWidth = 20;
    for (let dy = 0; dy <= domeHeight; dy++) {
      const rx = Math.sqrt(1 - dy / domeHeight) * domeWidth;
      for (let dx = -rx; dx <= rx; dx++) {
        if ((Math.round(x + dx) + Math.round(y + 15 - dy)) % 2 === 0) {
          set(d, Math.round(x + dx), Math.round(y + 15 - dy), glassColor);
        }
      }
    }
    fillEllipse(d, x, y + 15 - domeHeight, 8, 4, baseColor);
    const lightColor = progress >= 100 ? 6 : 16;
    fillEllipse(d, x, y + 22, 4, 2, lightColor);
    set(d, Math.round(x - 10), Math.round(y + 5), highlightColor);
    set(d, Math.round(x - 8), Math.round(y + 2), highlightColor);
  }
  function drawDevLogo(d, x, y, type) {
    if (type === "react") {
      fillEllipse(d, x, y, 4, 4, 19);
      set(d, x, y, 3);
      strokePolyline(d, [
        [x - 3, y - 1],
        [x + 3, y + 1]
      ], 1, 19);
      strokePolyline(d, [
        [x - 3, y + 1],
        [x + 3, y - 1]
      ], 1, 19);
    } else if (type === "github") {
      fillEllipse(d, x, y, 5, 5, 8);
      fillEllipse(d, x - 2, y - 1, 1, 1, 3);
      fillEllipse(d, x + 2, y - 1, 1, 1, 3);
    } else if (type === "docker") {
      fillEllipse(d, x, y, 6, 4, 17);
      fillEllipse(d, x + 4, y - 2, 2, 2, 17);
      set(d, x - 2, y - 1, 3);
    } else if (type === "vscode") {
      fillTriangle(d, x - 4, y - 4, x + 4, y, x - 4, y + 4, 17);
      fillTriangle(d, x - 2, y - 2, x + 2, y, x - 2, y + 2, 19);
    }
  }
  function drawAccessory(d, hx, hy, bx, by, type) {
    const color = 8;
    if (type === "glasses") {
      strokePolyline(d, [[hx - 8, hy - 2], [hx - 2, hy - 2], [hx - 2, hy + 2], [hx - 8, hy + 2], [hx - 8, hy - 2]], 1, color);
      strokePolyline(d, [[hx + 2, hy - 2], [hx + 8, hy - 2], [hx + 8, hy + 2], [hx + 2, hy + 2], [hx + 2, hy - 2]], 1, color);
      set(d, hx - 1, hy, color);
      set(d, hx, hy, color);
      set(d, hx + 1, hy, color);
    } else if (type === "headphones") {
      strokePolyline(d, [[hx - 12, hy], [hx - 12, hy - 12], [hx + 12, hy - 12], [hx + 12, hy]], 2, 11);
      fillEllipse(d, hx - 12, hy, 4, 6, 8);
      fillEllipse(d, hx + 12, hy, 4, 6, 8);
    } else if (type === "coffee") {
      fillEllipse(d, bx + 14, by + 4, 4, 5, 3);
      fillEllipse(d, bx + 18, by + 4, 2, 3, 3);
      fillEllipse(d, bx + 14, by + 1, 3, 2, 11);
    } else if (type === "keyboard") {
      fillEllipse(d, bx, by + 12, 12, 4, 11);
      for (let i = -10; i <= 10; i += 4) {
        set(d, bx + i, by + 12, 3);
      }
    } else if (type === "crown") {
      fillTriangle(d, hx - 8, hy - 18, hx - 4, hy - 24, hx, hy - 18, 12);
      fillTriangle(d, hx - 4, hy - 18, hx, hy - 26, hx + 4, hy - 18, 12);
      fillTriangle(d, hx, hy - 18, hx + 4, hy - 24, hx + 8, hy - 18, 12);
      strokePolyline(d, [[hx - 8, hy - 18], [hx + 8, hy - 18]], 2, 12);
    }
  }
  function strokePolyline(d, points, width, color) {
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      for (let s = 0; s <= steps; s++) {
        const x = x1 + dx * s / steps;
        const y = y1 + dy * s / steps;
        for (let wy = -Math.floor(width / 2); wy <= Math.floor(width / 2); wy++) {
          for (let wx = -Math.floor(width / 2); wx <= Math.floor(width / 2); wx++) {
            set(d, Math.round(x + wx), Math.round(y + wy), color);
          }
        }
      }
    }
  }

  // ../../website/lib/pixel-lab/ideCompanion/AnimalSprites.ts
  var CX = 32;
  var CY = 32;
  var ORANGE = 1;
  var DARK_ORANGE = 2;
  var WHITE = 3;
  var LIGHT_ORANGE = 4;
  var PINK = 5;
  var GREEN = 6;
  var DARK_GREEN = 7;
  var BLACK = 8;
  var BROWN = 9;
  var GREY = 10;
  var DARK_GREY = 11;
  var YELLOW = 12;
  var LIGHT_GREY = 13;
  var RED = 15;
  var DARK_RED = 16;
  var BLUE = 17;
  var DARK_BLUE = 18;
  var LIGHT_BLUE = 19;
  var REACT_BLUE = 21;
  var PYTHON_BLUE = 24;
  var PYTHON_YELLOW = 25;
  var RUST_ORANGE = 26;
  function paintAnimal(p, mood, config) {
    let d = empty64();
    const {
      dy,
      lean,
      sproutDy,
      blink,
      tailAngle = 0,
      earAngle = 0,
      eggShake = 0,
      eggCrack = 0,
      eggEyesLookX = 0,
      eggEyesLookY = 0,
      eggBlink = false,
      isExploded = false,
      isHatched = false,
      accessory = "none",
      devLogo: phaseDevLogo = "none"
    } = p;
    const {
      primary,
      secondary,
      outline,
      highlight,
      hasTail,
      tailType,
      earType,
      muzzleType,
      devLogo: configDevLogo = "none"
    } = config;
    const effectiveDevLogo = phaseDevLogo !== "none" ? phaseDevLogo : configDevLogo || "none";
    if (mood === "hatching") {
      if (!isHatched) {
        drawEgg(d, CX, CY + 10, {
          shake: eggShake,
          crackLevel: eggCrack,
          eyesLookX: eggEyesLookX,
          eyesLookY: eggEyesLookY,
          blink: eggBlink,
          exploded: isExploded
        });
      }
      return toGrid(d);
    }
    const isDead = mood === "dead";
    const isAngry = mood === "angry";
    const isSad = mood === "sad";
    if (hasTail && !isDead) {
      const tx = CX - 18 + lean;
      const ty = CY + 14 + dy;
      const ta = tailAngle;
      if (tailType === "fox") {
        fillEllipse(d, tx + Math.cos(ta) * 10, ty + Math.sin(ta) * 5, 12, 8, primary);
        fillEllipse(d, tx + Math.cos(ta) * 18, ty + Math.sin(ta) * 8, 8, 6, WHITE);
      } else if (tailType === "cat") {
        strokePolyline(d, [[tx, ty], [tx - 10, ty - 10 - ta * 10], [tx - 15, ty - 5 - ta * 10]], 4, primary);
      } else if (tailType === "bear" || tailType === "rabbit") {
        fillEllipse(d, tx + 5, ty + 2, 6, 6, primary);
      } else if (tailType === "deer") {
        fillEllipse(d, tx + 5, ty + 2, 8, 4, primary);
      }
    }
    const bx = CX + lean;
    const by = CY + 18 + dy + (isDead ? 10 : 0);
    if (isDead) {
      fillEllipse(d, bx, by, 12, 16, primary);
      fillEllipse(d, bx + 4, by, 8, 10, WHITE);
    } else {
      fillEllipse(d, bx, by, 16, 12, primary);
      if (muzzleType === "penguin") {
        fillEllipse(d, bx, by, 12, 10, WHITE);
      } else {
        fillEllipse(d, bx, by + 4, 10, 8, WHITE);
      }
      if (effectiveDevLogo !== "none") {
        drawDevLogo(d, bx, by + 4, effectiveDevLogo);
      }
    }
    const hx = CX + lean + (isDead ? 12 : 0);
    const hy = CY + dy + (isDead ? 18 : 0);
    fillEllipse(d, hx, hy, 22, 18, primary);
    const ex = 14;
    const ey = -14;
    const ea = earAngle + (isSad ? 4 : 0) + (isAngry ? -2 : 0);
    if (!isDead) {
      if (earType === "fox" || earType === "cat") {
        fillTriangle(d, hx - ex - 4, hy + ey + 8, hx - ex - 10 - ea, hy + ey - 10 + ea, hx - ex + 4, hy + ey + 4, primary);
        fillTriangle(d, hx + ex + 4, hy + ey + 8, hx + ex + 10 + ea, hy + ey - 10 + ea, hx + ex - 4, hy + ey + 4, primary);
      } else if (earType === "bear") {
        fillEllipse(d, hx - ex - 4, hy + ey + 4, 8, 8, primary);
        fillEllipse(d, hx + ex + 4, hy + ey + 4, 8, 8, primary);
        fillEllipse(d, hx - ex - 4, hy + ey + 4, 4, 4, secondary);
        fillEllipse(d, hx + ex + 4, hy + ey + 4, 4, 4, secondary);
      } else if (earType === "rabbit") {
        fillEllipse(d, hx - ex, hy + ey - 10 - ea, 6, 16, primary);
        fillEllipse(d, hx + ex, hy + ey - 10 - ea, 6, 16, primary);
        fillEllipse(d, hx - ex, hy + ey - 10 - ea, 3, 10, PINK);
        fillEllipse(d, hx + ex, hy + ey - 10 - ea, 3, 10, PINK);
      } else if (earType === "deer") {
        fillEllipse(d, hx - ex - 6, hy + ey + 8 + ea, 10, 4, primary);
        fillEllipse(d, hx + ex + 6, hy + ey + 8 + ea, 10, 4, primary);
        drawAntlers(d, hx, hy - 12, BLACK);
      } else if (earType === "owl") {
        fillTriangle(d, hx - ex, hy + ey + 8, hx - ex - 4, hy + ey - 4, hx - ex + 4, hy + ey + 4, primary);
        fillTriangle(d, hx + ex, hy + ey + 8, hx + ex + 4, hy + ey - 4, hx + ex - 4, hy + ey + 4, primary);
      }
    }
    const mx = hx;
    const my = hy + 6;
    if (muzzleType === "fox" || muzzleType === "bear" || muzzleType === "deer") {
      fillEllipse(d, mx, my, 10, 8, WHITE);
      set(d, Math.round(mx), Math.round(my - 2), BLACK);
    } else if (muzzleType === "cat") {
      fillEllipse(d, mx, my, 10, 8, WHITE);
      set(d, Math.round(mx), Math.round(my - 2), PINK);
    } else if (muzzleType === "owl" || muzzleType === "penguin") {
      if (muzzleType === "penguin") {
        fillEllipse(d, mx, my - 2, 14, 10, WHITE);
      }
      fillTriangle(d, mx - 4, my - 2, mx, my + 6, mx + 4, my - 2, YELLOW);
    }
    const eyeY = hy - 2;
    const eyeDX = 10;
    drawChibiEyes(d, hx - eyeDX, hx + eyeDX, eyeY, mood, blink, { rw: 6, rh: 8 });
    if (!isDead && accessory !== "none") {
      drawAccessory(d, hx, hy, bx, by, accessory);
    }
    if (mood !== "sad" && mood !== "dead" && mood !== "angry") {
      drawBlush(d, hx - 14, hy + 8);
      drawBlush(d, hx + 14, hy + 8);
    }
    const px = 8;
    const py = 28;
    const footColor = muzzleType === "penguin" || muzzleType === "owl" ? YELLOW : BROWN;
    if (isDead) {
      fillEllipse(d, bx - 10, by + 4, 4, 3, footColor);
      fillEllipse(d, bx + 10, by + 4, 4, 3, footColor);
    } else if (muzzleType === "penguin") {
      fillEllipse(d, bx - 14, by, 4, 10, BLACK);
      fillEllipse(d, bx + 14, by, 4, 10, BLACK);
      fillEllipse(d, bx - 6, by + 10, 6, 4, YELLOW);
      fillEllipse(d, bx + 6, by + 10, 6, 4, YELLOW);
    } else {
      fillEllipse(d, bx - px, by + 8, 4, 3, footColor);
      fillEllipse(d, bx + px, by + 8, 4, 3, footColor);
    }
    if (!isDead) {
      drawSprout(d, hx, hy - 18, sproutDy + (isSad ? 4 : 0));
    }
    if (isSad) {
      fillEllipse(d, hx - 10, hy + 6, 3, 4, LIGHT_GREY);
      fillEllipse(d, hx + 10, hy + 6, 3, 4, LIGHT_GREY);
      if (p.tearY !== void 0) {
        drawTear(d, hx - 10, hy + 10 + p.tearY);
        drawTear(d, hx + 10, hy + 10 + p.tearY);
      }
    } else if (isAngry) {
      set(d, hx + 16, hy - 16, DARK_ORANGE);
      set(d, hx + 18, hy - 14, DARK_ORANGE);
      set(d, hx + 16, hy - 14, DARK_ORANGE);
      set(d, hx + 18, hy - 16, DARK_ORANGE);
    } else if (isDead) {
      drawGhost(d, CX, CY - 20 + sproutDy, WHITE);
    }
    return toGrid(d);
  }
  var FOX_VARIANTS = [
    { primary: ORANGE, secondary: DARK_ORANGE, outline: DARK_ORANGE, highlight: LIGHT_ORANGE, rarity: "Common", hasTail: true, tailType: "fox", earType: "fox", muzzleType: "fox" },
    { primary: RED, secondary: DARK_RED, outline: DARK_RED, highlight: PINK, rarity: "Rare", hasTail: true, tailType: "fox", earType: "fox", muzzleType: "fox" },
    { primary: BLUE, secondary: DARK_BLUE, outline: DARK_BLUE, highlight: LIGHT_BLUE, rarity: "Epic", hasTail: true, tailType: "fox", earType: "fox", muzzleType: "fox" },
    { primary: YELLOW, secondary: ORANGE, outline: ORANGE, highlight: WHITE, rarity: "Shiny", hasTail: true, tailType: "fox", earType: "fox", muzzleType: "fox" },
    { primary: LIGHT_BLUE, secondary: BLUE, outline: DARK_BLUE, highlight: WHITE, rarity: "Dev", hasTail: true, tailType: "fox", earType: "fox", muzzleType: "fox", devLogo: "react" },
    { primary: BLACK, secondary: DARK_GREY, outline: BLACK, highlight: WHITE, rarity: "Dev", hasTail: true, tailType: "fox", earType: "fox", muzzleType: "fox", devLogo: "github" }
  ];
  var BEAR_VARIANTS = [
    { primary: BROWN, secondary: BLACK, outline: BLACK, highlight: LIGHT_ORANGE, rarity: "Common", hasTail: true, tailType: "bear", earType: "bear", muzzleType: "bear" },
    { primary: GREY, secondary: DARK_GREY, outline: DARK_GREY, highlight: LIGHT_GREY, rarity: "Rare", hasTail: true, tailType: "bear", earType: "bear", muzzleType: "bear" },
    { primary: BLACK, secondary: DARK_GREY, outline: DARK_GREY, highlight: GREY, rarity: "Epic", hasTail: true, tailType: "bear", earType: "bear", muzzleType: "bear" },
    { primary: WHITE, secondary: LIGHT_GREY, outline: LIGHT_GREY, highlight: WHITE, rarity: "Shiny", hasTail: true, tailType: "bear", earType: "bear", muzzleType: "bear" },
    { primary: BLUE, secondary: DARK_BLUE, outline: BLACK, highlight: LIGHT_BLUE, rarity: "Dev", hasTail: true, tailType: "bear", earType: "bear", muzzleType: "bear", devLogo: "docker" }
  ];
  var CAT_VARIANTS = [
    { primary: GREY, secondary: DARK_GREY, outline: DARK_GREY, highlight: LIGHT_GREY, rarity: "Common", hasTail: false, tailType: "cat", earType: "cat", muzzleType: "cat" },
    { primary: ORANGE, secondary: DARK_ORANGE, outline: DARK_ORANGE, highlight: LIGHT_ORANGE, rarity: "Rare", hasTail: false, tailType: "cat", earType: "cat", muzzleType: "cat" },
    { primary: BLACK, secondary: DARK_GREY, outline: DARK_GREY, highlight: GREY, rarity: "Epic", hasTail: false, tailType: "cat", earType: "cat", muzzleType: "cat" },
    { primary: PINK, secondary: RED, outline: RED, highlight: PINK, rarity: "Shiny", hasTail: false, tailType: "cat", earType: "cat", muzzleType: "cat" },
    { primary: DARK_BLUE, secondary: BLUE, outline: BLACK, highlight: LIGHT_BLUE, rarity: "Dev", hasTail: false, tailType: "cat", earType: "cat", muzzleType: "cat", devLogo: "vscode" }
  ];
  var DEER_VARIANTS = [
    { primary: BROWN, secondary: WHITE, outline: BLACK, highlight: LIGHT_ORANGE, rarity: "Common", hasTail: true, tailType: "deer", earType: "deer", muzzleType: "deer" },
    { primary: DARK_GREY, secondary: WHITE, outline: BLACK, highlight: GREY, rarity: "Rare", hasTail: true, tailType: "deer", earType: "deer", muzzleType: "deer" },
    { primary: DARK_GREEN, secondary: GREEN, outline: BLACK, highlight: GREEN, rarity: "Epic", hasTail: true, tailType: "deer", earType: "deer", muzzleType: "deer" },
    { primary: YELLOW, secondary: WHITE, outline: ORANGE, highlight: WHITE, rarity: "Shiny", hasTail: true, tailType: "deer", earType: "deer", muzzleType: "deer" },
    { primary: PYTHON_BLUE, secondary: PYTHON_YELLOW, outline: BLACK, highlight: WHITE, rarity: "Dev", hasTail: true, tailType: "deer", earType: "deer", muzzleType: "deer", devLogo: "vscode" }
  ];
  var OWL_VARIANTS = [
    { primary: BROWN, secondary: WHITE, outline: BLACK, highlight: LIGHT_ORANGE, rarity: "Common", hasTail: false, earType: "owl", muzzleType: "owl" },
    { primary: GREY, secondary: WHITE, outline: BLACK, highlight: LIGHT_GREY, rarity: "Rare", hasTail: false, earType: "owl", muzzleType: "owl" },
    { primary: DARK_BLUE, secondary: BLUE, outline: BLACK, highlight: LIGHT_BLUE, rarity: "Epic", hasTail: false, earType: "owl", muzzleType: "owl" },
    { primary: WHITE, secondary: YELLOW, outline: GREY, highlight: WHITE, rarity: "Shiny", hasTail: false, earType: "owl", muzzleType: "owl" },
    { primary: RUST_ORANGE, secondary: WHITE, outline: BLACK, highlight: WHITE, rarity: "Dev", hasTail: false, earType: "owl", muzzleType: "owl", devLogo: "github" }
  ];
  var PENGUIN_VARIANTS = [
    { primary: BLACK, secondary: WHITE, outline: BLACK, highlight: GREY, rarity: "Common", hasTail: false, earType: "bear", muzzleType: "penguin" },
    { primary: DARK_BLUE, secondary: WHITE, outline: BLACK, highlight: BLUE, rarity: "Rare", hasTail: false, earType: "bear", muzzleType: "penguin" },
    { primary: DARK_GREY, secondary: WHITE, outline: BLACK, highlight: GREY, rarity: "Epic", hasTail: false, earType: "bear", muzzleType: "penguin" },
    { primary: BLUE, secondary: WHITE, outline: BLACK, highlight: LIGHT_BLUE, rarity: "Shiny", hasTail: false, earType: "bear", muzzleType: "penguin" },
    { primary: REACT_BLUE, secondary: WHITE, outline: DARK_BLUE, highlight: WHITE, rarity: "Dev", hasTail: false, earType: "bear", muzzleType: "penguin", devLogo: "react" }
  ];
  var RABBIT_VARIANTS = [
    { primary: WHITE, secondary: PINK, outline: GREY, highlight: WHITE, rarity: "Common", hasTail: true, tailType: "rabbit", earType: "rabbit", muzzleType: "fox" },
    { primary: LIGHT_GREY, secondary: PINK, outline: GREY, highlight: WHITE, rarity: "Rare", hasTail: true, tailType: "rabbit", earType: "rabbit", muzzleType: "fox" },
    { primary: BROWN, secondary: PINK, outline: BLACK, highlight: LIGHT_ORANGE, rarity: "Epic", hasTail: true, tailType: "rabbit", earType: "rabbit", muzzleType: "fox" },
    { primary: YELLOW, secondary: PINK, outline: ORANGE, highlight: WHITE, rarity: "Shiny", hasTail: true, tailType: "rabbit", earType: "rabbit", muzzleType: "fox" },
    { primary: WHITE, secondary: DARK_BLUE, outline: BLACK, highlight: LIGHT_BLUE, rarity: "Dev", hasTail: true, tailType: "rabbit", earType: "rabbit", muzzleType: "fox", devLogo: "docker" }
  ];
  var ANIMAL_CONFIGS = {
    fox: FOX_VARIANTS,
    bear: BEAR_VARIANTS,
    cat: CAT_VARIANTS,
    deer: DEER_VARIANTS,
    owl: OWL_VARIANTS,
    penguin: PENGUIN_VARIANTS,
    rabbit: RABBIT_VARIANTS
  };
  function rarityToVariantIndex(rarity) {
    const r = String(rarity ?? "Common").trim().toLowerCase();
    if (r === "rare") return 1;
    if (r === "epic") return 2;
    if (r === "legendary" || r === "shiny") return 3;
    if (r === "dev") return 4;
    return 0;
  }
  var getIdlePhases = () => [
    { dy: 0, lean: 0, sproutDy: 0, tailAngle: 0, earAngle: 0 },
    { dy: 1, lean: 0, sproutDy: 1, tailAngle: 0.2, earAngle: 1 },
    { dy: 0, lean: 0, sproutDy: 0, tailAngle: 0.4, earAngle: 0, blink: true },
    { dy: 1, lean: 0, sproutDy: 1, tailAngle: 0.2, earAngle: 1 }
  ];
  var getWalkPhases = () => [
    { dy: 0, lean: 0, sproutDy: 0, tailAngle: 0, earAngle: 0 },
    { dy: -4, lean: 2, sproutDy: -2, tailAngle: -0.5, earAngle: -2 },
    { dy: 0, lean: 0, sproutDy: 0, tailAngle: 0, earAngle: 0 },
    { dy: -4, lean: -2, sproutDy: -2, tailAngle: 0.5, earAngle: 2 }
  ];
  var getHappyPhases = () => [
    { dy: 0, lean: 0, sproutDy: 0, tailAngle: 0, earAngle: 0 },
    { dy: -8, lean: 0, sproutDy: -4, tailAngle: 1, earAngle: 5 },
    { dy: -2, lean: 0, sproutDy: -1, tailAngle: 0.5, earAngle: 2 },
    { dy: -10, lean: 0, sproutDy: -5, tailAngle: 1.5, earAngle: 5 }
  ];
  var getSadPhases = () => [
    { dy: 4, lean: 0, sproutDy: 2, tailAngle: -0.5, earAngle: -5, tearY: 0 },
    { dy: 6, lean: 0, sproutDy: 3, tailAngle: -0.6, earAngle: -6, blink: true, tearY: 4 },
    { dy: 4, lean: 0, sproutDy: 2, tailAngle: -0.5, earAngle: -5, tearY: 8 },
    { dy: 6, lean: 0, sproutDy: 3, tailAngle: -0.6, earAngle: -6, tearY: 12 }
  ];
  var getAngryPhases = () => [
    { dy: 0, lean: 0, sproutDy: 0, tailAngle: 0, earAngle: 0 },
    { dy: -2, lean: 1, sproutDy: -1, tailAngle: 0.5, earAngle: 2 },
    { dy: 0, lean: -1, sproutDy: 0, tailAngle: -0.5, earAngle: -2 },
    { dy: -2, lean: 1, sproutDy: -1, tailAngle: 0.5, earAngle: 2 }
  ];
  var getDeadPhases = () => [
    { dy: 0, lean: 0, sproutDy: 0, tailAngle: 0, earAngle: 0 },
    { dy: 0, lean: 0, sproutDy: -2, tailAngle: 0, earAngle: 0 },
    { dy: 0, lean: 0, sproutDy: -4, tailAngle: 0, earAngle: 0 },
    { dy: 0, lean: 0, sproutDy: -2, tailAngle: 0, earAngle: 0 }
  ];
  var getHatchingPhases = () => [
    // Shake
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 2, eggCrack: 0 },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: -2, eggCrack: 0 },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 4, eggCrack: 0 },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: -4, eggCrack: 0 },
    // Crack 1 (Middle)
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 1 },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 2, eggCrack: 1 },
    // Crack 2 (Eyes pop out)
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, eggEyesLookX: 0, eggEyesLookY: 0 },
    // Look Left
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, eggEyesLookX: -3, eggEyesLookY: 0 },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, eggEyesLookX: -3, eggEyesLookY: 0 },
    // Look Right
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, eggEyesLookX: 3, eggEyesLookY: 0 },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, eggEyesLookX: 3, eggEyesLookY: 0 },
    // Center & Blink
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, eggEyesLookX: 0, eggEyesLookY: 0 },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, eggEyesLookX: 0, eggEyesLookY: 0, eggBlink: true },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, eggEyesLookX: 0, eggEyesLookY: 0, eggBlink: false },
    // Explode
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, isExploded: true },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, isExploded: true },
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, isExploded: true },
    // Empty (no pet)
    { dy: 0, lean: 0, sproutDy: 0, eggShake: 0, eggCrack: 2, isHatched: true }
  ];
  var buildAnimalFrames = (type, mood, isWalking, variantIndex = 0, accessory = "none", _growthScale = 1, devLogo = "none", _growthStage = "sprout") => {
    const variants = type === "egg" ? ANIMAL_CONFIGS.fox : ANIMAL_CONFIGS[type];
    const config = variants[variantIndex % variants.length];
    const effectiveMood = type === "egg" ? "hatching" : mood;
    let phases;
    if (isWalking && type !== "egg") phases = getWalkPhases();
    else if (effectiveMood === "happy") phases = getHappyPhases();
    else if (effectiveMood === "sad") phases = getSadPhases();
    else if (effectiveMood === "angry") phases = getAngryPhases();
    else if (effectiveMood === "dead") phases = getDeadPhases();
    else if (effectiveMood === "hatching") phases = getHatchingPhases();
    else phases = getIdlePhases();
    return phases.map(
      (f) => paintAnimal({ ...f, accessory, devLogo }, effectiveMood, config)
    );
  };

  // ../../website/lib/pixel-lab/ideCompanion/IncubatorSprite.ts
  var CX2 = 32;
  var CY2 = 32;
  function buildIncubatorFrames(type, progress, hasEgg) {
    const frames = [];
    for (let i = 0; i < 4; i++) {
      const d = empty64();
      const shake = hasEgg ? Math.sin(i * Math.PI / 2) : 0;
      const frameProgress = Math.min(99, progress + i * 5);
      const crackLevel = hasEgg ? frameProgress > 75 ? 2 : frameProgress > 40 ? 1 : 0 : 0;
      drawIncubator(
        d,
        CX2,
        CY2,
        type,
        frameProgress,
        hasEgg ? { shake, crackLevel } : void 0
      );
      frames.push(toGrid(d));
    }
    return frames;
  }

  // media-src/pixel-sprite.ts
  function normalizeIncubatorType(raw) {
    const s = String(raw || "").toLowerCase().trim();
    if (s === "basic" || s === "premium" || s === "super") return s;
    return null;
  }
  function drawIdeCompanionFrame(ctx, grid, ox = 0, oy = 0) {
    const n = grid.length;
    for (let y = 0; y < n; y++) {
      const row = grid[y];
      if (!row) continue;
      for (let x = 0; x < n; x++) {
        const idx = row[x] ?? 0;
        const hex = IDE_COMPANION_PALETTE[idx];
        if (idx === 0 || !hex || hex === "transparent") continue;
        ctx.fillStyle = hex;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  function speciesKeyFromApi(speciesRaw) {
    const s = String(speciesRaw || "").toLowerCase();
    const keys = ["cat", "fox", "bear", "owl", "deer", "penguin", "rabbit"];
    for (const k of keys) {
      if (s.includes(k)) return k;
    }
    if (s.includes("tiger") || s.includes("elephant")) return "bear";
    if (s.includes("dragon")) return "fox";
    return "bear";
  }
  function vitalsToAnimation(v) {
    const { rest, water, food, health } = v;
    if (health <= 0) return { mood: "dead", isWalking: false };
    const careAvg = (rest + water + food) / 3;
    if (health < 20 || careAvg < 22) return { mood: "sad", isWalking: false };
    if (health < 50 && food < 28) return { mood: "angry", isWalking: false };
    if (careAvg >= 75 && health >= 75) return { mood: "happy", isWalking: false };
    if (careAvg >= 52 && rest >= 60 && health >= 45) return { mood: "neutral", isWalking: true };
    return { mood: "neutral", isWalking: false };
  }
  function apiMoodToIdeMood(m) {
    if (!m) return null;
    const x = m.toLowerCase();
    if (x.includes("happy")) return "happy";
    if (x.includes("sad")) return "sad";
    if (x.includes("angry")) return "angry";
    if (x.includes("dead")) return "dead";
    if (x.includes("surprise")) return "surprised";
    if (x.includes("hatch")) return "hatching";
    if (x.includes("neutral") || x.includes("idle") || x.includes("calm")) return "neutral";
    return null;
  }
  function resolvePetAnimation(p) {
    if (String(p.growthStage || "") === "Egg") {
      return { type: "egg", mood: "hatching", isWalking: false };
    }
    const type = speciesKeyFromApi(p.species);
    if (p.isDead || p.isDormant || p.health <= 0) {
      return { type, mood: "dead", isWalking: false };
    }
    const parsed = apiMoodToIdeMood(p.mood);
    if (parsed && parsed !== "neutral") {
      return { type, mood: parsed, isWalking: false };
    }
    const v = vitalsToAnimation({
      rest: p.rest,
      water: p.water,
      food: p.food,
      health: p.health
    });
    return { type, mood: v.mood, isWalking: v.isWalking };
  }
  function buildPetFrames(p) {
    if (String(p.growthStage || "") === "Egg") {
      const inc = normalizeIncubatorType(p.incubatorType);
      if (inc) {
        return buildIncubatorFrames(inc, 42, true);
      }
    }
    const { type, mood, isWalking } = resolvePetAnimation(p);
    const variant = type === "egg" ? 0 : rarityToVariantIndex(p.rarity);
    return buildAnimalFrames(type, mood, isWalking, variant);
  }
  function drawPetFrame(ctx, p, frameIndex) {
    const frames = buildPetFrames(p);
    const grid = frames[frameIndex % frames.length];
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);
    drawIdeCompanionFrame(ctx, grid, 0, 0);
  }
  var SproutsPixel = {
    GRID: 64,
    speciesKeyFromApi,
    vitalsToAnimation,
    apiMoodToIdeMood,
    resolvePetAnimation,
    rarityToVariantIndex,
    buildAnimalFrames,
    buildIncubatorFrames,
    buildPetFrames,
    drawIdeCompanionFrame,
    drawPetFrame
  };
  window.SproutsPixel = SproutsPixel;
})();

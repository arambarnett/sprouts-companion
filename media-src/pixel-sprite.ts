/**
 * Browser bundle entry: procedural 64² sprites (same pipeline as website Pixel Lab).
 * Build: npm run bundle-pixel-sprite → media/dist/sprouts-pixel.js
 */
import { IDE_COMPANION_PALETTE } from "../../../website/lib/pixel-lab/ideCompanion/constants"
import {
  buildAnimalFrames,
  ANIMAL_CONFIGS,
  rarityToVariantIndex,
} from "../../../website/lib/pixel-lab/ideCompanion/AnimalSprites"
import { buildIncubatorFrames } from "../../../website/lib/pixel-lab/ideCompanion/IncubatorSprite"
import type { FrameGrid, IncubatorType, Mood } from "../../../website/lib/pixel-lab/ideCompanion/types"

export type AnimalType = keyof typeof ANIMAL_CONFIGS

function normalizeIncubatorType(raw: string | undefined): IncubatorType | null {
  const s = String(raw || "").toLowerCase().trim()
  if (s === "basic" || s === "premium" || s === "super") return s
  return null
}

function drawIdeCompanionFrame(ctx: CanvasRenderingContext2D, grid: FrameGrid, ox = 0, oy = 0): void {
  const n = grid.length
  for (let y = 0; y < n; y++) {
    const row = grid[y]
    if (!row) continue
    for (let x = 0; x < n; x++) {
      const idx = row[x] ?? 0
      const hex = IDE_COMPANION_PALETTE[idx]
      if (idx === 0 || !hex || hex === "transparent") continue
      ctx.fillStyle = hex
      ctx.fillRect(ox + x, oy + y, 1, 1)
    }
  }
}

export function speciesKeyFromApi(speciesRaw: string | undefined): AnimalType {
  const s = String(speciesRaw || "").toLowerCase()
  const keys: AnimalType[] = ["cat", "fox", "bear", "owl", "deer", "penguin", "rabbit"]
  for (const k of keys) {
    if (s.includes(k)) return k
  }
  if (s.includes("tiger") || s.includes("elephant")) return "bear"
  if (s.includes("dragon")) return "fox"
  return "bear"
}

/** Match website vitalsToMood → IDE buildAnimalFrames (neutral + walk). */
export function vitalsToAnimation(v: {
  rest: number
  water: number
  food: number
  health: number
}): { mood: Mood; isWalking: boolean } {
  const { rest, water, food, health } = v
  if (health <= 0) return { mood: "dead", isWalking: false }
  const careAvg = (rest + water + food) / 3
  if (health < 20 || careAvg < 22) return { mood: "sad", isWalking: false }
  if (health < 50 && food < 28) return { mood: "angry", isWalking: false }
  if (careAvg >= 75 && health >= 75) return { mood: "happy", isWalking: false }
  if (careAvg >= 52 && rest >= 60 && health >= 45) return { mood: "neutral", isWalking: true }
  return { mood: "neutral", isWalking: false }
}

export function apiMoodToIdeMood(m: string | undefined): Mood | null {
  if (!m) return null
  const x = m.toLowerCase()
  if (x.includes("happy")) return "happy"
  if (x.includes("sad")) return "sad"
  if (x.includes("angry")) return "angry"
  if (x.includes("dead")) return "dead"
  if (x.includes("surprise")) return "surprised"
  if (x.includes("hatch")) return "hatching"
  if (x.includes("neutral") || x.includes("idle") || x.includes("calm")) return "neutral"
  return null
}

export type PetPixelParams = {
  species: string | undefined
  growthStage: string | undefined
  mood: string | undefined
  rest: number
  water: number
  food: number
  health: number
  /** Drives color variant (Common / Rare / Epic / Legendary|Shiny). */
  rarity?: string | undefined
  /** When true, show dead pose regardless of API mood (dormant / neglect). */
  isDormant?: boolean
  /** Explicit death flag from API (always dead pose). */
  isDead?: boolean
  /**
   * When growthStage is Egg and this matches API `sprout.incubator.type`, show incubator + egg sprite.
   * Omit or invalid → plain egg (AnimalSprites).
   */
  incubatorType?: string | undefined
}

export function resolvePetAnimation(p: PetPixelParams): { type: AnimalType | "egg"; mood: Mood; isWalking: boolean } {
  if (String(p.growthStage || "") === "Egg") {
    return { type: "egg", mood: "hatching", isWalking: false }
  }
  const type = speciesKeyFromApi(p.species)
  if (p.isDead || p.isDormant || p.health <= 0) {
    return { type, mood: "dead", isWalking: false }
  }
  const parsed = apiMoodToIdeMood(p.mood)
  if (parsed && parsed !== "neutral") {
    return { type, mood: parsed, isWalking: false }
  }
  const v = vitalsToAnimation({
    rest: p.rest,
    water: p.water,
    food: p.food,
    health: p.health,
  })
  return { type, mood: v.mood, isWalking: v.isWalking }
}

export function buildPetFrames(p: PetPixelParams): FrameGrid[] {
  if (String(p.growthStage || "") === "Egg") {
    const inc = normalizeIncubatorType(p.incubatorType)
    if (inc) {
      // Idle visual (no real % until server-driven hatch progress exists)
      return buildIncubatorFrames(inc, 42, true)
    }
  }
  const { type, mood, isWalking } = resolvePetAnimation(p)
  const variant = type === "egg" ? 0 : rarityToVariantIndex(p.rarity)
  return buildAnimalFrames(type, mood, isWalking, variant)
}

export function drawPetFrame(ctx: CanvasRenderingContext2D, p: PetPixelParams, frameIndex: number): void {
  const frames = buildPetFrames(p)
  const grid = frames[frameIndex % frames.length]!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, 64, 64)
  drawIdeCompanionFrame(ctx, grid, 0, 0)
}

const SproutsPixel = {
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
  drawPetFrame,
}

declare global {
  interface Window {
    SproutsPixel: typeof SproutsPixel
  }
}

window.SproutsPixel = SproutsPixel

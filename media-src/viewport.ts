/**
 * Bundled for the Companion webview (esbuild → media/dist/sprouts-viewport.js).
 * Prefers species GLB from media/models/{species}.glb; falls back to PNG on a plane.
 * Uses AnimationMixer when the GLB includes named clips (idle, happy, tired, celebrate, etc.).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type SproutsViewportApi = {
  mount(container: HTMLElement): void;
  update(opts: { textureUrl: string; mood: string; modelUrl?: string }): void;
  /** Short celebration (e.g. after save) — prefers a "celebrate" / "happy" clip if present. */
  celebrate(): void;
  /** Click / tap reaction: plays a one-shot clip if the GLB has one, else {@link celebrate}. */
  poke(): void;
  dispose(): void;
};

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let motionRoot: THREE.Group | null = null;
let planeMesh: THREE.Mesh | null = null;
let gltfRoot: THREE.Object3D | null = null;
let mixer: THREE.AnimationMixer | null = null;
let animationClips: THREE.AnimationClip[] = [];
let currentAction: THREE.AnimationAction | null = null;
let rafId = 0;
let clock = new THREE.Clock();
let bobAmp = 0.08;
let rotSpeed = 0.35;
let resizeObserver: ResizeObserver | null = null;
let mountedEl: HTMLElement | null = null;
let loadGeneration = 0;
/** Base mood from last update (ignoring short celebrate override). */
let lastMood = "happy";
let celebrateUntil = 0;
let wasCelebrating = false;
let orbitControls: OrbitControls | null = null;
let pointerDownX = 0;
let pointerDownY = 0;
let pointerDownAt = 0;
let onPointerDown: ((e: PointerEvent) => void) | null = null;
let onPointerUp: ((e: PointerEvent) => void) | null = null;

const gltfLoader = new GLTFLoader();

function setMoodMotion(mood: string): void {
  const m = (mood || "happy").toLowerCase();
  if (m === "distressed" || m === "sad") {
    bobAmp = 0.018;
    rotSpeed = 0.1;
  } else if (m === "neutral" || m === "content") {
    bobAmp = 0.05;
    rotSpeed = 0.2;
  } else if (m === "ecstatic" || m === "happy") {
    bobAmp = 0.085;
    rotSpeed = 0.38;
  } else {
    bobAmp = 0.055;
    rotSpeed = 0.26;
  }
}

function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const mats = child.material;
      if (Array.isArray(mats)) mats.forEach((m) => m.dispose());
      else if (mats) mats.dispose();
    }
  });
}

function normalizeCharacter(model: THREE.Object3D): void {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 1.55 / maxDim;
  model.scale.setScalar(scale);
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
}

function applyTextureToPlane(url: string, generation: number): void {
  if (!planeMesh || !(planeMesh.material instanceof THREE.MeshStandardMaterial)) return;
  const mat = planeMesh.material as THREE.MeshStandardMaterial;
  const loader = new THREE.TextureLoader();
  loader.load(
    url,
    (tex) => {
      if (generation !== loadGeneration) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      if (mat.map) mat.map.dispose();
      mat.map = tex;
      mat.needsUpdate = true;
      planeMesh!.visible = true;
    },
    undefined,
    () => {
      /* ignore */
    }
  );
}

function clearGltf(): void {
  if (currentAction) {
    currentAction.stop();
    currentAction = null;
  }
  mixer = null;
  animationClips = [];
  if (!motionRoot || !gltfRoot) return;
  motionRoot.remove(gltfRoot);
  disposeObject3D(gltfRoot);
  gltfRoot = null;
}

function findClipByHints(hints: string[]): THREE.AnimationClip | null {
  const lower = animationClips.map((c) => ({ c, n: c.name.toLowerCase() }));
  for (const h of hints) {
    const hit = lower.find(({ n }) => n.includes(h));
    if (hit) return hit.c;
  }
  return animationClips[0] || null;
}

/** One-shot interact clip; falls back to mood loop if timing fires first. */
let interactRestoreTimer = 0;

function playInteractOrCelebrate(): void {
  if (interactRestoreTimer) {
    window.clearTimeout(interactRestoreTimer);
    interactRestoreTimer = 0;
  }
  if (mixer && animationClips.length && gltfRoot) {
    const clip = findClipByHints([
      "wave",
      "tap",
      "poke",
      "greet",
      "dance",
      "jump",
      "click",
      "interact",
    ]);
    if (clip) {
      const action = mixer.clipAction(clip);
      if (currentAction && currentAction !== action) {
        currentAction.fadeOut(0.12);
      }
      action.reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.fadeIn(0.12).play();
      currentAction = action;
      const ms = Math.min(
        9000,
        Math.max(400, (clip.duration / Math.max(action.getEffectiveTimeScale(), 0.01)) * 1000 + 200)
      );
      interactRestoreTimer = window.setTimeout(() => {
        interactRestoreTimer = 0;
        if (currentAction === action) {
          playClipForMood(lastMood);
        }
      }, ms);
      return;
    }
  }
  celebrateUntil = (typeof performance !== "undefined" ? performance.now() : 0) + 2800;
  applyMoodToCharacter(lastMood);
}

function playClipForMood(effectiveMood: string): void {
  if (!mixer || !animationClips.length || !gltfRoot) return;
  const m = effectiveMood.toLowerCase();
  let hints: string[] = ["idle"];
  if (m === "distressed" || m === "sad") hints = ["tired", "sad", "sleep", "idle"];
  else if (m === "neutral" || m === "content") hints = ["idle", "neutral"];
  else if (m === "ecstatic" || m === "happy") hints = ["happy", "celebrate", "excited", "idle"];
  const clip = findClipByHints(hints);
  if (!clip) return;
  const next = mixer.clipAction(clip);
  if (currentAction === next) return;
  if (currentAction) {
    currentAction.fadeOut(0.2);
  }
  next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.25).play();
  currentAction = next;
}

function applyMoodToCharacter(baseMood: string): void {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const effective = now < celebrateUntil ? "ecstatic" : baseMood;
  setMoodMotion(effective);
  playClipForMood(effective);
}

function renderLoop(): void {
  rafId = requestAnimationFrame(renderLoop);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const celebrating = now < celebrateUntil;
  if (wasCelebrating && !celebrating && mixer) {
    setMoodMotion(lastMood);
    playClipForMood(lastMood);
  }
  wasCelebrating = celebrating;
  if (mixer) mixer.update(dt);
  orbitControls?.update();
  if (motionRoot && camera && renderer && scene) {
    motionRoot.position.y = Math.sin(t * 1.85) * bobAmp;
    renderer.render(scene, camera);
  }
}

const api: SproutsViewportApi = {
  mount(container: HTMLElement): void {
    api.dispose();
    mountedEl = container;
    const w = Math.max(container.clientWidth, 160);
    const h = Math.max(container.clientHeight, 160);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      mountedEl = null;
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 0.06, 2.45);

    scene.add(new THREE.AmbientLight(0xfff5f0, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 0.62);
    key.position.set(0.55, 1.15, 0.95);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8dcff, 0.28);
    fill.position.set(-0.95, 0.35, 0.55);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe0c8, 0.22);
    rim.position.set(0, 0.4, -1);
    scene.add(rim);

    motionRoot = new THREE.Group();
    scene.add(motionRoot);

    const geo = new THREE.PlaneGeometry(1.55, 1.55);
    const mat = new THREE.MeshStandardMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.04,
      depthWrite: true,
    });
    planeMesh = new THREE.Mesh(geo, mat);
    motionRoot.add(planeMesh);

    resizeObserver = new ResizeObserver(() => {
      if (!renderer || !camera || !mountedEl) return;
      const cw = Math.max(mountedEl.clientWidth, 160);
      const ch = Math.max(mountedEl.clientHeight, 160);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    });
    resizeObserver.observe(container);

    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.target.set(0, 0.04, 0);
    orbitControls.minDistance = 1.25;
    orbitControls.maxDistance = 4.8;
    orbitControls.minPolarAngle = 0.32;
    orbitControls.maxPolarAngle = Math.PI * 0.5;
    orbitControls.enablePan = false;
    orbitControls.rotateSpeed = 0.85;

    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.touchAction = "none";

    onPointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
      pointerDownAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      renderer.domElement.style.cursor = "grabbing";
    };
    onPointerUp = (e: PointerEvent) => {
      renderer.domElement.style.cursor = "grab";
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const dt = now - pointerDownAt;
      const dx = e.clientX - pointerDownX;
      const dy = e.clientY - pointerDownY;
      if (dt < 450 && dx * dx + dy * dy < 64) {
        playInteractOrCelebrate();
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", () => {
      renderer!.domElement.style.cursor = "grab";
    });

    clock = new THREE.Clock();
    renderLoop();
  },

  update(opts: { textureUrl: string; mood: string; modelUrl?: string }): void {
    lastMood = opts.mood;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const effectiveMood = now < celebrateUntil ? "ecstatic" : opts.mood;
    setMoodMotion(effectiveMood);
    const generation = ++loadGeneration;

    const usePlaneFallback = (): void => {
      clearGltf();
      if (planeMesh) planeMesh.visible = true;
      applyTextureToPlane(opts.textureUrl, generation);
    };

    if (!opts.modelUrl || !motionRoot) {
      usePlaneFallback();
      return;
    }

    gltfLoader.load(
      opts.modelUrl,
      (gltf) => {
        if (generation !== loadGeneration || !motionRoot) return;
        clearGltf();
        const root = gltf.scene.clone(true);
        normalizeCharacter(root);
        gltfRoot = root;
        motionRoot.add(root);
        if (planeMesh) planeMesh.visible = false;
        animationClips = gltf.animations || [];
        if (animationClips.length && gltfRoot) {
          mixer = new THREE.AnimationMixer(gltfRoot);
          applyMoodToCharacter(opts.mood);
        } else {
          mixer = null;
        }
      },
      undefined,
      () => {
        if (generation !== loadGeneration) return;
        usePlaneFallback();
      }
    );
  },

  celebrate(): void {
    celebrateUntil = (typeof performance !== "undefined" ? performance.now() : 0) + 2800;
    applyMoodToCharacter(lastMood);
  },

  poke(): void {
    playInteractOrCelebrate();
  },

  dispose(): void {
    loadGeneration += 1;
    if (interactRestoreTimer) {
      window.clearTimeout(interactRestoreTimer);
      interactRestoreTimer = 0;
    }
    cancelAnimationFrame(rafId);
    rafId = 0;
    if (renderer && onPointerDown && onPointerUp) {
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
    }
    onPointerDown = null;
    onPointerUp = null;
    orbitControls?.dispose();
    orbitControls = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    mountedEl = null;
    celebrateUntil = 0;
    clearGltf();
    if (planeMesh) {
      const mat = planeMesh.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.dispose();
      planeMesh.geometry.dispose();
      mat.dispose();
      planeMesh = null;
    }
    motionRoot = null;
    scene = null;
    camera = null;
    if (renderer) {
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      renderer.dispose();
      renderer = null;
    }
  },
};

(globalThis as unknown as { SproutsViewport: SproutsViewportApi }).SproutsViewport = api;

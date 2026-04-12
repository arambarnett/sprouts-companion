"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Bundled for the Companion webview (esbuild → media/dist/sprouts-viewport.js).
 * MVP: species PNG as texture on a plane; motion from mood.
 */
const THREE = require("three");
let renderer = null;
let scene = null;
let camera = null;
let mesh = null;
let rafId = 0;
let clock = new THREE.Clock();
let bobAmp = 0.08;
let rotSpeed = 0.35;
let resizeObserver = null;
let mountedEl = null;
function setMoodMotion(mood) {
    const m = (mood || "happy").toLowerCase();
    if (m === "distressed" || m === "sad") {
        bobAmp = 0.025;
        rotSpeed = 0.12;
    }
    else if (m === "neutral" || m === "content") {
        bobAmp = 0.065;
        rotSpeed = 0.22;
    }
    else if (m === "ecstatic" || m === "happy") {
        bobAmp = 0.11;
        rotSpeed = 0.42;
    }
    else {
        bobAmp = 0.07;
        rotSpeed = 0.28;
    }
}
function renderLoop() {
    rafId = requestAnimationFrame(renderLoop);
    const t = clock.getElapsedTime();
    if (mesh && camera && renderer && scene) {
        mesh.position.y = Math.sin(t * 1.85) * bobAmp;
        mesh.rotation.y += 0.014 * rotSpeed;
        renderer.render(scene, camera);
    }
}
const api = {
    mount(container) {
        api.dispose();
        mountedEl = container;
        const w = Math.max(container.clientWidth, 160);
        const h = Math.max(container.clientHeight, 160);
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        }
        catch {
            mountedEl = null;
            return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
        camera.position.z = 2.35;
        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 0.55);
        key.position.set(0.4, 1.2, 1);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xaaccff, 0.2);
        fill.position.set(-1, 0.2, 0.5);
        scene.add(fill);
        const geo = new THREE.PlaneGeometry(1.55, 1.55);
        const mat = new THREE.MeshStandardMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            roughness: 0.5,
            metalness: 0.02,
            depthWrite: true,
        });
        mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        resizeObserver = new ResizeObserver(() => {
            if (!renderer || !camera || !mountedEl)
                return;
            const cw = Math.max(mountedEl.clientWidth, 160);
            const ch = Math.max(mountedEl.clientHeight, 160);
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
            renderer.setSize(cw, ch);
        });
        resizeObserver.observe(container);
        clock = new THREE.Clock();
        renderLoop();
    },
    update(opts) {
        setMoodMotion(opts.mood);
        if (!mesh || !(mesh.material instanceof THREE.MeshStandardMaterial))
            return;
        const loader = new THREE.TextureLoader();
        loader.load(opts.textureUrl, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            const mat = mesh.material;
            if (mat.map)
                mat.map.dispose();
            mat.map = tex;
            mat.needsUpdate = true;
        }, undefined, () => {
            /* ignore load errors */
        });
    },
    dispose() {
        cancelAnimationFrame(rafId);
        rafId = 0;
        resizeObserver?.disconnect();
        resizeObserver = null;
        mountedEl = null;
        if (mesh) {
            const mat = mesh.material;
            if (mat.map)
                mat.map.dispose();
            mesh.geometry.dispose();
            mat.dispose();
            mesh = null;
        }
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
globalThis.SproutsViewport = api;
//# sourceMappingURL=viewport.js.map
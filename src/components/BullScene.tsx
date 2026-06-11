import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import bullObjSrc from "../assets/bullhead.obj?raw";
import BullMark from "./BullMark";

/**
 * Low-poly bull head (user-supplied OBJ) rendered with Three.js — the Landing
 * hero graphic. Loaded with OBJLoader, given a flat-shaded brand-green material,
 * auto-centred and scaled to fit. Sways gently and tilts toward the pointer;
 * falls back to the static SVG mark when the user prefers reduced motion or when
 * WebGL is unavailable. Self-contained: creates its own renderer and tears
 * everything down on unmount. Lazy-loaded so three.js stays out of the app
 * bundle (see Landing).
 */
export default function BullScene({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  // If WebGL is unavailable or three.js throws on this device/WebView, swap in
  // the static SVG mark — the decorative bull must never crash the app.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      // No WebGL context (common on locked-down / low-end Android WebViews).
      console.warn("BullScene: WebGL unavailable, using static mark.", e);
      setFailed(true);
      return;
    }

    try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.15, 5.2);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // ---- lighting: warm key from top-right, brand-green rim from below-left ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(3, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x18c98c, 0.9);
    rim.position.set(-3, -1.5, 1.5);
    scene.add(rim);

    // ---- material: flat-shaded brand green (ignores the model's grey MTL) ----
    const mat = new THREE.MeshStandardMaterial({ color: 0x18c98c, flatShading: true, metalness: 0.12, roughness: 0.55 });

    // ---- load the user-supplied bull-head OBJ ----
    const disposables: THREE.BufferGeometry[] = [];
    const model = new OBJLoader().parse(bullObjSrc);
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    const dims = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(dims);
    // centre the GEOMETRY at the origin (so later rotation spins about the head)
    model.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = mat;
        const g = mesh.geometry as THREE.BufferGeometry;
        g.translate(-center.x, -center.y, -center.z);
        disposables.push(g);
      }
    });
    const maxDim = Math.max(dims.x, dims.y, dims.z) || 1;

    // stand the model upright (it's authored Z-up) and face it toward the camera
    model.rotation.set(-1.35 + Math.PI + Math.PI / 4, 0, 0);

    const bull = new THREE.Group();
    bull.add(model);
    bull.scale.setScalar(2.7 / maxDim);
    bull.rotation.y = -0.3;
    scene.add(bull);

    // ---- responsive sizing ----
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h); // update canvas CSS size too, so it never overflows
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    renderer.domElement.style.display = "block";
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ---- pointer parallax ----
    let targetX = 0;
    let targetY = 0;
    const onMove = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      targetX = ((e.clientX - r.left) / r.width - 0.5) * 0.6;
      targetY = ((e.clientY - r.top) / r.height - 0.5) * 0.4;
    };
    mount.addEventListener("pointermove", onMove);

    // ---- animation loop ----
    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (reduce) {
        bull.rotation.y = -0.3;
        bull.position.y = 0;
      } else {
        bull.rotation.y += (targetX - 0.3 + Math.sin(t * 0.3) * 0.18 - bull.rotation.y) * 0.05;
        bull.rotation.x += (targetY * 0.5 - bull.rotation.x) * 0.05;
        bull.position.y = Math.sin(t * 0.8) * 0.06;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mount.removeEventListener("pointermove", onMove);
      disposables.forEach((g) => g.dispose());
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    } catch (e) {
      console.warn("BullScene: render setup failed, using static mark.", e);
      setFailed(true);
      try { renderer.dispose(); } catch { /* ignore */ }
      if (renderer.domElement?.parentNode === mount) mount.removeChild(renderer.domElement);
      return () => {};
    }
  }, []);

  return failed ? (
    <BullMark size={220} className={className} />
  ) : (
    <div ref={mountRef} className={className} aria-hidden="true" />
  );
}

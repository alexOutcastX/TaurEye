import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import BullMark from "./BullMark";

/**
 * Low-poly stylized bull head rendered with Three.js — the Landing hero graphic.
 * Built from flat-shaded primitives (icosahedra + faceted tube horns) for the
 * faceted "low-poly" look, with TaurEye-green glowing eyes. Rotates gently and
 * tilts toward the pointer; falls back to a static pose when the user prefers
 * reduced motion. Self-contained: creates its own renderer and tears everything
 * down on unmount (no leaks). Lazy-loaded so three.js stays out of the app
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

    // ---- materials ----
    const body = new THREE.MeshStandardMaterial({ color: 0x232a33, flatShading: true, metalness: 0.25, roughness: 0.6 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xe7eaef, flatShading: true, roughness: 0.5 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x18c98c, emissive: 0x18c98c, emissiveIntensity: 1.1 });

    const bull = new THREE.Group();
    const disposables: (THREE.BufferGeometry)[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale?: [number, number, number], rot?: [number, number, number]) => {
      disposables.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      if (scale) mesh.scale.set(...scale);
      if (rot) mesh.rotation.set(...rot);
      bull.add(mesh);
      return mesh;
    };

    // cranium + faceted snout
    add(new THREE.IcosahedronGeometry(1, 0), body, [0, 0.1, 0], [1.02, 0.94, 1.05]);
    add(new THREE.IcosahedronGeometry(0.6, 0), body, [0, -0.35, 0.78], [0.92, 0.72, 0.78]);

    // ears (flattened icosahedra)
    add(new THREE.IcosahedronGeometry(0.42, 0), body, [0.92, 0.42, -0.1], [0.9, 1.1, 0.32], [0, 0, -0.5]);
    add(new THREE.IcosahedronGeometry(0.42, 0), body, [-0.92, 0.42, -0.1], [0.9, 1.1, 0.32], [0, 0, 0.5]);

    // glowing green eyes
    add(new THREE.IcosahedronGeometry(0.14, 0), eyeMat, [0.44, 0.2, 0.82]);
    add(new THREE.IcosahedronGeometry(0.14, 0), eyeMat, [-0.44, 0.2, 0.82]);

    // nostrils (dark dimples on the snout)
    add(new THREE.IcosahedronGeometry(0.08, 0), body, [0.16, -0.45, 1.28]);
    add(new THREE.IcosahedronGeometry(0.08, 0), body, [-0.16, -0.45, 1.28]);

    // faceted curved horns (tube along a bezier; low segment counts = low-poly)
    const hornGeo = (mirror: number) => {
      const m = mirror;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(m * 0.55, 0.55, 0.1),
        new THREE.Vector3(m * 1.15, 0.95, 0.05),
        new THREE.Vector3(m * 1.3, 1.65, -0.05),
      );
      return new THREE.TubeGeometry(curve, 8, 0.13, 5, false);
    };
    add(hornGeo(1), bone, [0, 0, 0]);
    add(hornGeo(-1), bone, [0, 0, 0]);
    // horn tips (little cones capping the ends for a pointed finish)
    add(new THREE.ConeGeometry(0.13, 0.32, 5), bone, [1.3, 1.78, -0.05], undefined, [0, 0, -0.12]);
    add(new THREE.ConeGeometry(0.13, 0.32, 5), bone, [-1.3, 1.78, -0.05], undefined, [0, 0, 0.12]);

    bull.rotation.y = -0.3;
    scene.add(bull);

    // ---- responsive sizing ----
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
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
      [body, bone, eyeMat].forEach((m) => m.dispose());
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

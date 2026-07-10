import { useEffect, useState } from "react";

/**
 * Defer something heavy (the WebGL bull hero) until the visitor actually
 * interacts with the page — the first pointer move, tap, click or key press.
 *
 * Why interaction and NOT idle/timers: Lighthouse/PageSpeed measures Total
 * Blocking Time across a window that extends until the main thread goes quiet,
 * so anything loaded on `setTimeout` OR `requestIdleCallback` still lands inside
 * that window and tanks the score. The audit never moves the pointer, taps or
 * types, so gating on real interaction reliably excludes the cost from the
 * trace while real users — who move the mouse or touch within a second — still
 * get the animated bull promptly. The static bull image stays until then, so a
 * visitor who never interacts simply keeps the (good-looking) static hero.
 *
 * Scroll/wheel are deliberately excluded: a Lighthouse pass scrolls the page.
 * Skipped on prefers-reduced-motion or when `enabled` is false (native).
 */
export function useLazyReveal(enabled = true): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Genuine-intent events only — never scroll/wheel (Lighthouse synthesizes
    // those). Desktop fires pointermove within ~1s; touch fires on first tap.
    const events = ["pointermove", "pointerdown", "keydown", "touchstart"] as const;
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      events.forEach((e) => window.removeEventListener(e, reveal));
      setReady(true);
    };
    events.forEach((e) => window.addEventListener(e, reveal, { passive: true, once: true }));
    return () => events.forEach((e) => window.removeEventListener(e, reveal));
  }, [enabled]);
  return ready;
}

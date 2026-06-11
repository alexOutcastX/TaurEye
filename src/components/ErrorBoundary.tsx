import { Component, type ReactNode } from "react";

/**
 * Minimal error boundary — renders `fallback` if any descendant throws during
 * render, in a lifecycle method, in an effect, or while loading a lazy chunk.
 * Used to keep decorative/optional widgets (e.g. the WebGL bull) from ever
 * taking down the whole app.
 */
export default class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Non-fatal — the fallback renders instead. Log for diagnostics only.
    console.warn("ErrorBoundary caught:", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

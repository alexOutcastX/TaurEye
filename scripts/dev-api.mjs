// Cross-platform launcher for the TaurEye backend.
// Resolves the venv Python (falling back to system python) and runs uvicorn.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

const venvPy = isWin
  ? join(root, ".venv", "Scripts", "python.exe")
  : join(root, ".venv", "bin", "python");

const py = existsSync(venvPy) ? venvPy : isWin ? "python" : "python3";

if (py !== venvPy) {
  console.warn(
    `[TaurEye] venv not found at ${venvPy} — using "${py}". ` +
      `If imports fail, create it: python -m venv .venv && ${py} -m pip install -r backend/requirements.txt`,
  );
}

// Bind 0.0.0.0 so the APK on your phone can reach the backend over the LAN
// (e.g. http://<your-PC-IP>:8010). Override with TAUREYE_HOST=127.0.0.1 to keep
// it local-only. Port is fixed at 8010 to match the Vite proxy.
const host = process.env.TAUREYE_HOST || "0.0.0.0";
const args = [
  "-m",
  "uvicorn",
  "backend.app.main:app",
  "--host",
  host,
  "--port",
  "8010",
];

const child = spawn(py, args, { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[TaurEye] Failed to start backend:", err.message);
  process.exit(1);
});

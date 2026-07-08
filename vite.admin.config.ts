import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The ADMIN console — a separate mini-app so the dashboards never ship inside
// the user-facing SPA (or the mobile OTA bundle).
//   npm run build:admin  →  dist-admin/   (served by nginx under /admin/)
// Uses the same env (VITE_SUPABASE_URL/ANON_KEY) as the main build.
const repoRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  // root is ./admin, so point env loading back at the repo root.
  loadEnv(mode, repoRoot, '')
  return {
    root: 'admin',
    base: '/admin/',
    envDir: repoRoot,
    plugins: [react()],
    build: {
      outDir: '../dist-admin',
      emptyOutDir: true,
    },
  }
})

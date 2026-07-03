import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Emit /ads.txt at build time from VITE_ADSENSE_CLIENT so Google AdSense can
// verify the domain (required for ads to serve). No-op when the id is unset.
function adsTxt(client: string): Plugin {
  return {
    name: 'taureye-ads-txt',
    apply: 'build',
    generateBundle() {
      const id = client.trim()
      if (!id) return
      const pub = id.replace(/^ca-/, '') // ca-pub-XXXX -> pub-XXXX
      this.emitFile({
        type: 'asset',
        fileName: 'ads.txt',
        source: `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const adsenseClient = env.VITE_ADSENSE_CLIENT || process.env.VITE_ADSENSE_CLIENT || ''
  return {
    plugins: [react(), adsTxt(adsenseClient)],
    server: {
      // Bind 0.0.0.0 so any machine on the same LAN can open the app at
      // http://<this-PC-IP>:5174. The /api proxy below runs on this machine and
      // forwards to the local backend, so LAN clients never talk to :8010 directly.
      host: true,
      port: 5174,
      // Let HMR work when the page is opened via the LAN IP (the websocket
      // connects back to whatever host served the page).
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8010',
          changeOrigin: true,
        },
      },
    },
  }
})

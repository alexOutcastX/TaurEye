import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Google AdSense wiring, all driven by VITE_ADSENSE_CLIENT. No-op when unset, so
// ads stay OFF by default. When set, at build time we:
//   1. inject the canonical AdSense loader into <head> on every page — this is
//      the "AdSense code snippet" Google looks for to verify site ownership and
//      is the recommended placement for serving ads.
//   2. emit /ads.txt (google.com, pub-XXXX, DIRECT, f08c47fec0942fa0) — the
//      "Ads.txt snippet" verification method + required for ads to serve.
function adsense(client: string): Plugin {
  const id = client.trim()
  const pub = id.replace(/^ca-/, '') // ca-pub-XXXX -> pub-XXXX
  return {
    name: 'taureye-adsense',
    apply: 'build',
    transformIndexHtml() {
      if (!id) return
      return [
        {
          tag: 'script',
          attrs: {
            async: true,
            src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${id}`,
            crossorigin: 'anonymous',
            'data-taureye-adsense': '1',
          },
          injectTo: 'head',
        },
      ]
    },
    generateBundle() {
      if (!id) return
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
    plugins: [react(), adsense(adsenseClient)],
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

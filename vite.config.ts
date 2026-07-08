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

// Google Analytics (GA4, gtag.js) — the exact snippet from the GA "Install
// manually" screen, injected into <head> on every page at build time. Driven by
// VITE_GA_ID (G-XXXXXXXXXX); unset = no tag, so dev/local builds stay untracked.
// GA4's enhanced measurement detects History API changes, so SPA route changes
// count as page views without extra code.
function gaTag(measurementId: string): Plugin {
  const id = measurementId.trim()
  return {
    name: 'taureye-ga',
    apply: 'build',
    transformIndexHtml() {
      if (!id) return
      return [
        {
          tag: 'script',
          attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${id}` },
          injectTo: 'head',
        },
        {
          tag: 'script',
          children:
            `window.dataLayer = window.dataLayer || [];` +
            `function gtag(){dataLayer.push(arguments);}` +
            `gtag('js', new Date());` +
            `gtag('config', '${id}');`,
          injectTo: 'head',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const adsenseClient = env.VITE_ADSENSE_CLIENT || process.env.VITE_ADSENSE_CLIENT || ''
  const gaId = env.VITE_GA_ID || process.env.VITE_GA_ID || ''
  return {
    plugins: [react(), adsense(adsenseClient), gaTag(gaId)],
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

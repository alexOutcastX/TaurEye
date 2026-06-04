import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Use relative asset paths so the build works under any GitHub Pages subpath
  // (e.g. https://<user>.github.io/levelup/). For a custom domain or root deploy
  // this is also harmless.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-32x32.png'],
      manifest: {
        name: 'Pdash — Personal Dashboard',
        short_name: 'Pdash',
        description: 'Personal dashboard for habits, workouts and nutrition — gamified.',
        theme_color: '#ff2b4a',
        background_color: '#07050b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // .glb/.wasm are the muscle-map body and its Draco decoder: without them
        // the 3D map would fail offline. The body is ~0.6 MB, over Workbox's 2 MB
        // default only if the model is ever rebuilt uncompressed, so the limit is
        // raised to keep precaching reliable.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,glb,wasm}'],
        // draco_decoder-*.js is Draco's 0.5 MB pure-JS fallback, only ever fetched
        // by a browser without WebAssembly - which could not run the 3D map anyway.
        // Keeping it out of the precache saves every install half a megabyte.
        globIgnores: ['**/draco_decoder-*.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
})

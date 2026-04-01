import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'manual',
      // includeAssets removed — globPatterns already covers all files; having both caused duplicate precache entries
      manifest: false,
      workbox: {
        // Precache ALL app shell assets — ensures offline load
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webp}'],
        // Take control immediately when new SW activates
        clientsClaim: true,
        skipWaiting: true,
        // Fallback to index.html for navigation requests (SPA routing)
        navigateFallback: 'index.html',
        // Cache app shell with cache-first, update in background
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60*60*24*365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60*60*24*365 }
            }
          },
          {
            urlPattern: /\/api\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 60*60 }
            }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split recharts into its own chunk (it's the heaviest dep at ~200KB)
          'recharts': ['recharts'],
        }
      }
    }
  }
})

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Deckerr - Card Deck Manager',
        short_name: 'Deckerr',
        description: 'Manage your trading card game decks on the go',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        categories: ['games', 'utilities'],
        shortcuts: [
          {
            name: 'My Decks',
            short_name: 'Decks',
            description: 'View your deck collection',
            url: '/?page=home'
          },
          {
            name: 'Search Cards',
            short_name: 'Search',
            description: 'Search for cards',
            url: '/?page=search'
          },
          {
            name: 'Life Counter',
            short_name: 'Life',
            description: 'Track life totals',
            url: '/?page=life-counter'
          }
        ]
      },
      workbox: {
        // Includes card-hashes.json so the scanner's hash index is available
        // offline. Raise the size cap since the full index can exceed 2 MB.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Runtime config is written per-container; never precache it or the SW
        // would serve the empty build-time placeholder instead of live values.
        // The experimental CV scanner's OpenCV.js (~15 MB) and transformers.js
        // chunks are dynamically imported only on /scan-cv — keep them out of
        // the precache (OpenCV also exceeds the size cap); they load on demand.
        globIgnores: [
          '**/config.js',
          '**/opencv-*.js',
          '**/transformers*.js',
          '**/ort-*.js',
          '**/*.wasm',
          // The ~20 MB art-embedding index is too big to precache; it's fetched
          // on demand by the CV scanner and runtime-cached (see runtimeCaching).
          '**/card-art-index.*',
        ],
        runtimeCaching: [
          {
            // The CV scanner's art-embedding index (~20 MB, fixed path). Cache
            // it after the first fetch so it's instant afterwards and works
            // offline; a 30-day TTL picks up a rebuilt index without a manual
            // cache bump. Downloaded once, not on every visit.
            urlPattern: /\/card-art-index\.(bin|json)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-art-index',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/api\.scryfall\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'scryfall-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/cards\.scryfall\.io\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-images-cache',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
});

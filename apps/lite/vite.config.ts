import path from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/

import { visualizer } from 'rollup-plugin-visualizer'

const visualizerPlugin = visualizer({
  filename: 'stats.html',
  gzipSize: true,
  brotliSize: true,
}) as PluginOption

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: false, // Use public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Explicitly avoid terser for SW if possible or ensure it passes
        sourcemap: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Audio files: NetworkOnly ensures we use browser http cache & range requests correctly
            // Service Worker interception often breaks seeking/streaming performance for large files
            urlPattern: /\.(?:mp3|m4a|aac|ogg|wav)$/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'audio-cache-network-only',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
    visualizerPlugin,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@readio/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  build: {
    minify: 'esbuild', // Ensure we use esbuild instead of terser to avoid the reported hang
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['@tanstack/react-router'],
          'vendor-query': ['@tanstack/react-query', '@tanstack/query-core'],
          'vendor-db': ['dexie'],
          'vendor-virtuoso': ['react-virtuoso'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
})

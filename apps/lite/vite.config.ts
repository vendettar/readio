import path from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { API_RUNTIME_CACHING, AUDIO_RUNTIME_CACHING } from './src/lib/pwa/runtimeCaching'

// https://vite.dev/config/

import { visualizer } from 'rollup-plugin-visualizer'

const visualizerPlugin = visualizer({
  filename: 'stats.html',
  gzipSize: true,
  brotliSize: true,
}) as PluginOption

const enablePwaDev = process.env.PWA_DEV === '1'
const devHostAll = process.env.VITE_DEV_HOST_ALL === '1'

export default defineConfig({
  server: devHostAll ? { host: '0.0.0.0' } : undefined,
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifestFilename: 'manifest.json',
      devOptions: {
        enabled: enablePwaDev,
        type: 'module',
      },
      manifest: {
        name: 'Readio Lite',
        short_name: 'Readio',
        description: 'Premium Podcast Player with transcripts',
        theme_color: '#2563EB',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/readio.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/readio.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        mode: 'development',
        sourcemap: false,
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
          API_RUNTIME_CACHING,
          AUDIO_RUNTIME_CACHING,
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
  optimizeDeps: {
    include: ['music-metadata', 'buffer'],
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
  worker: {
    format: 'es',
  },
})

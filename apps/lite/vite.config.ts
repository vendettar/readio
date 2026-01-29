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
      manifestFilename: 'manifest.json',
      manifest: {
        name: 'Readio Lite',
        short_name: 'Readio',
        description: 'Premium Podcast Player with transcripts',
        theme_color: '#2563EB', // Blue from standards
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
          {
            src: '/readio-new.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
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

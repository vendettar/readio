import path from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'

// https://vite.dev/config/

import { visualizer } from 'rollup-plugin-visualizer'

const visualizerPlugin = visualizer({
  filename: 'stats.html',
  gzipSize: true,
  brotliSize: true,
}) as PluginOption

const devHostAll = process.env.VITE_DEV_HOST_ALL === '1'

const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  server: devHostAll ? { host: '0.0.0.0' } : undefined,
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    // TODO(cloud-pwa): Re-enable vite-plugin-pwa only if Cloud explicitly needs
    // offline/installable app behavior. For now we keep Cloud free of Workbox
    // to reduce cache/debugging complexity while backend-owned networking settles.
    visualizerPlugin,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
          'vendor-router': ['@tanstack/react-router'],
          'vendor-query': ['@tanstack/react-query', '@tanstack/query-core'],
          'vendor-db': ['dexie'],
          'vendor-zod': ['zod'],
          'vendor-virtuoso': ['react-virtuoso'],
          'vendor-icons': ['lucide-react'],
          'vendor-motion': ['framer-motion'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-radix': [
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-select',
            '@radix-ui/react-slider',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tooltip',
          ],
          'vendor-toast': ['sonner'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
})

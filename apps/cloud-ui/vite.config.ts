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

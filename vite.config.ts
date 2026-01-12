import path from "path"
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { createRequire } from 'node:module'

// https://vite.dev/config/
const require = createRequire(import.meta.url);

// Only enable bundle analysis when ANALYZE=1
const shouldAnalyze = process.env.ANALYZE === '1';

function getVisualizerPlugin(): PluginOption | null {
  if (!shouldAnalyze) return null;

  try {
    const mod = require('rollup-plugin-visualizer') as {
      visualizer?: (options: Record<string, unknown>) => PluginOption;
    };
    if (typeof mod.visualizer !== 'function') return null;
    return mod.visualizer({
      filename: 'stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    });
  } catch {
    // Optional dev dependency; skip if not installed.
    return null;
  }
}

const visualizerPlugin = getVisualizerPlugin();

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    ...(visualizerPlugin ? [visualizerPlugin] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
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

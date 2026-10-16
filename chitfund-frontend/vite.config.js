import { defineConfig, searchForWorkspaceRoot } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'
import { readdirSync } from 'node:fs'

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8080'
const offlineBuildId = process.env.CHITWISE_BUILD_ID ?? Date.now().toString(36)

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'chitwise-offline-shell',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/offline-worker.js') return next()
        response.setHeader('Content-Type', 'application/javascript')
        response.end("import '/src/offline/worker.js'")
      })
    },
    generateBundle(_, bundle) {
      const publicImages = readdirSync('public').filter((file) => /\.(svg|png|ico|webp|woff2?)$/.test(file)).map((file) => `/${file}`)
      const assets = ['/index.html', ...publicImages, ...Object.keys(bundle).filter((file) => file.startsWith('assets/') && !file.endsWith('.map')).map((file) => `/${file}`)]
      this.emitFile({ type: 'asset', fileName: 'offline-assets.json', source: JSON.stringify({ version: offlineBuildId, assets }) })
    },
  }],
  build: {
    rollupOptions: {
      input: { main: 'index.html', 'offline-worker': 'src/offline/worker.js',
        ...(process.env.CHITWISE_OFFLINE_TEST_HARNESS === '1' ? { 'offline-test-harness': 'tests/offline/harness.js' } : {}),
      },
      output: { entryFileNames: (chunk) => ['offline-worker', 'offline-test-harness'].includes(chunk.name) ? `${chunk.name}.js` : 'assets/[name]-[hash].js' },
    },
  },
  define: {
    global: 'globalThis',
    __CHITWISE_OFFLINE_BUILD__: JSON.stringify(offlineBuildId),
  },
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), resolve('../shared')] },
    port: 3000,
    host: true,
    proxy: {
      '/api': devProxyTarget,
      '/ws': { target: devProxyTarget, ws: true },
    },
  },
})

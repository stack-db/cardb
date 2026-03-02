import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const coiServiceWorkerPlugin = () => {
  const src = readFileSync(resolve('node_modules/coi-serviceworker/coi-serviceworker.js'))
  return {
    name: 'coi-serviceworker',
    configureServer(server: any) {
      server.middlewares.use(`${server.config.base}coi-serviceworker.js`, (_: any, res: any) => {
        res.setHeader('Content-Type', 'application/javascript')
        res.end(src)
      })
    },
    generateBundle(this: any) {
      this.emitFile({ type: 'asset', fileName: 'coi-serviceworker.js', source: src })
    },
  }
}

export default defineConfig({
  plugins: [react(), coiServiceWorkerPlugin()],
  base: '/cardb/',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MISSING_EXPORT' && warning.message.includes('nodefs.js')) return
        if (warning.code === 'EVAL' && warning.id?.includes('@electric-sql/pglite')) return
        warn(warning)
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const coiServiceWorkerPlugin = () => {
  const raw = readFileSync(resolve('node_modules/coi-serviceworker/coi-serviceworker.js'), 'utf-8')
  // In credentialless COEP mode, cross-origin servers may set CORP: same-site which
  // the browser enforces even though credentialless should allow no-cors fetches.
  // Strip CORP headers from service-worker responses so the browser won't block them.
  const src = raw.replace(
    'newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");',
    'newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");\n' +
    '                    if (coepCredentialless) newHeaders.delete("Cross-Origin-Resource-Policy");',
  )
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
      'Cross-Origin-Embedder-Policy': 'credentialless',
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

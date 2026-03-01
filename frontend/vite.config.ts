import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    rollupOptions: {
      onwarn(warning, warn) {
        // PGlite's nodefs.js imports Node.js built-ins (path, fs) which Vite
        // stubs out in browser builds. NodeFS is only used with the 'file://'
        // prefix; we always use 'opfs-ahp://', so this dead code is safe to ignore.
        if (warning.code === 'MISSING_EXPORT' && warning.message.includes('nodefs.js')) return

        // PGlite uses eval() in its WASM loader. This is expected and unavoidable
        // for WebAssembly packages — not a security risk in this context.
        if (warning.code === 'EVAL' && warning.id?.includes('@electric-sql/pglite')) return

        warn(warning)
      },
    },
  },
})

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    pool: 'forks',
    testTimeout: 15000,
    setupFiles: ['src/tests/setup.ts'],
    environmentMatchGlobs: [
      ['src/tests/components/**/*.test.tsx', 'happy-dom'],
    ],
  },
})

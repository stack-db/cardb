import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    pool: 'forks',
    testTimeout: 15000,
    setupFiles: ['src/tests/setup.ts'],
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          pool: 'forks',
          testTimeout: 15000,
          setupFiles: ['src/tests/setup.ts'],
          include: ['src/tests/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'happy-dom',
          environment: 'happy-dom',
          globals: true,
          pool: 'forks',
          testTimeout: 15000,
          setupFiles: ['src/tests/setup.ts'],
          include: ['src/tests/components/**/*.test.tsx'],
        },
      },
    ],
  },
})

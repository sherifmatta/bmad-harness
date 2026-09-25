import { defineConfig } from 'vitest/config'

// Deliberately separate from the electron-vite build: the unit suite runs in
// plain Node against the pure `fold/` modules, not against a bundled target.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}']
  }
})

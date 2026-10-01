import { defineConfig } from 'vitest/config'

// Deliberately separate from the electron-vite build: the unit suite runs in
// plain Node against the pure `fold/` modules, not against a bundled target.
// A test file that needs a DOM opts in with `// @vitest-environment jsdom` on
// its first line; nothing else changes. See DEPENDENCIES.md.
//
// Two projects, run one after the other by `npm test`. The three files below
// drive a real chokidar over a real temporary directory, and on macOS every
// watcher in every worker shares one file-event stream, so two of them running
// at once starve each other: they fail one run in five when run together and
// not at all, eight runs in eight, when run one file at a time. Their own
// `afterEach` and `until` helpers already work around that stream; running them
// alone is what removes it. Everything else is fast and independent and keeps
// running in parallel.
const WATCHERS = [
  'src/main/sources/install/watch-install.test.ts',
  'src/main/sources/project/watch-artifacts.test.ts',
  'src/main/sources/project/watch-document.test.ts'
]

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
          exclude: WATCHERS
        }
      },
      {
        test: {
          name: 'watchers',
          environment: 'node',
          include: WATCHERS,
          fileParallelism: false
        }
      }
    ]
  }
})

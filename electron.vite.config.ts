import { basename, resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'

/**
 * A sandboxed preload cannot load a second file, and a module two entries share
 * is built as a chunk that one `require`s from the other. `src/shared/` is the
 * one place both preloads draw from, so each preload gets its own copy of what
 * it imports from there: the module id carries the importing entry's name, which
 * makes it two modules to the bundler and none of them a chunk.
 */
function inlineSharedIntoEachPreload(): Plugin {
  return {
    name: 'inline-shared-into-each-preload',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (importer === undefined || !/[\\/]src[\\/]preload[\\/][^\\/]+\.ts$/.test(importer)) {
        return null
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolved === null || !/[\\/]src[\\/]shared[\\/]/.test(resolved.id)) {
        return null
      }
      return `${resolved.id}?preload=${basename(importer, '.ts')}`
    }
  }
}

// The prescribed source tree is binding: the renderer root is pointed at
// `src/renderer/` rather than electron-vite's default `src/renderer/src/`.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), inlineSharedIntoEachPreload()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          // The document window's own bridge: a second bundle that shares no
          // runtime module with the shell's (a sandboxed preload cannot load one).
          doc: resolve(__dirname, 'src/preload/doc.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // The document window's page: its own entry, sharing no file with the shell's.
          doc: resolve(__dirname, 'src/renderer/doc.html')
        }
      }
    }
  }
})

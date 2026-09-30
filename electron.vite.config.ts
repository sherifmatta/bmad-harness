import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react-swc'

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
    plugins: [externalizeDepsPlugin()],
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

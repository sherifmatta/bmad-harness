import { basename } from 'node:path'
import type { Plugin } from 'vite'

/**
 * A sandboxed preload cannot load a second file, and a module two entries share
 * is built as a chunk that one `require`s from the other. `src/shared/` is the
 * one place both preloads draw from, so each preload gets its own copy of what
 * it imports from there: the module id carries the importing entry's name, which
 * makes it two modules to the bundler and none of them a chunk.
 *
 * It holds for what a shared module imports in turn: that import is made from a
 * module whose id already carries the entry's name, and is given the same one.
 */
const PRELOAD_ENTRY = /[\\/]src[\\/]preload[\\/][^\\/?]+\.ts$/
const SHARED = /[\\/]src[\\/]shared[\\/]/
const SHARED_COPY = /[\\/]src[\\/]shared[\\/][^?]+\.ts\?preload=([^&]+)$/

export function inlineSharedIntoEachPreload(): Plugin {
  return {
    name: 'inline-shared-into-each-preload',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (importer === undefined) {
        return null
      }
      const entry = PRELOAD_ENTRY.test(importer)
        ? basename(importer, '.ts')
        : SHARED_COPY.exec(importer)?.[1]
      if (entry === undefined) {
        return null
      }
      // The importer's own query is not part of where `source` is relative to.
      const resolved = await this.resolve(source, importer.replace(/\?.*$/, ''), {
        ...options,
        skipSelf: true
      })
      if (resolved === null || !SHARED.test(resolved.id) || resolved.id.includes('?preload=')) {
        return null
      }
      return `${resolved.id}?preload=${entry}`
    }
  }
}

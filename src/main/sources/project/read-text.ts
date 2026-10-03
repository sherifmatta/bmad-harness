import { readFile } from 'node:fs/promises'

/**
 * A file's text, or `undefined` when it cannot be read for any reason: gone,
 * unreadable, a directory, not UTF-8 enough to matter. Never rejects; what was
 * not read is simply not known.
 */
export async function readText(absolutePath: string): Promise<string | undefined> {
  try {
    return await readFile(absolutePath, 'utf8')
  } catch {
    return undefined
  }
}

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The install's own declaration of what it provides: `_bmad/_config/skill-manifest.csv`.
 * This is the one file in `src/` that spells it, and it reads it whole, once per
 * refresh. Nothing here lists a directory; the manifest says what is installed.
 *
 * The reader hands back rows of text and never rejects. A manifest that is
 * absent or cannot be read is the same fact as one that lists nothing, and the
 * answer to both is no rows (Story 7.3).
 */

/**
 * Where the manifest sits under `_bmad`, spelled once: the watcher takes these
 * two names from here to know which file of `_config` is worth a refresh.
 */
export const MANIFEST_DIR = '_config'
export const MANIFEST_FILE = 'skill-manifest.csv'

/** Reads a file as text. Injectable so a test needs no filesystem. */
export type ReadText = (path: string) => Promise<string>

const readUtf8: ReadText = (path) => readFile(path, 'utf8')

/**
 * RFC 4180: fields separated by commas, rows by CRLF or LF, a field in double
 * quotes may hold commas, line breaks and `""` for one quote. A trailing line
 * break ends the last row and does not begin another. A leading byte-order mark
 * is dropped. Written by hand because a one-column question does not earn a
 * dependency.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  // Whether anything of the current row has been seen, so a final line break
  // ends a row without starting an empty one.
  let started = false

  const endField = (): void => {
    row.push(field)
    field = ''
  }
  const endRow = (): void => {
    endField()
    rows.push(row)
    row = []
    started = false
  }

  for (let at = 0; at < source.length; at += 1) {
    const char = source[at]
    if (quoted) {
      if (char === '"') {
        if (source[at + 1] === '"') {
          field += '"'
          at += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && field === '') {
      quoted = true
      started = true
    } else if (char === ',') {
      started = true
      endField()
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[at + 1] === '\n') {
        at += 1
      }
      endRow()
    } else {
      started = true
      field += char
    }
  }
  if (started || field !== '') {
    endRow()
  }
  return rows
}

/** The manifest's rows, header first, or none when it cannot be read. Never rejects. */
export async function readSkillManifest(
  projectRoot: string,
  read: ReadText = readUtf8
): Promise<string[][]> {
  try {
    return parseCsv(await read(join(projectRoot, '_bmad', MANIFEST_DIR, MANIFEST_FILE)))
  } catch {
    return []
  }
}

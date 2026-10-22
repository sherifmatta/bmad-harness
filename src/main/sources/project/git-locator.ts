import { open, realpath as fsRealpath, stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'

/**
 * Which git the Changes source may run (Story 9.3, AD-31), decided without
 * running anything.
 *
 * On a Mac without the developer tools, `/usr/bin/git` and `/usr/bin/xcrun` are
 * stubs that open the operating system's install prompt — a modal the harness
 * would raise by drawing a list. So git is only ever run by absolute path, and
 * only a compiled binary qualifies: a candidate is taken when it is a regular
 * file, its real path is neither stub, and its first bytes read as a Mach-O
 * header (thin, either byte order, or universal). The header is read from the
 * file; no candidate is ever run to check it. A script (`#!`), a Java class file
 * (which shares the universal magic) and a missing file are passed over. When no
 * candidate is left the answer is `null`, and nothing is spawned.
 *
 * The fixed candidates come first, in AD-31's order, then `<dir>/git` for each
 * absolute directory of the login path (`inheritLoginPath` set it at startup);
 * relative entries are skipped.
 */

export const FIXED_CANDIDATES: readonly string[] = [
  '/Library/Developer/CommandLineTools/usr/bin/git',
  '/Applications/Xcode.app/Contents/Developer/usr/bin/git',
  '/opt/homebrew/bin/git',
  '/usr/local/bin/git'
]

/** The two stubs that can raise the developer-tools prompt: never run, whatever links to them. */
const STUBS = new Set(['/usr/bin/git', '/usr/bin/xcrun'])

/** Enough of a file to tell its kind: a magic number and a universal binary's arch count. */
export const HEAD_BYTES = 8

/** The most architectures a universal binary is believed to carry; a Java class file's version reads far above. */
const MOST_ARCHES = 30

export type GitLocatorDeps = {
  /** The real path of a file, or `null` when it has none. */
  realpath?: (path: string) => Promise<string | null>
  /** The first `HEAD_BYTES` of a file, or `null` when it cannot be read. Never runs it. */
  readHead?: (path: string) => Promise<Uint8Array | null>
  /** Whether a path is a regular file (links followed). */
  isFile?: (path: string) => Promise<boolean>
  /** The login path, `delimiter`-separated. */
  path?: string
}

/** The real path of a file, or `null` when it has none. */
export async function realpathOrNull(path: string): Promise<string | null> {
  try {
    return await fsRealpath(path)
  } catch {
    return null
  }
}

/** Whether a path is a regular file, links followed. */
export async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** The first `HEAD_BYTES` of a file, read and never run, or `null` when it cannot be read. */
export async function readHeadBytes(path: string): Promise<Uint8Array | null> {
  let handle
  try {
    handle = await open(path, 'r')
    const buffer = Buffer.alloc(HEAD_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0)
    return buffer.subarray(0, bytesRead)
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** Whether `bytes` start a Mach-O file: thin (32 or 64 bit, either byte order) or universal (fat, big-endian). */
export function isMachO(bytes: Uint8Array | null): boolean {
  if (bytes === null || bytes.length < 4) {
    return false
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const big = view.getUint32(0, false)
  const little = view.getUint32(0, true)
  if (big === 0xfeedface || big === 0xfeedfacf || little === 0xfeedface || little === 0xfeedfacf) {
    return true
  }
  if (big === 0xcafebabe || big === 0xcafebabf) {
    if (bytes.length < 8) {
      return false
    }
    const arches = view.getUint32(4, false)
    return arches >= 1 && arches <= MOST_ARCHES
  }
  return false
}

/** Every candidate in order, each once: the fixed four, then `<dir>/git` for each absolute login-path entry. */
export function candidatesOf(path: string | undefined): string[] {
  const fromPath = (path ?? '')
    .split(delimiter)
    .filter((dir) => dir.length > 0 && isAbsolute(dir))
    .map((dir) => join(dir, 'git'))
  return [...new Set([...FIXED_CANDIDATES, ...fromPath])]
}

/**
 * The real path of the first candidate that is a compiled git, or `null` when
 * there is none. Never rejects, and never runs anything.
 */
export async function locateGit(deps: GitLocatorDeps = {}): Promise<string | null> {
  const realpath = deps.realpath ?? realpathOrNull
  const readHead = deps.readHead ?? readHeadBytes
  const isFile = deps.isFile ?? isRegularFile
  const path = deps.path ?? process.env.PATH

  for (const candidate of candidatesOf(path)) {
    try {
      if (STUBS.has(candidate) || !(await isFile(candidate))) {
        continue
      }
      const real = await realpath(candidate)
      if (real === null || STUBS.has(real)) {
        continue
      }
      if (isMachO(await readHead(real))) {
        return real
      }
    } catch {
      // A candidate that cannot be looked at is not one.
    }
  }
  return null
}

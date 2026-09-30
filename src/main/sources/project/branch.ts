import { open } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * The checked-out branch of a project, read from `.git/HEAD` and nothing else.
 *
 * A `git` subprocess on a Mac without the developer tools opens the operating
 * system's install prompt from the `/usr/bin/git` shim — a modal the harness
 * would cause by drawing a chip. One small file the harness already has a right
 * to see answers the same question with no process and no `PATH` dependence.
 * The price is that packed refs, reftable repositories or a future HEAD format
 * read as `null`: a missing fact, never a wrong one.
 *
 * Read-only. Nothing under `.git/` is read except `HEAD` — and, when `.git` is
 * a file (a worktree), the one `gitdir:` target's `HEAD`. The branch name is
 * project content: it is validated to a closed shape before it leaves here, and
 * no reply ever carries a path.
 */

/** A HEAD file is one line; anything larger is not one. */
const MAX_BYTES = 4096

const BRANCH_REF = /^ref: refs\/heads\/(.+)$/
// Beyond whitespace and C0 controls: DEL and the C1 controls, the zero-width
// and directional marks, the bidi embedding/override and isolate controls, and
// the byte-order mark — none of which a branch chip should be able to smuggle.
const BRANCH_NAME =
  /^[^\s\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]{1,200}$/
const OBJECT_ID = /^[0-9a-f]{40}$/
const GITDIR = /^gitdir: (.+)$/

/** The first `MAX_BYTES + 1` bytes of a file, or `null` when it cannot be read. */
export type ReadFile = (path: string) => Promise<Uint8Array | null>

export type BranchDeps = { read?: ReadFile }

async function readHead(path: string): Promise<Uint8Array | null> {
  let handle
  try {
    handle = await open(path, 'r')
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead)
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** One line of text, or `null` for anything oversized, non-UTF-8 or multi-line. */
async function readLine(read: ReadFile, path: string): Promise<string | null> {
  const bytes = await read(path)
  if (bytes === null || bytes.length === 0 || bytes.length > MAX_BYTES) {
    return null
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  // One trailing line ending is tolerated, either kind; nothing else is.
  const line = text.replace(/\r?\n$/, '')
  return /[\r\n]/.test(line) ? null : line
}

/** `main`, `detached · 1a2b3c4`, or `null` when the line is neither. */
function parseHead(line: string): string | null {
  const ref = BRANCH_REF.exec(line)
  if (ref !== null) {
    return BRANCH_NAME.test(ref[1]) ? ref[1] : null
  }
  return OBJECT_ID.test(line) ? `detached · ${line.slice(0, 7)}` : null
}

/**
 * Answer with the branch, `detached · <7 hex>`, or `null`. Never rejects.
 */
export async function readBranch(projectRoot: string, deps: BranchDeps = {}): Promise<string | null> {
  const read = deps.read ?? readHead
  try {
    const head = await readLine(read, join(projectRoot, '.git', 'HEAD'))
    if (head !== null) {
      return parseHead(head)
    }

    // Not a directory layout: `.git` may be a file pointing at the real
    // directory, once. A second hop is not followed.
    const pointer = await readLine(read, join(projectRoot, '.git'))
    const target = pointer === null ? null : GITDIR.exec(pointer)
    if (target === null) {
      return null
    }
    const gitDir = isAbsolute(target[1]) ? target[1] : resolve(projectRoot, target[1])
    const linked = await readLine(read, join(gitDir, 'HEAD'))
    return linked === null ? null : parseHead(linked)
  } catch {
    return null
  }
}

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalPath } from './canonical-path'

let base: string
/** `base` as the file system names it. */
let real: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'harness-canonical-'))
  real = realpathSync.native(base)
  mkdirSync(join(base, 'project', 'notes'), { recursive: true })
  mkdirSync(join(base, 'elsewhere'))
  symlinkSync(join(base, 'elsewhere'), join(base, 'project', 'out'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('canonicalPath', () => {
  it('resolves an existing path through its links', () => {
    expect(canonicalPath(join(base, 'project', 'notes'))).toBe(join(real, 'project', 'notes'))
    expect(canonicalPath(join(base, 'project', 'out'))).toBe(join(real, 'elsewhere'))
  })

  it('keeps a missing tail as written, under the nearest ancestor that exists', () => {
    expect(canonicalPath(join(base, 'project', 'notes', 'new', 'a.md'))).toBe(
      join(real, 'project', 'notes', 'new', 'a.md')
    )
  })

  it('follows a link before the missing part', () => {
    expect(canonicalPath(join(base, 'project', 'out', 'new.md'))).toBe(join(real, 'elsewhere', 'new.md'))
  })

  it('applies `..` after a link where the file system would, not lexically', () => {
    // Lexically this is <base>/project/x; through the link it is <base>/x.
    expect(canonicalPath(`${base}/project/out/../x`)).toBe(join(real, 'x'))
  })

  it('applies `..` inside a missing tail', () => {
    expect(canonicalPath(`${base}/project/missing/../../x`)).toBe(join(real, 'x'))
  })

  it('resolves /tmp as the system does', () => {
    expect(canonicalPath('/tmp')).toBe(realpathSync.native('/tmp'))
  })

  it('never throws, for a path under a file', () => {
    writeFileSync(join(base, 'project', 'file'), '')
    expect(canonicalPath(join(base, 'project', 'file', 'deeper'))).toBe(join(real, 'project', 'file', 'deeper'))
  })
})

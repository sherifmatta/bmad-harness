import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readText } from './read-text'

const dir = mkdtempSync(join(tmpdir(), 'harness-read-text-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('readText', () => {
  it('resolves a file’s text', async () => {
    writeFileSync(join(dir, 'a.md'), '- (event) one\n')
    await expect(readText(join(dir, 'a.md'))).resolves.toBe('- (event) one\n')
  })

  it('resolves undefined, never rejecting, for a missing file or a directory', async () => {
    await expect(readText(join(dir, 'missing.md'))).resolves.toBeUndefined()
    await expect(readText(dir)).resolves.toBeUndefined()
  })
})

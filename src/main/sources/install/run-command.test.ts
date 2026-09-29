import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runCommand } from './run-command'

const scratch = mkdtempSync(join(tmpdir(), 'run-command-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const options = { timeoutMs: 5_000, cwd: scratch, env: { ...process.env } }
const node = (script: string, overrides: Partial<typeof options> = {}) =>
  runCommand(process.execPath, ['-e', script], { ...options, ...overrides })

/** Whether any live process carries the marker in its command line. */
function aliveWith(marker: string): boolean {
  try {
    execFileSync('pgrep', ['-f', marker])
    return true
  } catch {
    // pgrep exits 1 when nothing matches.
    return false
  }
}

describe('runCommand', () => {
  it('hands back stdout from a clean exit', async () => {
    expect(await node('process.stdout.write("hello")')).toEqual({ ok: true, stdout: 'hello' })
  })

  it('classifies a non-zero exit and never carries stderr', async () => {
    const result = await node('console.error("/secret/path missing"); process.exit(3)')

    expect(result).toEqual({ ok: false, kind: 'exit', code: 3 })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('kills a child that outlives its bound, and it is dead afterwards', async () => {
    const marker = `run-command-test-${randomUUID()}`
    const script = `/* ${marker} */ setInterval(() => {}, 1000)`

    // The child is provably running before the bound elapses...
    const pending = node(script, { timeoutMs: 1_500 })
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(aliveWith(marker)).toBe(true)

    // ...and provably gone after it: killed, not leaked.
    expect(await pending).toEqual({ ok: false, kind: 'timeout' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(aliveWith(marker)).toBe(false)
  })

  it('kills the whole tree: a hung uv-run python script does not survive the timeout', async () => {
    const script = join(scratch, `hang-${randomUUID()}.py`)
    writeFileSync(script, 'import time\ntime.sleep(60)\n')

    const pending = runCommand('uv', ['run', '--no-project', '--quiet', script], {
      ...options,
      timeoutMs: 2_000
    })
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    expect(aliveWith(script)).toBe(true)

    expect(await pending).toEqual({ ok: false, kind: 'timeout' })
    // uv is killed with the group, so the interpreter it started must go too.
    for (let attempt = 0; attempt < 20 && aliveWith(script); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(aliveWith(script)).toBe(false)
  })

  it('classifies a missing binary as a spawn failure', async () => {
    const result = await runCommand('definitely-not-a-binary-xyz', [], options)

    expect(result).toEqual({ ok: false, kind: 'spawn', errno: 'ENOENT' })
  })

  it('classifies output past the buffer', async () => {
    const result = await node('process.stdout.write("x".repeat(5 * 1024 * 1024))')

    expect(result).toEqual({ ok: false, kind: 'output-too-large' })
  })
})

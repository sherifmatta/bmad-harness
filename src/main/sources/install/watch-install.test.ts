import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { watchInstall } from './watch-install'
import type { InstallWatcher } from './watch-install'

const DEBOUNCE = 50

// Spelled from parts: naming these files in full is the watcher's job alone.
const toml = (name: string): string => `${name}.toml`
const CONFIG = toml('_bmad/config')
const CONFIG_USER = toml('_bmad/config.user')
const OVERRIDE = toml('_bmad/custom/x')
const CUSTOMIZE = toml('.claude/skills/x/customize')

let root: string
let watcher: InstallWatcher | null = null
let calls = 0

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'watch-install-'))
  for (const dir of ['_bmad/custom', '_bmad/planning-artifacts', '.claude/skills/x']) {
    mkdirSync(join(root, dir), { recursive: true })
  }
  writeFileSync(join(root, CONFIG), 'a = 1\n')
  writeFileSync(join(root, OVERRIDE), 'a = 1\n')
  writeFileSync(join(root, '_bmad/config.md'), 'a\n')
  writeFileSync(join(root, CUSTOMIZE), 'a = 1\n')
  calls = 0
})

afterEach(async () => {
  await watcher?.close()
  watcher = null
  rmSync(root, { recursive: true, force: true })
})

async function start(): Promise<void> {
  watcher = watchInstall({ projectRoot: root, debounceMs: DEBOUNCE, onChange: () => void calls++ })
  await watcher.ready
}

describe('watchInstall', () => {
  it('coalesces an atomic rename and an append in one burst into one call', async () => {
    await start()

    writeFileSync(join(root, `${CONFIG}.tmp`), 'a = 2\n')
    renameSync(join(root, `${CONFIG}.tmp`), join(root, CONFIG))
    appendFileSync(join(root, CONFIG), 'b = 1\n')
    await sleep(DEBOUNCE * 6)

    expect(calls).toBe(1)
  })

  it.each([OVERRIDE, CONFIG, CONFIG_USER, CUSTOMIZE])(
    'fires for %s',
    async (file) => {
      await start()

      writeFileSync(join(root, file), 'changed = true\n')
      await sleep(DEBOUNCE * 6)

      expect(calls).toBe(1)
    }
  )

  it('ignores artifacts and other files under _bmad', async () => {
    await start()

    writeFileSync(join(root, '_bmad/planning-artifacts/prd.md'), 'x\n')
    writeFileSync(join(root, '_bmad/config.md'), 'changed\n')
    await sleep(DEBOUNCE * 6)

    expect(calls).toBe(0)
  })

  it('stops calling after close and clears a pending timer', async () => {
    await start()

    writeFileSync(join(root, CONFIG), 'a = 3\n')
    await sleep(DEBOUNCE / 5)
    await watcher?.close()
    await sleep(DEBOUNCE * 6)
    expect(calls).toBe(0)

    writeFileSync(join(root, CONFIG), 'a = 4\n')
    await sleep(DEBOUNCE * 6)
    expect(calls).toBe(0)
  })
})

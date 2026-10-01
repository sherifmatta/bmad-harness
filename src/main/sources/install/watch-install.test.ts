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
  // The watcher is rooted at the project, so the OS file-event stream still
  // delivering this directory's removal reaches the next test's watcher; let it
  // drain before that one starts.
  await sleep(300)
})

async function start(): Promise<void> {
  // Rooted at the project, the watcher can still be handed the creation of the
  // fixture it was started a moment after, and would count it as a change.
  await sleep(200)
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

  describe('roots that do not exist yet', () => {
    // chokidar never sees a root that did not exist when it started, so these
    // fail for any watcher rooted at `_bmad` or `.claude/skills` themselves.
    const until = async (condition: () => boolean, timeoutMs = 4000): Promise<void> => {
      const deadline = Date.now() + timeoutMs
      while (!condition() && Date.now() < deadline) {
        await sleep(20)
      }
    }

    /**
     * A project that lacks the given roots. They are removed from the fixture
     * and the OS file-event stream is given time to finish delivering the
     * removal: a watcher started while it is still reporting the deletion of a
     * path that is about to be created again misses the creation, which is a
     * fact about the fixture and not about a project that really lacked them.
     */
    const withoutRoots = async (...roots: string[]): Promise<void> => {
      for (const name of roots) {
        rmSync(join(root, name), { recursive: true })
      }
      await sleep(300)
    }

    it('fires when _bmad is created after launch and its configuration is written', async () => {
      await withoutRoots('_bmad')
      await start()
      expect(calls).toBe(0)

      mkdirSync(join(root, '_bmad/custom'), { recursive: true })
      writeFileSync(join(root, CONFIG), 'a = 1\n')
      await until(() => calls > 0)

      expect(calls).toBeGreaterThan(0)
    })

    it('fires when .claude/skills is created after launch and a skill customisation is written', async () => {
      await withoutRoots('.claude')
      await start()
      expect(calls).toBe(0)

      mkdirSync(join(root, '.claude/skills/x'), { recursive: true })
      writeFileSync(join(root, CUSTOMIZE), 'a = 1\n')
      await until(() => calls > 0)

      expect(calls).toBeGreaterThan(0)
    })

    it('fires when a project with neither root gains both', async () => {
      await withoutRoots('_bmad', '.claude')
      await start()

      mkdirSync(join(root, '.claude/skills/x'), { recursive: true })
      writeFileSync(join(root, CUSTOMIZE), 'a = 1\n')
      await until(() => calls > 0)

      expect(calls).toBeGreaterThan(0)
    })

    it('stays silent for the rest of the project: only _bmad and .claude/skills are admitted', async () => {
      mkdirSync(join(root, 'node_modules/pkg'), { recursive: true })
      mkdirSync(join(root, '.claude/commands'), { recursive: true })
      await start()

      writeFileSync(join(root, 'node_modules/pkg/package.toml'), 'a = 1\n')
      writeFileSync(join(root, toml('notes')), 'a = 1\n')
      writeFileSync(join(root, toml('.claude/settings')), 'a = 1\n')
      writeFileSync(join(root, toml('.claude/commands/x')), 'a = 1\n')
      await sleep(DEBOUNCE * 8)

      expect(calls).toBe(0)
    })
  })
})

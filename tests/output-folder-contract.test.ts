import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FolderView } from '../src/main/output-folder-model'
import type { CommandRunner } from '../src/main/sources/install/run-command'
import type { DocBoundary, DocRead } from '../src/main/sources/project/watch-document'
import { DEFAULT_OUTPUT_FOLDER } from '../src/shared/output-folder'
import type { DocSnapshot } from '../src/shared/document'
import type { ArtifactObservation, RailSnapshot } from '../src/shared/rail'
import { withoutComments } from './literal-guard'

/**
 * Story 5.4, asserted across its seams: that the output tree is spelled in one
 * place and the install in its own (the audit; the head's negative surface is
 * `output-folder-head.test.tsx`'s), and that a project whose BMad configuration names
 * another output folder shows its rows with no choice made, moves them on a
 * choice, keeps an open document reloading, leaves the install's resolvers at
 * `_bmad/scripts`, and is left byte for byte as it was (the bridge-level test).
 * What each module does alone is held by the unit tests beside it.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const isShipping = (path: string): boolean => /\.(?:ts|tsx|css)$/.test(path) && !/\.test\.tsx?$/.test(path)

/** Source with block comments and whole-line `//` comments removed. */
const code = (path: string): string => withoutComments(read(path)).replace(/^\s*\/\/.*$/gm, '')

// ---------------------------------------------------------------- the audit

describe('the output tree has one spelling', () => {
  /**
   * Where `_bmad` means the install and not the output tree: the resolvers and
   * the watcher of the configuration (`sources/install/`), the portrait's source
   * of its five faces (`art-params.ts`) and the memlog's own script
   * (`memlog.ts`, `memlog-tail.ts`). Everything else names the output folder
   * through the one the project has.
   */
  const INSTALL = [
    /^src\/main\/sources\/install\//,
    /^src\/renderer\/ui\/persona\/art-params\.ts$/,
    /^src\/renderer\/ui\/feed\/memlog\.ts$/,
    /^src\/main\/fold\/memlog-tail\.ts$/
  ]

  const swept = [...filesUnder('src/main'), ...filesUnder('src/renderer')]
    .filter(isShipping)
    .filter((path) => !INSTALL.some((pattern) => pattern.test(path)))

  it('sweeps the whole of main and the renderer, install files aside', () => {
    expect(swept.length).toBeGreaterThan(150)
    expect(swept).toContain('src/main/rail-bridge.ts')
    expect(swept).toContain('src/renderer/ui/outputs/outputs.tsx')
    expect(swept).not.toContain('src/main/sources/install/resolvers.ts')
  })

  it('carries `_bmad` in none of them, in code or in a comment', () => {
    expect(swept.filter((path) => read(path).includes('_bmad'))).toEqual([])
  })

  it('has the install files say `_bmad` only for the install: the resolver scripts, the configuration, the memlog script', () => {
    const resolvers = code('src/main/sources/install/resolvers.ts')
    expect(resolvers).toContain("join(projectRoot, '_bmad', 'scripts')")
    expect(resolvers.match(/_bmad/g)).toHaveLength(1)
    expect(code('src/main/sources/install/watch-install.ts')).toContain("first === '_bmad'")
  })

  it('spells the default once outside them, in the shared contract, and never as a spelling of the party directory', () => {
    const shared = filesUnder('src/shared').filter(isShipping)

    expect(shared.filter((path) => read(path).includes('_bmad'))).toEqual(['src/shared/output-folder.ts'])
    expect(code('src/shared/output-folder.ts').match(/_bmad/g)).toHaveLength(1)
    expect(DEFAULT_OUTPUT_FOLDER).toBe('_bmad/')
    expect(code('src/shared/room-destination.ts')).toContain("const PARTY_DIR = 'party'")
    expect([...swept, ...filesUnder('src/shared').filter(isShipping)].filter((path) => /_bmad\/party|_bmad-output/.test(read(path)))).toEqual([])
  })

  it('writes nothing into a project to remember the choice: the one store is under userData, keyed by the project, never in it', () => {
    const bridge = code('src/main/output-folder-bridge.ts')
    const store = code('src/main/sources/persistence/output-folder-file.ts')

    expect(bridge).toContain('outputFoldersFilePath(deps.userDataPath())')
    expect(bridge).not.toMatch(/import\s*\{[^}]*\b(?:write|append|mkdir|rename|unlink|rm|copy|cp|symlink)\w*[^}]*\}\s*from\s*'node:fs/)
    expect(bridge).not.toMatch(/\b(?:writeFile|appendFile|mkdir|rename|unlink|rmdir|copyFile)(?:Sync)?\(/)
    expect(bridge).not.toMatch(/custom|config\.user|config\.toml|\.gitignore|dotfile/)
    expect(store).not.toMatch(/projectPath|projectRoot/)
    expect(code('src/main/rail-bridge.ts')).not.toMatch(/outputFoldersFilePath|userData/)
  })

  it('reads BMad’s folder through the install resolvers, as one more key of the same script, and reads no configuration file', () => {
    const resolvers = code('src/main/sources/install/resolvers.ts')

    expect(resolvers).toContain("'core.output_folder'")
    expect(resolvers).toContain('async resolveOutputFolder()')
    for (const path of ['src/main/output-folder-bridge.ts', 'src/main/fold/output-folder.ts', 'src/main/output-folder-model.ts']) {
      expect(code(path), path).not.toMatch(/\.toml|readFile|readFileSync\([^)]*config|child_process|spawn|execFile/)
    }
  })

  it('has the install bridge resolve the folder beside the install and not in it: the install’s snapshot carries no folder', () => {
    const bridge = code('src/main/install-bridge.ts')
    const projection = code('src/main/projections/install.ts')

    expect(bridge).toContain('outputFolderOf(sender.id)?.refresh()')
    expect(projection).not.toMatch(/outputFolder|output-folder|output_folder|OutputFolder/)
    expect(read('src/shared/install.ts')).not.toMatch(/outputFolder|output-folder|output_folder|OutputFolder/)
  })

  it('adds no second watched folder, no per-persona folder and no redirection of a skill’s writes', () => {
    const watcher = code('src/main/sources/project/watch-artifacts.ts')

    expect(watcher.match(/watch\(projectRoot/g)).toHaveLength(1)
    expect(watcher.match(/chokidar/g)).toHaveLength(1)
    for (const path of swept) {
      expect(code(path), path).not.toMatch(/OUTPUT_FOLDER_FOR_|folderFor(?:Persona|Agent|Kind)|redirect\w*\(|OUTPUT_DIR\b/)
    }
    // The skill is run as it always was: nothing a turn is written with names the folder.
    expect(code('src/main/session-bridge.ts')).not.toMatch(/outputFolder|output-folder/)
    expect(code('src/main/session-run.ts')).not.toMatch(/outputFolder|output-folder/)
  })
})

describe('the chooser is asked for and nothing is asked unprompted', () => {
  it('has no sound and no prompt in the head, the bridge or the model: no audio, no notification, no first-launch question', () => {
    for (const path of ['src/renderer/ui/outputs/outputs-head.tsx', 'src/main/output-folder-bridge.ts', 'src/main/output-folder-model.ts']) {
      expect(code(path), path).not.toMatch(/\bAudio\b|new Notification|\bplay\(|beep|showMessageBox|confirm\(|alert\(|prompt\(/)
    }
  })

  it('opens the chooser from `change…` and the menu, and from nothing else', () => {
    const shipping = [...filesUnder('src/main'), ...filesUnder('src/renderer')].filter(isShipping)
    const callers = shipping.filter((path) => /chooseOutputDirectory|chooseOutputFolder/.test(read(path)))

    expect(callers.sort()).toEqual([
      'src/main/output-folder-bridge.ts',
      'src/main/windows/choose-project.ts',
      'src/renderer/ui/app.tsx'
    ])
    // The window asks only from its handler, and main only from the request and the menu: none at startup.
    expect(code('src/renderer/ui/app.tsx').match(/chooseOutputFolder\(\)/g)).toHaveLength(1)
    expect(code('src/main/index.ts')).not.toMatch(/\.choose\(\s*\)|chooseOutputDirectory/)
  })

  it('gives the Welcome’s and the document window’s bridges nothing of the output folder', () => {
    for (const path of ['src/preload/welcome.ts', 'src/preload/doc.ts', 'src/main/welcome-bridge.ts', 'src/main/windows/welcome-window.ts', 'src/main/windows/doc-window.ts']) {
      expect(code(path), path).not.toMatch(/OUTPUT_FOLDER|outputFolder|output-folder|chooseOutputFolder/)
    }
  })
})

// ------------------------------------------------------ the bridge-level test

type Handler = (event: { sender: FakeSender }, ...args: unknown[]) => Promise<unknown>
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: vi.fn() }
}))

const { registerOutputFolderBridge, OUTPUT_FOLDER_CHOOSE_CHANNEL } = await import('../src/main/output-folder-bridge')
const { registerRailBridge, RAIL_GET_CHANNEL, RAIL_CHANGED_CHANNEL } = await import('../src/main/rail-bridge')
const { registerDocBridge, DOC_OPEN_CHANNEL, DOC_GET_CHANNEL, DOC_CHANGED_CHANNEL } = await import('../src/main/doc-bridge')
const { createInstallSource } = await import('../src/main/sources/install/resolvers')

class FakeSender {
  sent: [string, unknown][] = []
  destroyedListeners: (() => void)[] = []
  constructor(readonly id: number) {}
  send(channel: string, payload: unknown) {
    this.sent.push([channel, payload])
  }
  isDestroyed() {
    return false
  }
  once(_event: 'destroyed', listener: () => void) {
    this.destroyedListeners.push(listener)
  }
  pushes(channel: string): unknown[] {
    return this.sent.filter(([name]) => name === channel).map(([, payload]) => payload)
  }
}

describe('a project whose BMad configuration names another output folder', () => {
  let project: string
  let userData: string
  let runs: [string, string[]][]
  let configured: string
  let picks: (string | null)[]
  let watching: { folder: string; closed: boolean }[]
  let docWatchers: { boundary: DocBoundary; deliver: (read: DocRead) => void }[]
  let docSenders: FakeSender[]
  let rail: ReturnType<typeof registerOutputFolderBridge>

  const write = (path: string, text = 'x\n'): void => {
    mkdirSync(join(project, path, '..'), { recursive: true })
    writeFileSync(join(project, path), text)
  }

  /** Every file of the project with its bytes, for the comparison that must come out equal. */
  function tree(dir = project): Record<string, string> {
    const out: Record<string, string> = {}
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        out[`${relative(project, path)}/`] = ''
        Object.assign(out, tree(path))
      } else {
        out[relative(project, path)] = readFileSync(path, 'utf8')
      }
    }
    return out
  }

  /** What the real watcher would scan: the files under the folder it is told, as found observations. */
  function scan(folder: string): ArtifactObservation[] {
    const found: ArtifactObservation[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(project, dir), { withFileTypes: true })) {
        const path = `${dir}${entry.name}`
        if (entry.isDirectory()) walk(`${path}/`)
        else found.push({ type: 'artifact:found', path, size: 1, mtimeMs: 1 })
      }
    }
    try {
      walk(folder)
    } catch {
      // A folder that is not there has no rows.
    }
    return found
  }

  const run: CommandRunner = async (_command, args) => {
    runs.push(['uv', args])
    return { ok: true, stdout: JSON.stringify({ 'core.output_folder': configured }) }
  }

  beforeEach(() => {
    project = realpathSync(mkdtempSync(join(tmpdir(), 'folder-contract-')))
    userData = realpathSync(mkdtempSync(join(tmpdir(), 'folder-contract-data-')))
    runs = []
    configured = '{project-root}/docs/out'
    picks = []
    watching = []
    docWatchers = []
    docSenders = []
    handlers.clear()
    // The install: its resolver script is where it has always been; its own files are in `_bmad/`.
    write('_bmad/scripts/resolve_config.py', '# resolver\n')
    write('_bmad/config.toml', 'x = 1\n')
    write('_bmad/planning-artifacts/old.md', '# old\n')
    write('docs/out/prd.md', '# prd\n')
    write('docs/out/planning/arch.md', '# arch\n')
    write('elsewhere/mine.md', '# mine\n')

    rail = registerOutputFolderBridge({
      userDataPath: () => userData,
      projectPathFor: (id) => (id < 100 ? project : undefined),
      createSource: (root) => createInstallSource({ projectRoot: root, run }),
      chooseDirectory: async () => picks.shift() ?? null,
      parentWindowFor: () => null,
      writeDiagnostic: () => {}
    })
    registerRailBridge({
      projectPathFor: (id) => (id < 100 ? project : undefined),
      outputFolder: rail.handleFor,
      watch: ({ folder, onObservation }) => {
        const record = { folder, closed: false }
        watching.push(record)
        const rows = scan(folder)
        return {
          ready: Promise.resolve().then(() => rows.forEach(onObservation)),
          close: async () => void (record.closed = true)
        }
      },
      writeDiagnostic: () => {}
    })
    registerDocBridge({
      projectPathFor: (id) => (id < 100 ? project : undefined),
      parentWindowFor: () => ({ isDestroyed: () => false, focus: () => {}, webContents: { isDestroyed: () => false, send: () => {} } }) as never,
      openWindow: ({ fullPath }) => {
        const sender = new FakeSender(900 + docSenders.length)
        docSenders.push(sender)
        return { handle: { sender, fullPath, focus: () => {}, close: () => {} } as never, reused: false }
      },
      watch: ({ boundary, onRead }) => {
        docWatchers.push({ boundary, deliver: onRead })
        return { ready: Promise.resolve(), close: async () => {} }
      },
      writeDiagnostic: () => {}
    })
  })

  afterEach(() => {
    for (const path of [project, userData]) rmSync(path, { recursive: true, force: true })
  })

  const ask = async (sender: FakeSender): Promise<RailSnapshot> =>
    ((await handlers.get(RAIL_GET_CHANNEL)?.({ sender })) as { ok: true; snapshot: RailSnapshot }).snapshot
  const choose = (sender: FakeSender): Promise<unknown> => handlers.get(OUTPUT_FOLDER_CHOOSE_CHANNEL)?.({ sender }) as Promise<unknown>
  const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 30))

  it('shows the rows of that folder with no choice made, and says nothing of it', async () => {
    const window = new FakeSender(1)

    const snapshot = await ask(window)

    expect(snapshot.folder).toBe('docs/out/')
    expect(snapshot.rows.map((row) => row.path)).toEqual(['docs/out/planning/arch.md', 'docs/out/prd.md'])
    expect(snapshot.state).toBeUndefined()
    expect(snapshot.chosen).toBeUndefined()
    expect(watching.map((one) => one.folder)).toEqual(['docs/out/'])
  })

  it('asks the install’s resolver, at `_bmad/scripts`, for `core.output_folder`, and the install’s own reads are where they were', async () => {
    await ask(new FakeSender(1))

    expect(runs).toEqual([
      [
        'uv',
        [
          'run',
          '--no-project',
          '--quiet',
          join(project, '_bmad', 'scripts', 'resolve_config.py'),
          '--project-root',
          project,
          '--key',
          'core.output_folder'
        ]
      ]
    ])
    // The roster is asked of the same script as ever, whatever the output folder is.
    await createInstallSource({ projectRoot: project, run }).resolveRoster()
    expect(runs[1][1].slice(3)).toEqual([join(project, '_bmad', 'scripts', 'resolve_config.py'), '--project-root', project, '--key', 'agents'])
  })

  it('moves the rows on a choice, says what BMad writes to, and leaves an open document its file and its reloading', async () => {
    const window = new FakeSender(1)
    await ask(window)

    // A document of the folder is opened, and is told what it holds.
    const opened = await handlers.get(DOC_OPEN_CHANNEL)?.({ sender: window } as never, 'docs/out/prd.md' as never)
    expect(opened).toEqual({ ok: true })
    const doc = docSenders[0]
    expect(docWatchers[0].boundary).toBe(join(project, 'docs/out'))
    docWatchers[0].deliver({ state: 'present', text: '# prd v1', truncated: false })
    expect(await handlers.get(DOC_GET_CHANNEL)?.({ sender: doc })).toMatchObject({
      ok: true,
      snapshot: { path: 'docs/out/prd.md', folder: 'docs/out/', state: 'present' }
    })

    // The user chooses another folder in the project.
    picks = [join(project, 'elsewhere')]
    expect(await choose(window)).toEqual({ ok: true, outcome: { kind: 'chosen' } })
    await settle()

    const pushed = window.pushes(RAIL_CHANGED_CHANNEL) as RailSnapshot[]
    expect(pushed).toHaveLength(1)
    expect(pushed[0]).toMatchObject({
      folder: 'elsewhere/',
      chosen: 'elsewhere/',
      bmadFolder: 'docs/out/',
      state: 'different'
    })
    expect(pushed[0].rows.map((row) => row.path)).toEqual(['elsewhere/mine.md'])
    expect(watching.map((one) => [one.folder, one.closed])).toEqual([
      ['docs/out/', true],
      ['elsewhere/', false]
    ])

    // The open document keeps its file, its boundary and its reloading.
    docWatchers[0].deliver({ state: 'present', text: '# prd v2', truncated: false })
    expect(doc.pushes(DOC_CHANGED_CHANNEL)).toMatchObject([{ path: 'docs/out/prd.md', text: '# prd v2', folder: 'docs/out/' }])
    expect(docWatchers[0].boundary).toBe(join(project, 'docs/out'))

    // What is opened after it is bounded by the new folder.
    expect(await handlers.get(DOC_OPEN_CHANNEL)?.({ sender: window } as never, 'docs/out/prd.md' as never)).toMatchObject({
      ok: false,
      error: { code: 'doc/invalid-path', message: 'doc · not a document under elsewhere/' }
    })
    expect(await handlers.get(DOC_OPEN_CHANNEL)?.({ sender: window } as never, 'elsewhere/mine.md' as never)).toEqual({ ok: true })
    expect(docWatchers[1].boundary).toBe(join(project, 'elsewhere'))
  })

  it('leaves the project byte for byte as it was after choosing, refusing, cancelling and using BMad’s folder again', async () => {
    const window = new FakeSender(1)
    await ask(window)
    const before = tree()

    picks = [join(project, 'elsewhere'), userData, null, join(project, '_bmad', 'planning-artifacts')]
    await choose(window)
    await choose(window)
    await choose(window)
    await choose(window)
    rail.forget(1)
    await settle()

    expect(tree()).toEqual(before)
    // What was kept is under userData, keyed by the project, and is the only thing that was.
    expect(JSON.parse(readFileSync(join(userData, 'output-folders.json'), 'utf8'))).toEqual({ version: 1, folders: {} })
  })

  it('returns to BMad’s folder in one snapshot when the choice is forgotten, and follows a changed configuration', async () => {
    const window = new FakeSender(1)
    await ask(window)
    picks = [join(project, 'elsewhere')]
    await choose(window)
    await settle()

    rail.forget(1)
    await settle()

    const pushed = window.pushes(RAIL_CHANGED_CHANNEL) as RailSnapshot[]
    expect(pushed.at(-1)).toMatchObject({ folder: 'docs/out/', bmadFolder: 'docs/out/' })
    expect(pushed.at(-1)?.chosen).toBeUndefined()
    expect(pushed.at(-1)?.state).toBeUndefined()

    // BMad's configuration changes and the install's watcher says so: the rail follows, in one more snapshot.
    write('other-out/x.md')
    configured = '{project-root}/other-out'
    const { outputFolderOf } = await import('../src/main/output-folder-model')
    await outputFolderOf(1)?.refresh()
    await settle()
    expect((window.pushes(RAIL_CHANGED_CHANNEL) as RailSnapshot[]).at(-1)).toMatchObject({ folder: 'other-out/' })
  })

  it('falls back to the install’s folder, and says nothing, when the resolver fails', async () => {
    const failing: CommandRunner = async () => ({ ok: false, kind: 'exit', code: 1 })
    handlers.clear()
    const second = registerOutputFolderBridge({
      userDataPath: () => userData,
      projectPathFor: () => project,
      createSource: (root) => createInstallSource({ projectRoot: root, run: failing }),
      parentWindowFor: () => null,
      writeDiagnostic: () => {}
    })

    const view: FolderView = await second.handleFor(new FakeSender(7), project).refresh()

    expect(view).toEqual({ folder: '_bmad/' })
  })
})

describe('what the document sees', () => {
  it('names the folder in the snapshot it is handed, and nowhere else', () => {
    const snapshot: DocSnapshot = {
      revision: 1,
      path: 'docs/out/prd.md',
      fullPath: '/p/docs/out/prd.md',
      kind: 'markdown',
      folder: 'docs/out/',
      state: 'refused',
      text: '',
      truncated: false
    }

    expect(snapshot.folder).toBe('docs/out/')
  })
})

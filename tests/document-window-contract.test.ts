import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { allStylesheets, guardedStylesheets, literalsIn, withoutComments } from './literal-guard'

/**
 * Story 1.12's document window, asserted from the sources and the stylesheet as
 * text — there is no DOM environment, so what the contract forbids is held
 * where it would be written. What the window renders is `doc-app.test.tsx`'s;
 * the pipeline's is `render-markdown.test.ts`'s; the bridge's is
 * `bridge-contract.test.ts`'s and `doc-bridge.test.ts`'s.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

/** Source with block comments and whole-line `//` comments removed. */
const code = (path: string): string => withoutComments(read(path)).replace(/^\s*\/\/.*$/gm, '')

const isSource = (path: string): boolean => /\.(ts|tsx)$/.test(path) && !/\.test\./.test(path)

const DOC_DIR = 'src/renderer/ui/doc'
const DOC_CSS = `${DOC_DIR}/doc-window.css`
const DOC_APP = `${DOC_DIR}/doc-app.tsx`
const MARKDOWN_BODY = `${DOC_DIR}/markdown-body.tsx`
const TOKENS_CSS = 'src/renderer/design/tokens.css'

const docSources = filesUnder(DOC_DIR).filter(isSource)
const mainSources = filesUnder('src/main').filter(isSource)
const rendererSources = filesUnder('src/renderer').filter(isSource)
const allSources = filesUnder('src').filter(isSource)

/** The main-side modules this story added. */
const DOC_MAIN = [
  'src/main/doc-bridge.ts',
  'src/main/fold/document-kind.ts',
  'src/main/projections/document.ts',
  'src/main/sources/project/resolve-document.ts',
  'src/main/sources/project/watch-document.ts',
  'src/main/windows/doc-window.ts',
  'src/main/windows/macos-escapes.ts'
]

const declared = new Set(
  [...withoutComments(read(TOKENS_CSS)).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name)
)

describe('the document stylesheet', () => {
  const css = withoutComments(read(DOC_CSS))

  it('is governed by the literal guard and holds no colour, dimension, radius or font stack', () => {
    expect(guardedStylesheets()).toContain(DOC_CSS)
    expect(literalsIn(DOC_CSS, read(DOC_CSS))).toEqual([])
  })

  it('names only tokens that tokens.css declares', () => {
    const used = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name)

    expect(used.length).toBeGreaterThan(0)
    expect(used.filter((name) => !declared.has(name))).toEqual([])
  })

  it('spends the tokens the contract names', () => {
    for (const name of [
      '--z-scrim',
      '--z-window',
      '--scrim',
      '--win-width',
      '--win-height',
      '--win-top',
      '--win-line',
      '--win-titlebar',
      '--win-foot',
      '--win-foot-padding',
      '--win-lights-gap',
      '--win-light-size',
      '--win-light',
      '--grad-titlebar',
      '--shadow-window',
      '--radius-window',
      '--doc-body-padding',
      '--doc-read-max',
      '--ink-md',
      '--fs-doc-read',
      '--lh-read',
      '--fs-h1',
      '--track-h1',
      '--track-md-h3',
      '--track-micro',
      '--weight-strong',
      '--ghost-padding',
      '--ghost-border-hover',
      '--accent',
      '--panel',
      '--panel-2',
      '--line',
      '--dim',
      '--fs-ident',
      '--fs-meta',
      '--fs-body-ui'
    ]) {
      expect(css, name).toContain(`var(${name})`)
    }
  })

  it('is the one stylesheet that spends --z-scrim and --z-window, and each exactly once', () => {
    const spenders = allStylesheets().filter((path) =>
      /var\(\s*--z-(?:scrim|window)/.test(withoutComments(read(path)))
    )

    expect(spenders).toEqual([DOC_CSS])
    expect(css.match(/z-index\s*:\s*var\(--z-scrim\)/g)).toHaveLength(1)
    // The window's ceiling is also the one line standing on its own above the scrim.
    expect(css.match(/z-index\s*:\s*var\(--z-window\)/g)).toHaveLength(2)
    expect(css.match(/z-index/g)).toHaveLength(3)
  })

  it('is the only stylesheet with a z-index at all', () => {
    const offenders = allStylesheets().filter(
      (path) => path !== TOKENS_CSS && path !== DOC_CSS && /z-index/.test(withoutComments(read(path)))
    )

    expect(offenders).toEqual([])
  })

  it('holds no outline, keyframes, transition, animation or focus rule, and no shorthand font', () => {
    expect(css).not.toMatch(/outline|@keyframes|transition|animation|:focus|@media/)
    expect(css).not.toMatch(/(^|[\s;{])font\s*:/)
  })

  it('has no literal z-index value: the two indexes are the tokens', () => {
    expect(css).not.toMatch(/z-index\s*:\s*-?\d/)
  })

  it('grounds the body on transparent, so the stage shows the room through the scrim', () => {
    expect(css).toMatch(/body\s*\{[^}]*background:\s*transparent/)
  })
})

describe('the document window’s controls', () => {
  const app = code(DOC_APP)

  it('draws exactly three buttons, labelled Reveal in Finder, Open in editor, Close, in that order', () => {
    expect(app.match(/<button/g)).toHaveLength(3)
    const labels = [...app.matchAll(/<button[^>]*>\s*([^<]+?)\s*<\/button>/g)].map(([, label]) => label)

    expect(labels).toEqual(['Reveal in Finder', 'Open in editor', 'Close'])
  })

  it('has no refresh, edit, save, copy, print or reload affordance in any label or copy', () => {
    for (const path of [DOC_APP, MARKDOWN_BODY]) {
      // Strings and JSX text only: identifiers and type names are not copy.
      const literals = [
        ...code(path).matchAll(/>\s*([^<>{}]+?)\s*<\//g),
        ...code(path).matchAll(/'([^'\n]+)'/g),
        ...code(path).matchAll(/"([^"\n]+)"/g)
      ]
        .map(([, text]) => text)
        .join('\n')
        // `editor` is the one of these words the contract names.
        .replace(/editor/gi, '')

      expect(literals, path).not.toMatch(/\b(refresh|edit|save|copy|print|reload|zoom|next|previous)\w*|\bfind\b/i)
    }
  })

  it('draws no input, link, menu, dialog role, live region or scrim handler', () => {
    expect(app).not.toMatch(/<input|<a[\s>]|<select|<textarea|contentEditable|role=|aria-modal|aria-live/)
    expect(app).not.toMatch(/className="doc-scrim"[^>]*on[A-Z]/)
  })

  it('names no key: Esc belongs to main, which closes the window from wherever focus is', () => {
    // The components: the sanitiser's list of forbidden handler names is not a handler.
    for (const path of docSources.filter((p) => p.endsWith('.tsx'))) {
      expect(code(path), path).not.toMatch(/onKey|Escape|\.key\b|keydown/i)
    }
  })

  it('takes focus into the document region on mount, and not into Close', () => {
    expect(app).toMatch(/<article[^>]*tabIndex=\{-1\}[^>]*aria-label="Document"/)
    expect(app).toMatch(/region\.current\?\.focus\(\)/)
    expect(app).not.toMatch(/autoFocus/)
  })

  it('speaks the transition into a state, once, through the window’s own announcer', () => {
    const effect = app.slice(app.indexOf('announcementFor('), app.indexOf('[announcer, snapshot'))

    expect(effect).toContain('announcementFor(previous.current, snapshot.state)')
    expect(effect).toContain('previous.current = snapshot.state')
    expect(effect).toContain('if (message !== null)')
    expect(effect).toContain('announcer.announce(message, performance.now())')
    expect(effect.indexOf('announcementFor(')).toBeLessThan(effect.indexOf('previous.current = '))
    expect(app).toContain('[announcer, snapshot]')
  })

  it('mounts the one live region through a11y/live-region, with no second of its own', () => {
    expect(code(DOC_APP)).toContain("from '../a11y/live-region'")
    expect(docSources.filter((path) => /aria-live/.test(read(path)))).toEqual([])
  })
})

describe('the trust boundary', () => {
  it('sets inner HTML in markdown-body.tsx and nowhere else in the product', () => {
    expect(rendererSources.filter((path) => /dangerouslySetInnerHTML/.test(code(path)))).toEqual([
      MARKDOWN_BODY
    ])
    expect(allSources.filter((path) => /[iI]nnerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code(path)))).toEqual([
      MARKDOWN_BODY
    ])
    expect(code(MARKDOWN_BODY).match(/dangerouslySetInnerHTML/g)).toHaveLength(1)
  })

  it('feeds it only the pipeline’s output', () => {
    const body = code(MARKDOWN_BODY)

    expect(body).toContain("from './render-markdown'")
    expect(body).toMatch(/renderMarkdown\(text\)/)
    expect(body).toMatch(/__html:\s*html\b/)
    expect(body).not.toMatch(/markdownToHtml/)
  })

  it('turns markdown-it’s HTML off and never back on, and opens nothing the pipeline did not sanitise', () => {
    const pipeline = code(`${DOC_DIR}/render-markdown.ts`)

    expect(pipeline).toMatch(/html:\s*false/)
    expect(pipeline).toMatch(/linkify:\s*false/)
    expect(pipeline).toMatch(/typographer:\s*false/)
    for (const path of allSources) {
      expect(code(path), path).not.toMatch(/html:\s*true/)
    }
    expect(pipeline).toMatch(/isSupported !== true/)
    expect(pipeline).toMatch(/return ''/)
  })

  it('has no openExternal, openPath, ipcMain.on or generic send passthrough anywhere in the product', () => {
    for (const path of allSources) {
      const text = code(path)

      expect(text, path).not.toMatch(/openExternal|shell\.openPath|\bopenPath\(/)
      expect(text, path).not.toMatch(/ipcMain\.on\b|ipcMain\.once\b/)
    }
  })

  it('renders no href, src, srcset, img or inline style in the document window’s sources', () => {
    // The components: the sanitiser names these attributes in order to forbid them.
    for (const path of docSources.filter((p) => p.endsWith('.tsx'))) {
      const text = code(path)

      expect(text, path).not.toMatch(/href=|src=|srcset|<img|style=/)
    }
    expect(read('src/renderer/doc.html')).not.toMatch(/<img|<a[\s>]|<link/)
  })

  it('loads the document page and nothing else: loadURL names the dev server and a fixed page', () => {
    const windowSource = code('src/main/windows/doc-window.ts')
    const loads = windowSource.match(/loadURL\(`[^`]*`\)/g) ?? []

    expect(loads).toHaveLength(1)
    expect(loads[0]).toContain('devServerUrl')
    expect(loads[0]).toContain('DOC_PAGE')
    expect(mainSources.filter((path) => /loadURL\(/.test(code(path))).sort()).toEqual([
      'src/main/windows/doc-window.ts',
      'src/main/windows/main-window.ts'
    ])
  })

  it('opens Open in editor with open -t through execFile, never a shell string', () => {
    const escapes = code('src/main/windows/macos-escapes.ts')

    expect(escapes).toMatch(/args:\s*\['-t', fullPath\]/)
    expect(escapes).toContain("file: 'open'")
    expect(escapes).not.toMatch(/\bexec\(|execSync|spawn|shell:\s*true/)
  })
})

describe('the document window stands apart from the shell', () => {
  it('imports nothing from the shell, the rail, the install, the team or the app', () => {
    for (const path of docSources) {
      const specifiers = [...code(path).matchAll(/from\s+'([^']+)'|import\s+'([^']+)'/g)].map(
        (match) => match[1] ?? match[2]
      )

      for (const specifier of specifiers) {
        expect(specifier, path).not.toMatch(
          /(^|\/)(shell|outputs|install|team|status|persona|chat|feed)(\/|$)|\/app$|preload|\/main\//
        )
      }
    }
  })

  it('loads the tokens, the page, the focus ring and the live region, and nothing of the shell’s', () => {
    const entry = read(`${DOC_DIR}/main.tsx`)

    expect(entry).toMatch(/^import '\.\.\/\.\.\/design\/tokens\.css'$/m)
    expect(entry).toMatch(/^import '\.\.\/\.\.\/design\/page\.css'$/m)
    expect(entry).toMatch(/^import '\.\.\/\.\.\/design\/focus\.css'$/m)
    expect(entry.indexOf('tokens.css')).toBeLessThan(entry.indexOf('focus.css'))
    expect(entry).toContain("from './doc-app'")
  })

  it('is its own page and its own preload, and the shell’s page and preload know nothing of it', () => {
    expect(read('src/renderer/doc.html')).toContain('./ui/doc/main.tsx')
    expect(read('src/renderer/index.html')).not.toMatch(/doc\.html|ui\/doc/)
    expect(read('electron.vite.config.ts')).toContain("doc: resolve(__dirname, 'src/preload/doc.ts')")
    expect(read('electron.vite.config.ts')).toContain("doc: resolve(__dirname, 'src/renderer/doc.html')")
    expect(read('src/preload/index.ts')).not.toMatch(/docWindow|DOC_GET|DOC_CHANGED|DOC_REVEAL|DOC_EDIT|DOC_CLOSE_/)
  })

  it('loads no second file at run time: each preload imports its types, electron and the channel constants, which the build inlines into each', () => {
    for (const path of ['src/preload/index.ts', 'src/preload/doc.ts']) {
      const imports = [
        ...code(path).matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)
      ]
      expect(imports.length, path).toBeGreaterThan(1)

      for (const [, isType, specifier] of imports) {
        expect(
          isType !== undefined || specifier === 'electron' || specifier === '../shared/channels',
          `${path} imports ${specifier}`
        ).toBe(true)
      }
    }
    // A module both entries import is built as a chunk the other `require`s; the config makes each entry its own copy.
    expect(read('electron.vite.config.ts')).toMatch(/inlineSharedIntoEachPreload\(\)/)
  })
})

describe('the document window’s bridge', () => {
  const preload = code('src/preload/doc.ts')
  const api = code('src/preload/doc-api.d.ts')

  it('exposes one object named docWindow, and only through contextBridge', () => {
    expect(preload).toMatch(/contextBridge\.exposeInMainWorld\('docWindow', docWindow\)/)
    expect(preload.match(/exposeInMainWorld/g)).toHaveLength(1)
  })

  it('declares exactly five methods, and none takes a parameter named or typed as a path', () => {
    const body = api.match(/interface DocWindowApi \{([\s\S]*?)\n\}/)

    expect(body).not.toBeNull()
    const methods = [...body![1].matchAll(/^\s+(\w+)\s*\(([^)]*)\)/gm)]
    expect(methods.map(([, name]) => name)).toEqual([
      'getDocument',
      'onDocumentChanged',
      'revealInFinder',
      'openInEditor',
      'close'
    ])
    for (const [, name, parameters] of methods) {
      expect(parameters, name).not.toMatch(/path|file|url|string/i)
    }
  })

  it('invokes each command with its channel and no argument', () => {
    expect(preload).not.toMatch(/ipcRenderer\.invoke\([A-Z_]+,/)
    expect(preload).not.toMatch(/ipcRenderer\.send|postMessage|sendSync/)
    expect(preload).not.toMatch(/\binvoke:|\bsend:/)
    expect(preload).toContain('ipcRenderer.invoke(channel)')
  })
})

describe('reading the file', () => {
  it('uses node:fs in main only in the source modules that read, and in no renderer file', () => {
    const usesFs = (path: string): boolean => /node:fs|from 'fs'|require\(['"]fs/.test(code(path))

    const fromDocument = DOC_MAIN.filter(usesFs).sort()
    expect(fromDocument).toEqual([
      'src/main/sources/project/resolve-document.ts',
      'src/main/sources/project/watch-document.ts'
    ])
    expect(rendererSources.filter(usesFs)).toEqual([])
    expect(allSources.filter((path) => path.startsWith('src/preload') || path.startsWith('src/shared')).filter(usesFs)).toEqual([])
  })

  it('reaches Electron’s windows and the OS only from windows/ among the document modules', () => {
    for (const path of DOC_MAIN.filter((p) => !p.startsWith('src/main/windows/'))) {
      const text = code(path)

      expect(text, path).not.toMatch(/new BrowserWindow|BrowserWindow\.|child_process|\bshell\./)
      // The bridge speaks ipcMain; no other value of Electron is imported.
      const values = [...text.matchAll(/^import (?!type)[^;\n]*from 'electron'/gm)].map(([line]) => line)
      expect(values.every((line) => line === "import { ipcMain } from 'electron'"), path).toBe(true)
    }
  })

  it('has the renderer read nothing: no fetch, XMLHttpRequest or file API in the document window', () => {
    for (const path of docSources) {
      expect(code(path), path).not.toMatch(/\bfetch\(|XMLHttpRequest|FileReader|showOpenFilePicker|node:/)
    }
  })

  it('watches one file with chokidar, atomically, and never polls or waits for a write to finish', () => {
    const watcher = code('src/main/sources/project/watch-document.ts')

    expect(watcher).toContain('atomic: true')
    expect(watcher).toContain('alwaysStat: true')
    expect(watcher).toContain('ignoreInitial: false')
    expect(watcher).toContain('watch(fullPath,')
    expect(watcher).not.toMatch(/awaitWriteFinish|usePolling|interval:|debounce|followSymlinks/)
  })

  it('bounds the read at DOC_MAX_BYTES and sniffs DOC_SNIFF_BYTES', () => {
    const watcher = code('src/main/sources/project/watch-document.ts')
    const shared = code('src/shared/document.ts')

    expect(shared).toContain('DOC_MAX_BYTES = 1_048_576')
    expect(shared).toContain('DOC_SNIFF_BYTES = 8192')
    expect(watcher).toContain('Math.min(info.size, DOC_MAX_BYTES)')
    expect(watcher).toContain('DOC_SNIFF_BYTES')
    expect(watcher).toContain("new TextDecoder('utf-8')")
    expect(watcher).not.toMatch(/readFile\(|readFileSync|createReadStream/)
  })

  it('answers doc:get from the held snapshot and never reads the file itself', () => {
    const bridge = code('src/main/doc-bridge.ts')

    expect(bridge).toMatch(/await entry\.ready/)
    expect(bridge).toMatch(/entry\.projection\.snapshot\(\)/)
    expect(bridge).not.toMatch(/readDocument|readFile|node:fs/)
  })

  it('registers every handler with ipcMain.handle, and opens the bridge after the rail’s', () => {
    const bridge = code('src/main/doc-bridge.ts')
    const index = read('src/main/index.ts')

    expect(bridge.match(/ipcMain\.handle\(/g)).toHaveLength(5)
    expect(index).toContain('registerDocBridge()')
    expect(index.indexOf('registerRailBridge()')).toBeLessThan(index.indexOf('registerDocBridge()'))
  })

  it('holds no position, recommendation or stage, and reads no sprint status', () => {
    for (const path of [...DOC_MAIN, ...docSources, 'src/shared/document.ts']) {
      const text = code(path)

      expect(text, path).not.toMatch(/sprint-status|localStorage|sessionStorage|indexedDB|userData/)
      expect(text, path).not.toMatch(/recommend|next step|pipeline/i)
    }
  })
})

describe('the source tree', () => {
  it('adds no dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(Object.keys(pkg.dependencies).sort()).toEqual(['chokidar', 'dompurify', 'markdown-it'])
    expect(pkg.dependencies).toEqual({ chokidar: '4.0.3', dompurify: '3.4.16', 'markdown-it': '15.0.2' })
  })

  it('keeps exactly two z-index tokens, five motion declarations and the verbatim block', () => {
    const tokens = withoutComments(read(TOKENS_CSS))

    expect([...tokens.matchAll(/--z-[\w-]+\s*:/g)]).toHaveLength(2)
    expect([...tokens.matchAll(/--motion-[\w-]+\s*:/g)]).toHaveLength(5)
    expect(tokens).not.toMatch(/@media[^{]*width/)
  })

  it('keeps the document modules where the layer graph puts them', () => {
    for (const path of DOC_MAIN) {
      expect(relative(ROOT, join(ROOT, path))).toBe(path)
    }
    expect(DOC_MAIN.filter((path) => !mainSources.includes(path))).toEqual([])
  })

  it('says so in one line, and does not throw, when the preload did not load', () => {
    const hook = code(`${DOC_DIR}/use-document.ts`)
    const app = code(DOC_APP)

    // Both bridge methods are checked on `window.docWindow?`, never assumed.
    expect(hook).toMatch(/typeof window\.docWindow\?\.getDocument === 'function'/)
    expect(hook).toMatch(/typeof window\.docWindow\?\.onDocumentChanged === 'function'/)
    // With no bridge the effect never connects, and the page is the one line.
    expect(hook).toMatch(/if \(!available\) \{\s*return\s*\}/)
    expect(app).toMatch(/if \(!available\) \{\s*return <p className="doc-unavailable">bridge\/unavailable · the preload did not load<\/p>\s*\}/)
  })

  it('mounts the conversation under the shell, with neither the memlog feed nor a menu list', () => {
    const app = read('src/renderer/ui/app.tsx')

    expect(app).not.toContain('PREVIEW_NOTES')
    expect(app).not.toContain('snapshot.menus')
    expect(app).toMatch(/<Shell[^>]*rail=\{rail\}[^>]*railFailure=\{railFailure\}[\s\S]*?<Turns entries=/)
    expect(app).not.toMatch(/ui\/doc|docWindow|openDoc/)
  })
})

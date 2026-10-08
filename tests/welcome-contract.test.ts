import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { allStylesheets, guardedStylesheets, literalsIn, mediaConditionsIn, withoutComments } from './literal-guard'

/**
 * Story 5.1's Welcome, asserted from the sources and the stylesheet as text:
 * what the contract forbids is held where it would be written. What the page
 * draws is `src/renderer/ui/welcome/welcome-audit.dom.test.tsx`'s and
 * `welcome-app.test.tsx`'s; the bridge's behaviour is
 * `src/main/welcome-bridge.test.ts`'s; the lifecycle is `startup.test.ts`'s;
 * and the channel and method counts are `bridge-contract.test.ts`'s.
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

const DIR = 'src/renderer/ui/welcome'
const CSS = `${DIR}/welcome.css`
const APP = `${DIR}/welcome-app.tsx`
const TOKENS_CSS = 'src/renderer/design/tokens.css'
const PRELOAD = 'src/preload/welcome.ts'
const WINDOW = 'src/main/windows/welcome-window.ts'
const BRIDGE = 'src/main/welcome-bridge.ts'

const pageSources = filesUnder(DIR).filter(isSource)
const allSources = filesUnder('src').filter(isSource)
const mainSources = filesUnder('src/main').filter(isSource)
const rendererSources = filesUnder('src/renderer').filter(isSource)

const declared = new Set(
  [...withoutComments(read(TOKENS_CSS)).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name)
)

describe('the Welcome stylesheet', () => {
  const css = withoutComments(read(CSS))

  it('is governed by the literal guard and holds no colour, dimension, radius or font stack', () => {
    expect(guardedStylesheets()).toContain(CSS)
    expect(allStylesheets()).toContain(CSS)
    expect(literalsIn(CSS, read(CSS))).toEqual([])
  })

  it('names only tokens that tokens.css declares', () => {
    const used = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name)

    expect(used.length).toBeGreaterThan(0)
    expect(used.filter((name) => !declared.has(name))).toEqual([])
  })

  it('spends the layout the design names: the 560px column, the 960px band, four lanes of 1fr 2fr 1fr 1fr', () => {
    const tokens = withoutComments(read(TOKENS_CSS))

    expect(tokens).toMatch(/--welcome-col:\s*560px;/)
    expect(tokens).toMatch(/--welcome-team-max:\s*960px;/)
    expect(tokens).toMatch(/--welcome-lanes:\s*1fr 2fr 1fr 1fr;/)
    expect(css).toMatch(/max-width:\s*var\(--welcome-col\)/)
    expect(css).toMatch(/max-width:\s*var\(--welcome-team-max\)/)
    expect(css).toMatch(/grid-template-columns:\s*var\(--welcome-lanes\)/)
  })

  it('takes the second breakpoint and no other: the lanes stack at 1000px, and nothing else is conditional', () => {
    expect(mediaConditionsIn(read(CSS))).toEqual(['(max-width:1000px)'])
    expect(css).toMatch(/@media \(max-width: 1000px\) \{\s*\.welcome-lanes \{\s*grid-template-columns: 1fr;\s*\}\s*\}/)
  })

  it('scrolls inside its own root, because the body does not', () => {
    expect(css).toMatch(/\.welcome-root \{[^}]*overflow: auto;/)
    expect(css).toMatch(/\.welcome-root \{[^}]*height: var\(--viewport-tall\)/)
  })

  it('moves nothing: no transition, animation, keyframes, transform or smooth scroll', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes|(?<![-\w])transform|scroll-behavior|var\(--motion-/)
  })

  it('branches on no theme: no prefers-color-scheme, contrast or forced-colors, and names no theme', () => {
    expect(css).not.toMatch(/prefers-color-scheme|prefers-contrast|forced-colors|data-theme|color-scheme/)
  })

  it('leaves the focus ring to the one shared rule: no outline, no focus selector of its own', () => {
    expect(css).not.toMatch(/outline|:focus/)
  })

  it('gives a card no hover, pointer or active state, and a recent row only its own', () => {
    expect(css).not.toMatch(/\.welcome-card[^{]*:(?:hover|active|focus)/)
    const card = css.match(/\.welcome-card \{[^}]*\}/)?.[0] ?? ''
    expect(card).not.toMatch(/cursor/)
  })

  it('draws the persona cards from the panel, the line and the card radius, as the design says', () => {
    const card = css.match(/\.welcome-card \{[^}]*\}/)?.[0] ?? ''

    expect(card).toContain('background: var(--panel)')
    expect(card).toContain('border: var(--rule-width) solid var(--line)')
    expect(card).toContain('border-radius: var(--radius-card)')
    expect(card).toContain('padding: var(--welcome-card-padding)')
  })

  it('draws the open button as the composer’s send button, from the same tokens', () => {
    const button = css.match(/\.welcome-open \{[^}]*\}/)?.[0] ?? ''

    for (const token of ['--send-padding', '--send-bg', '--send-line', '--send-ink', '--radius-control']) {
      expect(button, token).toContain(`var(${token})`)
    }
    expect(css).toMatch(/\.welcome-open:hover \{\s*background: var\(--send-hover\)/)
  })

  it('draws the theme line along the bottom edge, right-aligned, in meta mono: the current word text-strong, the others accent, and underlined on hover', () => {
    const rule = (selector: string): string => css.match(new RegExp(`${selector.replace(/[.[\]']/g, '\\$&')} \\{[^}]*\\}`))?.[0] ?? ''

    expect(rule('.welcome-foot')).toMatch(/justify-content: flex-end/)
    expect(rule('.welcome-theme')).toMatch(/font-family: var\(--mono\)/)
    expect(rule('.welcome-theme')).toMatch(/font-size: var\(--fs-meta\)/)
    expect(rule('.welcome-theme-word')).toMatch(/color: var\(--accent\)/)
    expect(rule('.welcome-theme-word:hover')).toMatch(/text-decoration: underline/)
    expect(rule(".welcome-theme-word[aria-pressed='true']")).toMatch(/color: var\(--text-strong\)/)
    expect(rule(".welcome-theme-word[aria-pressed='true']")).toMatch(/text-decoration: none/)
    // The line is text and nothing paints it: no ground, border, shadow or radius of its own.
    expect(rule('.welcome-theme-word')).not.toMatch(/box-shadow|border-radius|border: var/)
  })

  it('draws the drop zone as the product’s one dashed border, and nothing else is dashed', () => {
    expect(css.match(/dashed/g)).toHaveLength(1)
    expect(css).toMatch(/\.welcome-drop \{[^}]*border: var\(--rule-width\) dashed var\(--line\)/)
    expect(css).toMatch(/\.welcome-drop--over \{[^}]*background: var\(--accent-bg\);[^}]*border-color: var\(--accent-border\)/)
    for (const path of allStylesheets().filter((p) => p !== CSS && p !== TOKENS_CSS)) {
      expect(withoutComments(read(path)), path).not.toContain('dashed')
    }
  })

  it('keeps what a user acts on above the faint tier: the drop hint, a row’s path, a missing row’s words', () => {
    for (const selector of ['.welcome-drop-hint', '.welcome-recent-path', '.welcome-recent-missing', '.welcome-team-meta']) {
      const rule = css.match(new RegExp(`${selector.replace('.', '\\.')} \\{[^}]*\\}`))?.[0] ?? ''

      expect(rule, selector).toMatch(/color: var\(--dim\)/)
    }
  })

  it('is spent by nothing but the Welcome’s own tokens for its dimensions', () => {
    const own = [...withoutComments(read(TOKENS_CSS)).matchAll(/(--welcome-[\w-]+)\s*:/g)].map(([, name]) => name)

    expect(own.length).toBeGreaterThan(8)
    for (const name of own) {
      const spenders = allStylesheets().filter((path) => path !== TOKENS_CSS && read(path).includes(`var(${name}`))
      expect(spenders, name).toEqual([CSS])
    }
  })
})

describe('the Welcome stands apart from the shell', () => {
  it('imports the design, the a11y and persona modules and its own, and nothing of the shell', () => {
    const allowed = /^(?:\.\/[\w-]+(?:\.css)?|\.\.\/\.\.\/design\/[\w-]+\.css|\.\.\/a11y\/[\w-]+|\.\.\/persona\/[\w-]+|\.\.\/\.\.\/\.\.\/shared\/(?:welcome|theme)|react|react-dom\/client)$/

    for (const path of pageSources) {
      const specifiers = [...code(path).matchAll(/from\s+'([^']+)'|import\s+'([^']+)'/g)].map(
        (match) => match[1] ?? match[2]
      )

      for (const specifier of specifiers) {
        expect(specifier, `${path} imports ${specifier}`).toMatch(allowed)
      }
    }
  })

  it('names no shell, output, install, team, chat, feed, status or app module, nor main, nor the preload', () => {
    for (const path of pageSources) {
      const specifiers = [...code(path).matchAll(/from\s+'([^']+)'|import\s+'([^']+)'/g)].map(
        (match) => match[1] ?? match[2]
      )

      for (const specifier of specifiers) {
        expect(specifier, path).not.toMatch(
          /(^|\/)(shell|outputs|install|team|chat|feed|status|party|doc)(\/|$)|\/app$|\/main\//
        )
      }
    }
  })

  it('reaches no bridge but its own: no window.harness, no window.docWindow, no ipc of its own', () => {
    for (const path of pageSources) {
      expect(code(path), path).not.toMatch(/window\.harness|window\.docWindow|ipcRenderer|ipcMain|require\(|process\./)
    }
    expect(code(APP).match(/window\.welcome/g)?.length).toBeGreaterThan(3)
  })

  it('loads the tokens, the page, the focus ring and its own app, and nothing of the shell’s entry', () => {
    const entry = read(`${DIR}/main.tsx`)

    expect(entry).toMatch(/^import '\.\.\/\.\.\/design\/tokens\.css'$/m)
    expect(entry).toMatch(/^import '\.\.\/\.\.\/design\/page\.css'$/m)
    expect(entry).toMatch(/^import '\.\.\/\.\.\/design\/focus\.css'$/m)
    expect(entry.indexOf('tokens.css')).toBeLessThan(entry.indexOf('focus.css'))
    expect(entry).toContain("from './welcome-app'")
  })

  it('is its own page and its own preload, and no other page or preload knows of them', () => {
    expect(read('src/renderer/welcome.html')).toContain('./ui/welcome/main.tsx')
    expect(read('src/renderer/welcome.html')).not.toMatch(/<img|<a[\s>]|<link|<script(?![^>]*type="module")/)
    for (const other of ['src/renderer/index.html', 'src/renderer/doc.html']) {
      expect(read(other), other).not.toMatch(/welcome/)
    }
    const config = read('electron.vite.config.ts')
    expect(config).toContain("welcome: resolve(__dirname, 'src/preload/welcome.ts')")
    expect(config).toContain("welcome: resolve(__dirname, 'src/renderer/welcome.html')")
    for (const other of ['src/preload/index.ts', 'src/preload/doc.ts']) {
      expect(read(other), other).not.toMatch(/welcome|WELCOME/i)
    }
  })

  it('mounts the one live region through a11y/live-region, with no second of its own', () => {
    expect(code(APP)).toContain("from '../a11y/live-region'")
    expect(code(APP).match(/<LiveRegion/g)).toHaveLength(1)
    expect(pageSources.filter((path) => /aria-live|role="(?:alert|status|log)"/.test(read(path)))).toEqual([])
  })
})

describe('the Welcome’s preload', () => {
  const preload = code(PRELOAD)

  it('imports its types, electron and the channel constants, so the build inlines each and loads no second file', () => {
    const imports = [...preload.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)]

    expect(imports.length).toBeGreaterThan(2)
    for (const [, isType, specifier] of imports) {
      expect(
        isType !== undefined ||
          specifier === 'electron' ||
          specifier === '../shared/channels' ||
          // Story 5.2: `followTheme` and the state's reader, inlined like the channels.
          specifier === '../shared/theme',
        `imports ${specifier}`
      ).toBe(true)
    }
  })

  it('exposes exactly seven named methods, each on a channel from shared/channels, and no generic send or invoke', () => {
    const api = preload.slice(preload.indexOf('const welcome: WelcomeApi = {'), preload.indexOf('contextBridge.exposeInMainWorld'))
    const methods = [...api.matchAll(/^ {2}(\w+):/gm)].map(([, name]) => name)

    expect(methods).toEqual([
      'getRecent',
      'chooseFolder',
      'openRecent',
      'openDropped',
      'getTheme',
      'chooseTheme',
      'onThemeChanged'
    ])
    expect(preload).toContain("contextBridge.exposeInMainWorld('welcome', welcome)")
    expect(preload).not.toMatch(/exposeInMainWorld\('welcome',\s*ipcRenderer|invoke:\s|send:\s|\.send\(/)
    // The theme's three: one synchronous read of the state, one request, one listener on the push.
    expect(preload.match(/ipcRenderer\.sendSync\(/g)).toHaveLength(1)
    expect(preload.match(/ipcRenderer\.on\(/g)).toHaveLength(1)
    expect(preload.match(/ipcRenderer\.invoke\(/g)).toHaveLength(5)
    expect(preload).not.toMatch(/ipcRenderer\.(?:invoke|sendSync|on)\(\s*['"`]/)
    const channels = read('src/shared/channels.ts')
    for (const channel of [
      'welcome:recent',
      'welcome:choose',
      'welcome:open-recent',
      'welcome:open-dropped',
      'theme:state',
      'theme:changed',
      'theme:choose'
    ]) {
      expect(channels).toContain(`'${channel}'`)
      expect(preload, channel).not.toContain(channel)
    }
  })

  it('is the one place that asks a dropped file for its path', () => {
    expect(allSources.filter((path) => /getPathForFile/.test(code(path)))).toEqual([PRELOAD])
    expect(rendererSources.filter((path) => /\.path\b[^\n]*File|webkitRelativePath|FileReader|\.arrayBuffer\(|\.text\(\)/.test(code(path)))).toEqual([])
  })

  it('declares a bridge that no method of takes a path but the two it was handed', () => {
    const api = code('src/preload/welcome-api.d.ts')

    expect(api.match(/^ {2}\w+\(/gm)).toHaveLength(7)
    expect(api).toContain('chooseTheme(choice: ThemeChoice): Promise<void>')
    expect(api).toContain('openRecent(path: string)')
    expect(api).toContain('openDropped(files: readonly File[])')
    expect(api).not.toMatch(/invoke|send\(/)
  })
})

describe('the Welcome’s window and bridge', () => {
  it('is isolated, sandboxed and without node, with its own preload, and never navigates', () => {
    const window = code(WINDOW)

    expect(window).toMatch(/contextIsolation:\s*true/)
    expect(window).toMatch(/nodeIntegration:\s*false/)
    expect(window).toMatch(/sandbox:\s*true/)
    expect(window).toContain("'../preload/welcome.js'")
    expect(window).toMatch(/setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/)
    expect(window).toMatch(/'will-navigate',\s*\(event\) => event\.preventDefault\(\)/)
    expect(window).toMatch(/'will-redirect',\s*\(event\) => event\.preventDefault\(\)/)
    expect(window).toMatch(/width: WELCOME_WIDTH,\s*height: WELCOME_HEIGHT/)
    expect(window).toMatch(/WELCOME_WIDTH = 1080/)
    expect(window).toMatch(/WELCOME_HEIGHT = 720/)
  })

  it('loads the Welcome page and nothing else, by the dev server or by file', () => {
    const loads = code(WINDOW).match(/loadURL\(`[^`]*`\)/g) ?? []

    expect(loads).toHaveLength(1)
    expect(loads[0]).toContain('devServerUrl')
    expect(loads[0]).toContain('WELCOME_PAGE')
    expect(code(WINDOW)).toContain("WELCOME_PAGE = 'welcome.html'")
  })

  it('refuses every sender that is not the Welcome before it does anything, on every handler', () => {
    const bridge = code(BRIDGE)
    const handlers = bridge.split(/ipcMain\.handle\(/).slice(1)

    expect(handlers).toHaveLength(4)
    for (const handler of handlers) {
      const body = handler.slice(0, handler.indexOf('\n  )') > 0 ? handler.indexOf('\n  )') : handler.length)
      expect(body.indexOf('isWelcomeSender(event.sender.id)'), body.slice(0, 40)).toBeGreaterThan(-1)
      expect(body.indexOf('isWelcomeSender(event.sender.id)')).toBeLessThan(body.indexOf('openProject(') > -1 ? body.indexOf('openProject(') : body.length)
    }
  })

  it('opens a project through the one injected function, and only for a folder main has checked', () => {
    const bridge = code(BRIDGE)

    expect(bridge.match(/\bopenProject\(/g)).toHaveLength(3)
    expect(bridge.match(/folderAt\(/g)?.length).toBeGreaterThanOrEqual(4)
    expect(bridge).toContain('recent.read().some((entry) => entry.path === path)')
  })

  it('runs no resolver, `claude` or `uv`, and reads no project, for the Welcome or a recent row', () => {
    for (const path of [BRIDGE, WINDOW, 'src/main/fold/recent-projects.ts', 'src/main/sources/persistence/recent-file.ts']) {
      const text = code(path)

      expect(text, path).not.toMatch(/resolvers|run-command|watch-install|install-model|projections\/install|session-|spawn|execFile|child_process|readdir|readFile\(|readFileSync\([^)]*join\(project/)
      expect(text, path).not.toMatch(/\bclaude\b|\buv\b/)
    }
    // The only filesystem read of a project is a stat, and it is one function.
    expect(code(BRIDGE).match(/statSync\(/g)).toHaveLength(1)
  })

  it('opens no native dialog at launch: the chooser is the Welcome’s alone', () => {
    expect(code('src/main/index.ts')).not.toMatch(/showOpenDialog|chooseProjectDirectory|dialog\b/)
    expect(mainSources.filter((path) => /chooseProjectDirectory/.test(code(path))).sort()).toEqual([
      BRIDGE,
      'src/main/windows/choose-project.ts'
    ])
    expect(code('src/main/windows/choose-project.ts')).not.toMatch(/resolveProjectPath[^{]*chooseProjectDirectory\(\)/)
  })

  it('keeps no chooser fallback in the command-line path, and no `useArgument` state', () => {
    const choose = code('src/main/windows/choose-project.ts')
    const resolver = choose.slice(choose.indexOf('export function resolveProjectPath'))

    expect(resolver).not.toMatch(/chooseProjectDirectory|useArgument|showOpenDialog/)
    expect(code('src/main/index.ts')).not.toMatch(/useCommandLineArgument|useArgument/)
  })

  it('writes the recent list as a path and a time and nothing else, atomically, from userData', () => {
    const file = code('src/main/sources/persistence/recent-file.ts')

    expect(file).toContain("join(userDataDir, 'recent-projects.json')")
    expect(file).toMatch(/entries: entries\.map\(\(\{ path, openedAt \}\) => \(\{ path, openedAt \}\)\)/)
    expect(file).toMatch(/writeFileSync\(temporary,[\s\S]*renameSync\(temporary, filePath\)/)
    expect(code('src/main/fold/recent-projects.ts')).toMatch(/RECENT_LIMIT = 8/)
  })
})

describe('the negative surface, in source', () => {
  const copy = (path: string): string => {
    const text = code(path)
    return [
      ...text.matchAll(/>\s*([^<>{}]+?)\s*<\//g),
      ...text.matchAll(/'([^'\n]+)'/g),
      ...text.matchAll(/"([^"\n]+)"/g),
      ...text.matchAll(/`([^`\n]+)`/g)
    ]
      .map(([, text]) => text)
      .join('\n')
  }

  it('has no tour, wizard, checklist, get-started, welcome-back, try, recommended or what’s-new copy', () => {
    for (const path of pageSources) {
      expect(copy(path), path).not.toMatch(
        /get(?:ting)? started|welcome back|\btry\b|\btour\b|wizard|checklist|what['’]s new|recommended|start with|next step|learn more|\bhelp\b|\bversion\b|\bclear\b|\bremove\b|\bforget\b/i
      )
    }
  })

  it('has the theme line and nothing else of settings: no preferences, no other option, no theme anywhere but its own file and the page that mounts it', () => {
    const themed = pageSources.filter((path) => /\btheme\b/i.test(code(path))).sort()

    expect(themed).toEqual([APP, `${DIR}/theme-line.tsx`].sort())
    for (const path of pageSources) {
      expect(code(path), path).not.toMatch(/prefers|preferences|\bsettings?\b/i)
    }
  })

  it('has a theme line that recommends nothing, announces nothing and names no theme in a colour: three words, one group', () => {
    const line = code(`${DIR}/theme-line.tsx`)

    expect(line).not.toMatch(/recommend|\btry\b|announce|<LiveRegion|aria-live|title=|data-theme|dataset|setAttribute|matchMedia|prefers/i)
    expect(line).toContain('THEME_CHOICES')
    expect(line.match(/role="group"/g)).toHaveLength(1)
    expect(line.match(/<button/g)).toHaveLength(1)
  })

  it('has no sound, animation, timer, spinner, badge, count or link, in source or in style', () => {
    for (const path of pageSources) {
      expect(code(path), path).not.toMatch(
        /\bAudio\b|<audio|<video|requestAnimationFrame|\.animate\(|setInterval|setTimeout|spinner|skeleton|shimmer|<progress|<a[\s>]|href=|window\.open|openExternal/i
      )
    }
    expect(withoutComments(read(CSS))).not.toMatch(/badge|spinner|skeleton|shimmer|@keyframes/i)
  })

  it('renders no portrait above 44px and none dimmed: portraits are called at 44 only', () => {
    const calls = [...code(`${DIR}/lanes.tsx`).matchAll(/portrait\(artParamsFor\(persona\.id\), \d+, 'idle', persona\)/g)]

    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toMatch(/portrait\(artParamsFor\(persona\.id\), 44, 'idle', persona\)/)
    expect(withoutComments(read(CSS))).not.toMatch(/opacity: var\(--opacity-(?:idle|hover)\)/)
  })

  it('reads no persona from a project: the roster is a static table of five, not attributed to a persona', () => {
    const personas = code(`${DIR}/personas.ts`)

    expect([...personas.matchAll(/^\s+id: '([^']+)'/gm)].map(([, id]) => id)).toEqual([
      'bmad-agent-analyst',
      'bmad-agent-pm',
      'bmad-agent-ux-designer',
      'bmad-agent-architect',
      'bmad-agent-dev'
    ])
    expect(personas).not.toMatch(/window\.|fetch|import .* from '\.\.\/\.\.\/\.\.\/shared\/install'|AgentView/)
  })

  it('says each harness string in lower case, mono, and with no terminal punctuation', () => {
    const app = code(APP)

    for (const text of [
      'no project open',
      'a visual harness for bmad projects',
      'drop a project folder here',
      'open project folder…'
    ]) {
      expect(app, text).toContain(text)
      expect(text, text).toBe(text.toLowerCase())
      expect(text, text).not.toMatch(/[.!?:;,]$/)
    }
    expect(code(`${DIR}/recent-list.tsx`)).toContain('folder missing')
    expect(code(`${DIR}/drop.ts`)).toContain('`not a folder · ${name}`')
    // Mono for the harness's strings, sans for the personas’ descriptions alone.
    const css = withoutComments(read(CSS))
    for (const selector of ['.welcome-drop-hint', '.welcome-topbar-state', '.welcome-recent-path', '.welcome-recent-age', '.welcome-recent-missing', '.welcome-team-meta', '.welcome-label']) {
      expect(css.match(new RegExp(`${selector.replace('.', '\\.')} \\{[^}]*\\}`))?.[0], selector).toContain('font-family: var(--mono)')
    }
    expect(css.match(/\.welcome-card-description \{[^}]*\}/)?.[0]).toContain('font-family: var(--sans)')
  })
})

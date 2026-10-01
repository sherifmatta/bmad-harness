import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  guardedStylesheets,
  literalsIn,
  allMediaConditions,
  withoutComments
} from './literal-guard'

/**
 * Story 1.9's shell, asserted from the stylesheets and sources as text — the
 * repository has no DOM environment (NFR11's pinned set), so the pressed state,
 * the two breakpoints and the mounts are held where they are written.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

const SHELL_CSS = 'src/renderer/ui/shell/shell.css'
const PAGE_CSS = 'src/renderer/design/page.css'
const LIVE_CSS = 'src/renderer/ui/a11y/live-region.css'
const TOKENS_CSS = 'src/renderer/design/tokens.css'

const shellCss = withoutComments(read(SHELL_CSS))
const pageCss = withoutComments(read(PAGE_CSS))
const liveCss = withoutComments(read(LIVE_CSS))
const tokensCss = withoutComments(read(TOKENS_CSS))
const app = read('src/renderer/ui/app.tsx')

/** Source with block comments and whole-line `//` comments removed. */
const code = (path: string): string => withoutComments(read(path)).replace(/^\s*\/\/.*$/gm, '')

/** The declaration block of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string | null {
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(',').some((candidate) => candidate.trim() === selector)) {
      return body
    }
  }
  return null
}

/** The text inside the `@media` block whose condition contains `condition`. */
function mediaBlock(css: string, condition: string): string {
  const start = css.indexOf(`@media (${condition})`)
  expect(start, `@media (${condition}) must exist`).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let at = open; at < css.length; at += 1) {
    depth += css[at] === '{' ? 1 : css[at] === '}' ? -1 : 0
    if (depth === 0) {
      return css.slice(open + 1, at)
    }
  }
  throw new Error('unterminated @media block')
}

const declared = new Set([...tokensCss.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name))

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

describe('the view switch', () => {
  it('spends the raised ground, the strong text colour and the inset accent rule when pressed', () => {
    const body = ruleBody(shellCss, ".view-switch button[aria-pressed='true']")

    expect(body, 'the pressed rule must exist').not.toBeNull()
    expect(body).toContain('background: var(--raised)')
    expect(body).toContain('color: var(--text-strong)')
    expect(body).toContain('box-shadow: var(--inset-pressed)')
    expect(tokensCss).toMatch(/--inset-pressed\s*:\s*inset 0 -2px 0 var\(--accent\)/)
    expect(tokensCss).toMatch(/--raised\s*:\s*#242b34/)
  })

  it('is one rule, and hover comes before it so the pressed text is not overridden', () => {
    expect(shellCss.match(/aria-pressed/g)).toHaveLength(1)
    expect(shellCss.indexOf('button:hover')).toBeLessThan(shellCss.indexOf('aria-pressed'))
  })

  it('does not clip the group, or the shared ring is cut off at its edge', () => {
    expect(ruleBody(shellCss, '.view-switch')).not.toMatch(/overflow/)
    expect(ruleBody(shellCss, '.view-switch button:first-child')).toContain(
      'border-top-left-radius: var(--r)'
    )
    expect(ruleBody(shellCss, '.view-switch button:first-child')).toContain(
      'border-bottom-left-radius: var(--r)'
    )
    expect(ruleBody(shellCss, '.view-switch button:last-child')).toContain(
      'border-top-right-radius: var(--r)'
    )
    expect(ruleBody(shellCss, '.view-switch button:last-child')).toContain(
      'border-bottom-right-radius: var(--r)'
    )
  })

  it('styles no focus of its own', () => {
    expect(shellCss).not.toMatch(/focus/i)
    expect(shellCss).not.toMatch(/outline/i)
  })
})

describe('the shell stylesheet', () => {
  it('holds no stacking index, focus stroke, keyframes, animation or transition', () => {
    for (const forbidden of [/z-index/, /outline/, /@keyframes/, /animation/, /transition/]) {
      expect(read(SHELL_CSS), String(forbidden)).not.toMatch(forbidden)
      expect(read(LIVE_CSS), String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('names only tokens that tokens.css declares', () => {
    for (const [path, css] of [
      [SHELL_CSS, shellCss],
      [PAGE_CSS, pageCss],
      [LIVE_CSS, liveCss]
    ]) {
      const used = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name)
      expect(used.length, path).toBeGreaterThan(0)
      expect(used.filter((name) => !declared.has(name)), path).toEqual([])
    }
  })

  it('is governed by the literal guard, along with the page and the live region', () => {
    for (const path of [SHELL_CSS, PAGE_CSS, LIVE_CSS]) {
      expect(guardedStylesheets()).toContain(path)
      expect(literalsIn(path, read(path)), path).toEqual([])
    }
  })

  it('hides an inactive view with display: none, which .view alone would override', () => {
    expect(ruleBody(shellCss, '.view[hidden]')).toContain('display: none')
  })

  it('ellipsises a chip at its token maximum, so a long branch cannot push the switch off the bar', () => {
    const chip = ruleBody(shellCss, '.chip') ?? ''

    expect(chip).toContain('max-width: var(--chip-max)')
    expect(chip).toContain('overflow: hidden')
    expect(chip).toContain('text-overflow: ellipsis')
    expect(tokensCss).toMatch(/--chip-max\s*:/)
  })

  it('sizes the topbar, rail and head from the layout tokens', () => {
    expect(ruleBody(shellCss, '.topbar')).toMatch(/height: var\(--topbar\)/)
    expect(ruleBody(shellCss, '.topbar')).toMatch(/background: var\(--chrome\)/)
    expect(ruleBody(shellCss, '.topbar')).toMatch(/border-bottom: var\(--rule-width\) solid var\(--line\)/)
    expect(ruleBody(shellCss, '.rail')).toMatch(/flex: 0 0 var\(--rail\)/)
    expect(ruleBody(shellCss, '.rail')).toMatch(/border-left: var\(--rule-width\) solid var\(--line\)/)
    expect(ruleBody(shellCss, '.rail-half')).toMatch(/flex: 1 1 var\(--rail-half-basis\)/)
    expect(ruleBody(shellCss, '.rail-head')).toMatch(/height: var\(--rail-head\)/)
    expect(ruleBody(shellCss, '.thread')).toMatch(/max-width: var\(--thread-max\)/)
    expect(tokensCss).toMatch(/--rail-half-basis\s*:\s*50%/)
  })
})

describe('the two breakpoints', () => {
  it('are the only width conditions under src/renderer/', () => {
    expect(allMediaConditions().filter((entry) => entry.includes('width'))).toEqual([
      `${SHELL_CSS}: (max-width:1000px)`,
      `${SHELL_CSS}: (max-width:1180px)`
    ])
    // Every @media rule, not only width ones: the reduced-motion block is the
    // one known non-breakpoint, and a height or orientation query is a third.
    expect(allMediaConditions()).toHaveLength(3)
  })

  it('hide the party side panel at 1180 and touch nothing else', () => {
    const block = mediaBlock(shellCss, 'max-width: 1180px')

    expect(ruleBody(block, '.party-side')?.trim()).toBe('display: none;')
    expect(block.match(/\{/g)).toHaveLength(1)
  })

  it('stack the layout at 1000', () => {
    const block = mediaBlock(shellCss, 'max-width: 1000px')

    expect(ruleBody(block, 'body')).toMatch(/overflow: auto/)
    expect(ruleBody(block, '.app')).toMatch(/height: auto/)
    expect(ruleBody(block, '.app')).toMatch(/min-height: var\(--viewport-tall\)/)
    expect(ruleBody(block, '.view')).toMatch(/flex-direction: column/)
    expect(ruleBody(block, '.chat')).toMatch(/min-height: var\(--stack-chat-min\)/)
    expect(ruleBody(block, '.rail')).toMatch(/flex: 0 0 auto/)
    expect(ruleBody(block, '.rail')).toMatch(/width: auto/)
    expect(ruleBody(block, '.rail')).toMatch(/border-left: 0/)
    expect(ruleBody(block, '.rail')).toMatch(/border-top: var\(--rule-width\) solid var\(--line\)/)
    expect(ruleBody(block, '.rail-half')).toMatch(/min-height: var\(--stack-half-min\)/)
    expect(ruleBody(block, '.topbar')).toMatch(/flex-wrap: wrap/)
    expect(ruleBody(block, '.topbar')).toMatch(/height: auto/)
    expect(ruleBody(block, '.crumbs')).toMatch(/order: 3/)
    expect(ruleBody(block, '.crumbs')).toMatch(/width: var\(--stack-crumbs-width\)/)
    expect(tokensCss).toMatch(/--stack-chat-min\s*:\s*62vh/)
    expect(tokensCss).toMatch(/--stack-half-min\s*:\s*230px/)
  })

  it('leave the body unscrollable at full size', () => {
    expect(ruleBody(pageCss, 'body')).toMatch(/overflow: hidden/)
  })

  it('include no mobile rule', () => {
    expect(shellCss.match(/@media/g)).toHaveLength(2)
  })
})

describe('the scrollbars and the hidden wrapper', () => {
  it('are global in page.css, the thumb clipped behind a transparent inset', () => {
    expect(pageCss).toMatch(/::-webkit-scrollbar\s*\{[^}]*width: var\(--scrollbar-size\)/)
    const thumb = ruleBody(pageCss, '::-webkit-scrollbar-thumb') ?? ''

    expect(thumb).toContain('background-clip: content-box')
    expect(thumb).toContain('border: var(--scrollbar-inset) solid transparent')
    expect(thumb).toContain('border-radius: var(--radius-scrollbar)')
    expect(ruleBody(pageCss, '::-webkit-scrollbar-thumb:hover')).toContain('var(--scrollbar-thumb-hover)')
    expect(ruleBody(pageCss, '::-webkit-scrollbar-track')).toContain('background: transparent')
  })

  it('keep the live region in the tree: clipped, not display: none', () => {
    const body = ruleBody(liveCss, '.visually-hidden') ?? ''

    expect(body).toContain('position: absolute')
    expect(body).toContain('width: var(--hidden-size)')
    expect(body).toContain('height: var(--hidden-size)')
    expect(body).toContain('margin: var(--hidden-offset)')
    expect(body).toContain('overflow: hidden')
    expect(body).toContain('clip: rect(0 0 0 0)')
    expect(body).toContain('white-space: nowrap')
    expect(body).not.toMatch(/display|visibility/)
  })

  it('are applied by the component itself, not by its callers', () => {
    const region = read('src/renderer/ui/a11y/live-region.tsx')

    expect(region).toMatch(/^import '\.\/live-region\.css'$/m)
    expect(region).toContain('className="visually-hidden"')
    expect(app).not.toContain('visually-hidden')
  })
})

describe('the app mounts the shell', () => {
  it('mounts Shell, LiveRegion and the room gate', () => {
    expect(app).toContain('<Shell')
    expect(app).toContain('<LiveRegion')
    expect(app).toContain('roomState(')
    expect(app).toContain('new Announcer()')
  })

  it('mounts one live region per screen that renders anything, and none while pending', () => {
    const blocked = app.slice(app.indexOf("if (room === 'blocked')"))
    const pending = app.slice(app.indexOf("if (room === 'pending')"), app.indexOf("if (room === 'blocked')"))

    expect(pending).not.toContain('<LiveRegion')
    expect(blocked.match(/<LiveRegion/g)).toHaveLength(2)
    expect(app.match(/<LiveRegion/g)).toHaveLength(2)
  })

  it('keeps the turns and the composer under the shell only', () => {
    expect(app.indexOf('<Turns')).toBeGreaterThan(app.indexOf('<Shell'))
    expect(app.indexOf('<Composer')).toBeGreaterThan(app.indexOf('<Shell'))
    expect(app).not.toContain('PREVIEW_')
    expect(app).not.toContain('PREVIEW_NOTES')
    expect(app).not.toContain('snapshot.menus')
  })

  it('feeds the announcer message only, never detail', () => {
    const effect = app.slice(app.indexOf('newAnnouncements('), app.indexOf('[announcer, snapshot'))

    expect(effect).toContain('announcer.announce(message, performance.now())')
    expect(effect).not.toContain('detail')
  })
})

describe('the shell furniture stays within scope', () => {
  const sources = filesUnder('src/renderer/ui/shell').filter((path) => /\.(tsx?)$/.test(path))
  const shipped = sources.filter((path) => !/\.test\./.test(path))

  it('has no third view, Help, inline style, spinner or announcement of its own', () => {
    for (const path of shipped) {
      const text = code(path)
      expect(text, path).not.toMatch(/style=\{/)
      expect(text, path).not.toMatch(/aria-live/)
      expect(text, path).not.toMatch(/\bHelp\b/)
      expect(text, path).not.toMatch(/spinner|skeleton/i)
    }
  })

  it('renders only the view switch as controls', () => {
    const controls = shipped.flatMap((path) =>
      [...code(path).matchAll(/<button|<input|role=/g)].map(() => relative(ROOT, join(ROOT, path)))
    )

    expect(controls.sort()).toEqual([
      'src/renderer/ui/shell/view-switch.tsx',
      'src/renderer/ui/shell/view-switch.tsx'
    ])
  })

  it('draws the group heading once, for both rail halves to reuse', () => {
    const body = ruleBody(shellCss, '.rail-group') ?? ''

    expect(body).toContain('padding: var(--rail-group-padding)')
    expect(body).toContain('font-family: var(--mono)')
    expect(body).toContain('font-size: var(--fs-meta)')
    expect(body).toContain('letter-spacing: var(--track-micro)')
    expect(body).toContain('color: var(--meta)')
  })

  it('mounts the files in the Outputs half and keeps the party view an empty region', () => {
    const shell = code('src/renderer/ui/shell/shell.tsx')

    expect(shell).toMatch(/<RailHalf label="Outputs">\s*<ConnectedOutputs/)
    expect(shell).toMatch(/className="view view-party"[\s\S]*?\/>/)
  })

  it('names the two views once, in view.ts', () => {
    const views = read('src/renderer/ui/shell/view.ts')

    expect(views.match(/id: '/g)).toHaveLength(2)
    expect(views).toContain("'1:1 Conversation'")
    expect(views).toContain("'Party Mode'")
  })
})

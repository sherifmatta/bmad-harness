import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { tabStopId, tileMove } from '../src/renderer/ui/team/tile-nav'
import { guardedStylesheets, literalsIn, withoutComments } from './literal-guard'

/**
 * Story 1.10's team, status dot and chat header, asserted from the stylesheets
 * and sources as text — there is no DOM environment (NFR11's pinned set), so
 * the reveal, the ordering of the rules and the mounts are held where they are
 * written. What the tiles render is `persona-tile.test.tsx`'s and the
 * ordering's is `tile-groups.test.ts`'s.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

const TEAM_CSS = 'src/renderer/ui/team/team.css'
const DOT_CSS = 'src/renderer/ui/status/status-dot.css'
const HEAD_CSS = 'src/renderer/ui/chat/chat-header.css'
const SHEETS = [TEAM_CSS, DOT_CSS, HEAD_CSS]
const TOKENS_CSS = 'src/renderer/design/tokens.css'

const css = new Map(SHEETS.map((path) => [path, withoutComments(read(path))]))
const tokensCss = withoutComments(read(TOKENS_CSS))
const declared = new Set([...tokensCss.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name))

/** The declaration block of the first rule whose selector list is exactly `selectors`. */
function ruleBody(sheet: string, selectors: string[]): string | null {
  for (const [, list, body] of (css.get(sheet) ?? '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const parts = list.split(',').map((part) => part.trim())
    if (parts.length === selectors.length && selectors.every((s, i) => parts[i] === s)) {
      return body
    }
  }
  return null
}

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const DIRS = ['src/renderer/ui/team', 'src/renderer/ui/status', 'src/renderer/ui/chat']
const shipped = DIRS.flatMap(filesUnder).filter((path) => !/\.test\./.test(path))
const shippedSources = shipped.filter((path) => /\.tsx?$/.test(path))

/** Source with block comments and whole-line `//` comments removed. */
const code = (path: string): string => withoutComments(read(path)).replace(/^\s*\/\/.*$/gm, '')

describe('the new stylesheets', () => {
  it('are governed by the literal guard and name only tokens tokens.css declares', () => {
    for (const path of SHEETS) {
      expect(guardedStylesheets(), path).toContain(path)
      expect(literalsIn(path, read(path)), path).toEqual([])

      const used = [...(css.get(path) ?? '').matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name)
      expect(used.length, path).toBeGreaterThan(0)
      expect(used.filter((name) => !declared.has(name)), path).toEqual([])
    }
  })

  it('hold no stacking index, outline, keyframes, font shorthand or focus ring', () => {
    for (const path of SHEETS) {
      const text = css.get(path) ?? ''

      expect(text, path).not.toMatch(/z-index/)
      expect(text, path).not.toMatch(/outline/i)
      expect(text, path).not.toMatch(/@keyframes/)
      expect(text, path).not.toMatch(/(?<![-\w])font\s*:/)
      // `:focus` proper is never written; `:focus-visible` appears only in the
      // reveal's selector list, below, and draws nothing.
      expect(text, path).not.toMatch(/:focus(?!-visible)/)
    }
    expect(css.get(DOT_CSS)).not.toMatch(/:focus/)
    expect(css.get(HEAD_CSS)).not.toMatch(/:focus/)
  })

  it('spend a transition only on the menu hint, and an animation only on the work dot', () => {
    expect(css.get(DOT_CSS)).not.toMatch(/transition/)
    expect(css.get(HEAD_CSS)).not.toMatch(/transition/)
    expect(css.get(TEAM_CSS)?.match(/transition/g)).toHaveLength(1)
    expect(ruleBody(TEAM_CSS, ['.menu-hint'])).toContain(
      'transition: max-height var(--motion-reveal), opacity var(--motion-reveal)'
    )

    expect(css.get(TEAM_CSS)).not.toMatch(/animation/)
    expect(css.get(HEAD_CSS)).not.toMatch(/animation/)
    expect(css.get(DOT_CSS)?.match(/animation/g)).toHaveLength(1)
    expect(ruleBody(DOT_CSS, ['.status-dot--work'])).toContain('animation: var(--motion-pulse)')
  })

  it('carry no media query, so the two breakpoints stay two', () => {
    for (const path of SHEETS) {
      expect(css.get(path), path).not.toContain('@media')
    }
  })
})

describe('the status dot rules', () => {
  it('is a 6px circle on the faint ground by default', () => {
    const body = ruleBody(DOT_CSS, ['.status-dot']) ?? ''

    expect(body).toContain('width: var(--status-dot-size)')
    expect(body).toContain('height: var(--status-dot-size)')
    expect(body).toContain('border-radius: var(--radius-full)')
    expect(body).toContain('background: var(--faint)')
  })

  it('maps the five states over four colours', () => {
    expect(ruleBody(DOT_CSS, ['.status-dot--work'])).toContain('background: var(--amber)')
    expect(ruleBody(DOT_CSS, ['.status-dot--live'])).toContain('background: var(--green)')
    expect(ruleBody(DOT_CSS, ['.status-dot--note'])).toContain('background: var(--note)')
    expect(ruleBody(DOT_CSS, ['.status-dot--error'])).toContain('background: var(--red)')
  })

  it('haloes work and live only, and pulses work only', () => {
    const text = css.get(DOT_CSS) ?? ''

    expect(ruleBody(DOT_CSS, ['.status-dot--work'])).toContain('box-shadow: var(--shadow-halo-work)')
    expect(ruleBody(DOT_CSS, ['.status-dot--live'])).toContain('box-shadow: var(--shadow-halo-live)')
    expect(text.match(/box-shadow/g)).toHaveLength(2)
    expect(text.match(/animation/g)).toHaveLength(1)
  })

  it('never lets the note dot, or any dot, borrow the accent', () => {
    expect(css.get(DOT_CSS)).not.toContain('--accent')
  })
})

describe('the persona tile rules', () => {
  it('is 56px tall at least, transparent, and native-button reset', () => {
    const body = ruleBody(TEAM_CSS, ['.persona-tile']) ?? ''

    expect(body).toContain('min-height: var(--tile-height)')
    expect(body).toContain('background: transparent')
    expect(body).toContain('padding: var(--tile-padding)')
  })

  it('takes --panel-2 on hover and --tile-current with an accent bar when current, hover first', () => {
    const text = css.get(TEAM_CSS) ?? ''
    const hover = text.indexOf('.persona-tile:hover {')
    const current = text.indexOf(".persona-tile[aria-current='true'] {")

    expect(ruleBody(TEAM_CSS, ['.persona-tile:hover'])).toContain('background: var(--panel-2)')
    expect(ruleBody(TEAM_CSS, [".persona-tile[aria-current='true']"])).toContain(
      'background: var(--tile-current)'
    )
    expect(hover).toBeGreaterThan(-1)
    // A current tile keeps its ground under hover only if its rule comes later.
    expect(current).toBeGreaterThan(hover)

    const edge = ruleBody(TEAM_CSS, [".persona-tile[aria-current='true']::before"]) ?? ''
    expect(edge).toContain('width: var(--tile-edge-width)')
    expect(edge).toContain('background: var(--accent)')
    expect(edge).toContain('left: 0')
  })

  it('sets the name, title and state line in the type tiers the design fixes', () => {
    const name = ruleBody(TEAM_CSS, ['.tile-name']) ?? ''
    const title = ruleBody(TEAM_CSS, ['.tile-title']) ?? ''

    expect(name).toContain('font-size: var(--fs-name)')
    expect(name).toContain('font-weight: var(--weight-strong)')
    expect(name).toContain('color: var(--text-strong)')
    expect(title).toContain('font-size: var(--fs-ident)')
    expect(title).toContain('color: var(--dim)')
    expect(title).toContain('white-space: nowrap')
    expect(title).toContain('text-overflow: ellipsis')

    const line = ruleBody(DOT_CSS, ['.state-line']) ?? ''
    expect(line).toContain('font-family: var(--mono)')
    expect(line).toContain('font-size: var(--fs-label)')
    expect(line).toContain('color: var(--faint)')
  })

  it('ellipsises a long name on one line in the tile, letting it shrink before the title', () => {
    const ident = ruleBody(TEAM_CSS, ['.tile-ident']) ?? ''
    const name = ruleBody(TEAM_CSS, ['.tile-name']) ?? ''

    expect(ident).toContain('min-width: 0')
    expect(name).toContain('flex: 0 1 auto')
    expect(name).toContain('min-width: 0')
    expect(name).toContain('white-space: nowrap')
    expect(name).toContain('overflow: hidden')
    expect(name).toContain('text-overflow: ellipsis')
  })

  it('opts the tile into the inset ring, which the tile stylesheet never draws itself', () => {
    expect(code('src/renderer/ui/team/persona-tile.tsx')).toContain('className="persona-tile focus-inset"')
    expect(read('src/renderer/design/focus.css')).toContain('.focus-inset:focus-visible')
    expect(read(TEAM_CSS)).not.toMatch(/outline/i)
  })

  it('closes the menu hint and opens it on hover and keyboard focus from one selector list', () => {
    const closed = ruleBody(TEAM_CSS, ['.menu-hint']) ?? ''
    const opened = ruleBody(TEAM_CSS, [
      '.persona-tile:hover .menu-hint',
      '.persona-tile:focus-visible .menu-hint'
    ])

    expect(closed).toContain('max-height: 0')
    expect(closed).toContain('opacity: 0')
    expect(closed).toContain('overflow: hidden')
    expect(opened, 'the reveal must be one selector list naming hover and focus-visible').not.toBeNull()
    expect(opened).toContain('max-height: var(--tile-hint-max)')
    expect(opened).toContain('opacity: 1')
    // Never written apart: every :hover has its :focus-visible partner.
    const text = css.get(TEAM_CSS) ?? ''
    expect(text.match(/:focus-visible/g)).toHaveLength(1)
    expect(text.match(/:hover/g)).toHaveLength(2)
  })

  it('draws the code tags as mono chips on their own ground', () => {
    const body = ruleBody(TEAM_CSS, ['.code-tag']) ?? ''

    expect(body).toContain('font-family: var(--mono)')
    expect(body).toContain('font-size: var(--fs-micro)')
    expect(body).toContain('letter-spacing: var(--track-micro)')
    expect(body).toContain('color: var(--dim)')
    expect(body).toContain('border: var(--rule-width) solid var(--line)')
    expect(body).toContain('border-radius: var(--radius-chip)')
    expect(body).toContain('background: var(--code-tag-bg)')
  })
})

describe('the chat header rules', () => {
  it('sits on the chrome ground under a hairline, padded and spaced from tokens', () => {
    const body = ruleBody(HEAD_CSS, ['.chat-head']) ?? ''

    expect(body).toContain('background: var(--chrome)')
    expect(body).toContain('border-bottom: var(--rule-width) solid var(--line)')
    expect(body).toContain('padding: var(--chat-head-padding)')
    expect(body).toContain('gap: var(--space-xl)')
  })

  it('sets the name as the largest type in the shell and caps the sub-line at 72ch on one line', () => {
    const name = ruleBody(HEAD_CSS, ['.chat-head-name']) ?? ''
    const sub = ruleBody(HEAD_CSS, ['.chat-head-sub']) ?? ''

    expect(name).toContain('font-size: var(--fs-head)')
    expect(name).toContain('font-weight: var(--weight-strong)')
    expect(name).toContain('letter-spacing: var(--track-control)')
    expect(name).toContain('color: var(--text-strong)')
    expect(sub).toContain('max-width: var(--chat-sub-max)')
    expect(sub).toContain('white-space: nowrap')
    expect(sub).toContain('text-overflow: ellipsis')
    expect(sub).toContain('color: var(--faint)')
    expect(ruleBody(HEAD_CSS, ['.chat-head-state'])).toContain('margin-left: auto')

    // A long name or title ellipsises on one line rather than pushing the state out.
    expect(ruleBody(HEAD_CSS, ['.chat-head-line'])).toContain('min-width: 0')
    for (const selector of ['.chat-head-name', '.chat-head-title']) {
      const body = ruleBody(HEAD_CSS, [selector]) ?? ''

      expect(body, selector).toContain('min-width: 0')
      expect(body, selector).toContain('white-space: nowrap')
      expect(body, selector).toContain('overflow: hidden')
      expect(body, selector).toContain('text-overflow: ellipsis')
    }
    expect(tokensCss).toMatch(/--chat-sub-max\s*:\s*72ch/)
  })
})

describe('the promoted tokens', () => {
  const NAMES = [
    '--status-dot-size',
    '--tile-height',
    '--tile-padding',
    '--tile-current',
    '--tile-edge-width',
    '--tile-state-top',
    '--tile-hint-max',
    '--code-tag-bg',
    '--code-tag-padding',
    '--rail-group-padding',
    '--chat-head-padding',
    '--chat-head-sub-top'
  ]

  it('are all declared, once, in the second :root', () => {
    for (const name of NAMES) {
      expect(declared.has(name), name).toBe(true)
      expect(read(TOKENS_CSS).match(new RegExp(`${name}\\s*:`, 'g')), name).toHaveLength(1)
    }
  })

  it('leave the verbatim first block and the motion inventory untouched', () => {
    expect([...declared].filter((name) => name.startsWith('--motion-'))).toHaveLength(5)
    expect([...declared].filter((name) => name.startsWith('--z-'))).toHaveLength(2)
  })
})

describe('tile navigation', () => {
  it('moves down and up by one, clamped at both ends', () => {
    expect(tileMove('ArrowDown', 1, 4)).toBe(2)
    expect(tileMove('ArrowUp', 1, 4)).toBe(0)
    expect(tileMove('ArrowDown', 3, 4)).toBe(3)
    expect(tileMove('ArrowUp', 0, 4)).toBe(0)
  })

  it('leaves Enter, Space, Tab and the off-axis arrows to the browser', () => {
    for (const key of ['Enter', ' ', 'Tab', 'ArrowLeft', 'ArrowRight', 'Escape', 'Home', 'End', 'a']) {
      expect(tileMove(key, 1, 4), key).toBeNull()
    }
  })

  it('moves nowhere in an empty list', () => {
    expect(tileMove('ArrowDown', 0, 0)).toBeNull()
    expect(tileMove('ArrowUp', 0, 0)).toBeNull()
  })

  it('gives the tab stop to the moved-to tile, else the current, else the topmost', () => {
    const order = ['a', 'b', 'c']

    expect(tabStopId(order, 'c', 'a')).toBe('c')
    expect(tabStopId(order, null, 'b')).toBe('b')
    expect(tabStopId(order, null, null)).toBe('a')
    // An id the roster no longer holds falls through rather than orphaning the list.
    expect(tabStopId(order, 'gone', 'b')).toBe('b')
    expect(tabStopId(order, 'gone', 'also-gone')).toBe('a')
    expect(tabStopId([], 'a', 'a')).toBeNull()
  })
})

describe('the shell mounts the team', () => {
  const shell = code('src/renderer/ui/shell/shell.tsx')

  it('mounts Team in the Team half and the header above the scroll, keyed by agent id', () => {
    expect(shell).toContain('<Team')
    expect(shell).toContain('<ChatHeader key={current.id}')
    expect(shell.indexOf('<ChatHeader')).toBeLessThan(shell.indexOf('className="scroll"'))
    expect(shell).toMatch(/<RailHalf label="Team">\s*<Team/)
    expect(shell).toMatch(/<RailHalf label="Outputs" \/>/)
  })

  it('derives the current agent from the display order, so a roster change lands in one frame', () => {
    expect(shell).toContain('displayOrder(groupAgents(snapshot.agents))')
    expect(shell).toContain('currentAgent(ordered, currentId)')
    expect(shell).toContain('states = NO_STATES')
  })

  it('writes no per-agent state and branches on no agent id', () => {
    for (const path of [...shippedSources, 'src/renderer/ui/shell/shell.tsx']) {
      expect(code(path), path).not.toMatch(/bmad-agent-|states\.set\(|\.state\s*=/)
    }
  })
})

describe('the new sources stay within scope', () => {
  it('exist where the story put them', () => {
    for (const path of [
      'src/renderer/ui/status/persona-state.ts',
      'src/renderer/ui/status/status-dot.tsx',
      'src/renderer/ui/team/persona-tile.tsx',
      'src/renderer/ui/team/team.tsx',
      'src/renderer/ui/team/tile-groups.ts',
      'src/renderer/ui/team/tile-nav.ts',
      'src/renderer/ui/chat/chat-header.tsx'
    ]) {
      expect(shipped, path).toContain(path)
    }
  })

  it('name no arrow key, no live region, no inline style and no tooltip', () => {
    for (const path of shipped) {
      const text = code(path)

      expect(text, path).not.toMatch(/Arrow(?:Up|Down|Left|Right)/)
      expect(text, path).not.toMatch(/aria-live/)
      expect(text, path).not.toMatch(/style=|title=/)
      expect(text, path).not.toMatch(/spinner|skeleton/i)
    }
  })

  it('never use the icon field as a face, or a name or title as a key', () => {
    for (const path of shippedSources) {
      const text = code(path)

      expect(text, path).not.toMatch(/\.icon\b/)
      expect(text, path).not.toMatch(/key=\{[^}]*\.(?:name|title|icon)\b/)
    }
  })

  it('keeps every persona keyed and portraited by agent id', () => {
    expect(code('src/renderer/ui/team/persona-tile.tsx')).toContain('artParamsFor(agent.id)')
    expect(code('src/renderer/ui/chat/chat-header.tsx')).toContain('artParamsFor(agent.id)')
    expect(code('src/renderer/ui/team/team.tsx')).toContain('key={agent.id}')
  })

  it('never stops a key default other than an arrow move', () => {
    const team = code('src/renderer/ui/team/team.tsx')

    expect(team.match(/preventDefault/g)).toHaveLength(1)
    expect(team.indexOf('preventDefault')).toBeGreaterThan(team.indexOf('tileMove('))
    expect(code('src/renderer/ui/team/persona-tile.tsx')).not.toContain('preventDefault')
  })
})

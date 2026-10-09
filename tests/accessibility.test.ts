import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ANNOUNCE_INTERVAL_MS, Announcer } from '../src/renderer/ui/a11y/announcer'
import { rovingKey } from '../src/renderer/ui/a11y/roving-tabindex'
import type { RovingList } from '../src/renderer/ui/a11y/roving-tabindex'
// The NFR23 guard is imported rather than re-derived: a second copy of those
// regular expressions is a second definition of "literal", and the two would
// drift. It lives in a plain module, not in tokens.test.ts, because importing
// a test module would re-register its suites here and run them twice.
import { guardedStylesheets, literalsIn, withoutComments } from './literal-guard'

/**
 * The accessibility floor, asserted by command.
 *
 * Nothing in this story is mounted on a surface — the thirteen surfaces
 * UX-DR23 enumerates are each built in a later story. What ships here is the
 * shared implementation those stories reference, plus the sweeps that make
 * "defined once, reimplemented nowhere" a failing test rather than a sentence
 * in a document. Without the sweeps the first surface story can invent its own
 * ring, its own arrow handling and its own live region with every other check
 * still green, and by the thirteenth the floor is unretrofittable.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')
const FOCUS_CSS = 'src/renderer/design/focus.css'
const A11Y = 'src/renderer/ui/a11y/'
const ROVING = `${A11Y}roving-tabindex.ts`
const LIVE_REGION = `${A11Y}live-region.tsx`
// The splitter's key table (Story 5.5) is the one place outside a11y/ that names an arrow: `←` grows a
// panel and `→` shrinks it, which no list's travel is. The folder heading's arrows are a11y/fold-key.ts's.
const SPLITTER_KEYS = 'src/shared/layout.ts'
const ENTRY = join(ROOT, 'src/renderer/ui/main.tsx')

const focusCss = readFileSync(join(ROOT, FOCUS_CSS), 'utf8')

/** The shared block-comment stripper, plus the `//` lines TypeScript adds. */
function withoutAnyComments(source: string): string {
  return withoutComments(source).replace(/^\s*\/\/.*$/gm, '')
}

/** Every source file under `src/`, as repository-relative paths. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [relative(ROOT, path)]
  })
}

const sources = filesUnder(SRC)
const sourceText = new Map(sources.map((path) => [path, readFileSync(join(ROOT, path), 'utf8')]))

/** Which files match a pattern, so a failure names the file rather than a count. */
function sourcesMatching(pattern: RegExp): string[] {
  return sources.filter((path) => pattern.test(sourceText.get(path) ?? ''))
}

/**
 * Every occurrence of an attribute under `src/`, with its value. A value the
 * sweep cannot read as a literal is reported as the expression itself, wrapped
 * in braces, so `aria-live={urgency}` fails an equality below rather than
 * slipping past a quoted-only pattern and taking the count with it.
 */
function attributeValues(attribute: string): { path: string; value: string }[] {
  const pattern = new RegExp(
    `(?<![\\w-])${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\})`,
    'g'
  )
  return sources.flatMap((path) =>
    [...(sourceText.get(path) ?? '').matchAll(pattern)].map((match) => ({
      path,
      value: match[1] ?? match[2] ?? `{${match[3]}}`
    }))
  )
}

// ---------------------------------------------------------------------------
// Roving tabindex — every row of the spec's I/O matrix.
// ---------------------------------------------------------------------------

/** A four-item vertical list whose items take Enter and Space, unless overridden. */
function list(overrides: Partial<RovingList> = {}): RovingList {
  return { index: 1, count: 4, orientation: 'vertical', activateOn: ['Enter', ' '], ...overrides }
}

describe('the roving tabindex', () => {
  it('moves within a vertical list', () => {
    expect(rovingKey('ArrowDown', list({ index: 1 }))).toEqual({ kind: 'move', index: 2 })
    expect(rovingKey('ArrowUp', list({ index: 1 }))).toEqual({ kind: 'move', index: 0 })
  })

  it('clamps at both ends and never wraps', () => {
    // A wrap would move focus to the far end of a list the user may not be able
    // to see. Nothing in the intent asks for it, so the far end stays put.
    expect(rovingKey('ArrowDown', list({ index: 3 }))).toEqual({ kind: 'move', index: 3 })
    expect(rovingKey('ArrowUp', list({ index: 0 }))).toEqual({ kind: 'move', index: 0 })
  })

  it('leaves the off-axis arrows to the browser', () => {
    expect(rovingKey('ArrowLeft', list())).toEqual({ kind: 'ignore' })
    expect(rovingKey('ArrowRight', list())).toEqual({ kind: 'ignore' })
    expect(rovingKey('ArrowUp', list({ orientation: 'horizontal' }))).toEqual({ kind: 'ignore' })
    expect(rovingKey('ArrowDown', list({ orientation: 'horizontal' }))).toEqual({ kind: 'ignore' })
  })

  it('travels a horizontal list on the horizontal pair', () => {
    const row = list({ orientation: 'horizontal', index: 1 })

    expect(rovingKey('ArrowRight', row)).toEqual({ kind: 'move', index: 2 })
    expect(rovingKey('ArrowLeft', row)).toEqual({ kind: 'move', index: 0 })
  })

  it('activates on the keys the surface claims, and on no others', () => {
    // The asymmetry EXPERIENCE.md's keyboard table states outright: a rail row
    // opens its document on Enter only, where a tile or a skill button takes
    // Enter and Space alike. A shared constant here would erase it.
    expect(rovingKey('Enter', list())).toEqual({ kind: 'activate' })
    expect(rovingKey(' ', list())).toEqual({ kind: 'activate' })

    const railRow = list({ activateOn: ['Enter'] })
    expect(rovingKey('Enter', railRow)).toEqual({ kind: 'activate' })
    expect(rovingKey(' ', railRow)).toEqual({ kind: 'ignore' })
  })

  it('ignores every key on an empty list, without producing a negative index', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', ' ']) {
      expect(rovingKey(key, list({ index: 0, count: 0 })), key).toEqual({ kind: 'ignore' })
    }
  })

  it('ignores the keys it does not claim, Tab above all', () => {
    // Tab is the browser's by definition: the point of a roving tabindex is
    // that Tab leaves the list rather than walking it.
    for (const key of ['Tab', 'x', 'Escape', 'Home', 'End', 'PageDown']) {
      expect(rovingKey(key, list()), key).toEqual({ kind: 'ignore' })
    }
  })

  it('is the only thing under src/ that names an arrow key', () => {
    // Without this a surface can write its own `case 'ArrowDown':` and fork the
    // list behaviour — clamping, off-axis keys, the empty list — with every
    // other check still green. Arrows belong to a11y/ or to nobody.
    expect(
      sourcesMatching(/Arrow(?:Up|Down|Left|Right)/).filter((path) => !path.startsWith(A11Y) && path !== SPLITTER_KEYS)
    ).toEqual([])
    // And the reducer really is where they live, so the sweep is not vacuous.
    expect(sourcesMatching(/Arrow(?:Up|Down|Left|Right)/)).toContain(ROVING)
  })
})

// ---------------------------------------------------------------------------
// The announcement queue — every row of the spec's I/O matrix.
// ---------------------------------------------------------------------------

describe('the announcement queue', () => {
  it('throttles at the two-second interval the policy states', () => {
    expect(ANNOUNCE_INTERVAL_MS).toBe(2000)
  })

  it('speaks the first announcement at once: nothing preceded it', () => {
    const announcer = new Announcer()
    announcer.announce('run started', 0)

    expect(announcer.take(0)).toBe('run started')
  })

  it('queues what arrives inside an interval rather than dropping it', () => {
    const announcer = new Announcer()
    announcer.announce('run started', 0)
    announcer.announce('run finished', 500)

    expect(announcer.take(0)).toBe('run started')
    expect(announcer.take(500)).toBeNull()
    expect(announcer.pending).toBe(1)
    expect(announcer.take(2000)).toBe('run finished')
  })

  it('opens the next interval exactly at the boundary, not after it', () => {
    const announcer = new Announcer()
    announcer.announce('first', 0)
    announcer.announce('second', 0)

    expect(announcer.take(0)).toBe('first')
    expect(announcer.take(ANNOUNCE_INTERVAL_MS - 1)).toBeNull()
    expect(announcer.take(ANNOUNCE_INTERVAL_MS)).toBe('second')
  })

  it('reads in event order and never merges two into a count', () => {
    // "saved · saved" and "saved" are different facts about the run, so two
    // identical messages are two announcements.
    const announcer = new Announcer()
    announcer.announce('x', 0)
    announcer.announce('x', 10)
    announcer.announce('y', 20)

    expect(announcer.pending).toBe(3)
    expect(announcer.take(0)).toBe('x')
    expect(announcer.take(2000)).toBe('x')
    expect(announcer.take(4000)).toBe('y')
    expect(announcer.pending).toBe(0)
  })

  it('ignores an empty announcement instead of spending an interval on it', () => {
    const announcer = new Announcer()
    announcer.announce('', 0)

    expect(announcer.pending).toBe(0)
    expect(announcer.take(0)).toBeNull()
  })

  it('returns null when nothing is queued, however late it is asked', () => {
    expect(new Announcer().take(9999)).toBeNull()
  })

  it('does not accumulate a debt of skipped turns while the queue is quiet', () => {
    // The interval restarts when a message is taken, not when time passes, so a
    // long silence never releases a burst.
    const announcer = new Announcer()
    announcer.announce('first', 0)
    expect(announcer.take(100_000)).toBe('first')

    announcer.announce('second', 100_000)
    expect(announcer.take(100_500)).toBeNull()
    expect(announcer.take(102_000)).toBe('second')
  })
})

// ---------------------------------------------------------------------------
// The focus ring, defined once.
// ---------------------------------------------------------------------------

/** A stylesheet as `[selector, declarations]` pairs, comments already stripped. */
function rulesIn(css: string): { selector: string; declarations: string[] }[] {
  return [...withoutAnyComments(css).matchAll(/([^{}]+)\{([^}]*)\}/g)].map(
    ([, selector, body]) => ({
      selector: selector.trim(),
      declarations: body
        .split(';')
        .map((declaration) => declaration.trim())
        .filter((declaration) => declaration !== '')
    })
  )
}

describe('the focus ring', () => {
  const structural = withoutAnyComments(focusCss)
  const rules = rulesIn(focusCss)

  it('is four rules: one global :focus-visible, the composer field’s exemption, the stacked offset and the inset offset', () => {
    // Pinned as a list rather than probed for a substring. Narrowing the base
    // selector to `button:focus-visible` still matches /:focus-visible/ while
    // leaving twelve of UX-DR23's thirteen surfaces with no ring at all, and
    // the globalness is half of what makes one rule enough for all of them.
    expect(rules.map(({ selector }) => selector)).toEqual([
      ':focus-visible',
      '.composer-input:focus-visible',
      '.focus-stacked:focus-visible',
      '.focus-inset:focus-visible'
    ])
  })

  it('is the ring and its offset, exactly, reached entirely through var()', () => {
    // Both declarations by name: deleting the offset draws the ring on the
    // element's own edge instead of 2px outside it, which is the geometry
    // DESIGN.md states twice and the one thing a substring check misses.
    expect(rules, 'focus.css must hold exactly the four rules above').toHaveLength(4)
    expect(rules[0].declarations).toEqual([
      'outline: var(--focus-ring-width) solid var(--accent)',
      'outline-offset: var(--focus-ring-offset)'
    ])
  })

  it('exempts the composer’s textarea and nothing else: the one place the ring is off, by the user’s decision', () => {
    // The field you type into draws no ring and no border change. The rule is the whole
    // exemption: one selector, one declaration, and the send button beside it is not named.
    expect(rules[1].declarations).toEqual(['outline: none'])
    expect(rules[1].selector).not.toMatch(/send|button/)
  })

  it('offsets the stacked case and changes nothing else about the ring', () => {
    expect(rules, 'focus.css must hold exactly the four rules above').toHaveLength(4)
    expect(rules[2].declarations).toEqual(['outline-offset: var(--focus-ring-offset-stacked)'])
  })

  it('offsets the inset case just inside the edge and changes nothing else about the ring', () => {
    expect(rules[3].declarations).toEqual(['outline-offset: var(--focus-ring-offset-inset)'])
  })

  it('is clean under the NFR23 literal guard, which governs it', () => {
    // The guard is what makes "no component reimplements the ring" mechanical:
    // the ring can only be written through var(), because a literal here is a
    // defect like any other literal.
    expect(guardedStylesheets()).toContain(FOCUS_CSS)
    expect(literalsIn(FOCUS_CSS, focusCss)).toEqual([])
  })

  it('draws on :focus-visible only, so a mouse press never draws it', () => {
    expect(structural).toMatch(/:focus-visible/)
    expect(structural.match(/:focus(?!-visible)/g)).toBeNull()
  })

  it('is the whole treatment: no fill, colour, shadow, transition or motion', () => {
    for (const property of [
      /background/,
      /(?<![-\w])color\s*:/,
      /box-shadow/,
      /\bfill\s*:/,
      /transition/,
      /animation/,
      /transform/,
      /\bborder\b/,
      /opacity/
    ]) {
      expect(structural, String(property)).not.toMatch(property)
    }
  })

  it('is the only file under src/ that mentions outline at all', () => {
    // Every source file, not only the stylesheets: an inline
    // `style={{ outline: '2px solid red' }}` in a .tsx or an outline in
    // index.html is exactly the reimplementation the story forbids, and a
    // stylesheet-only sweep never looks there.
    expect(sourcesMatching(/outline/i)).toEqual([FOCUS_CSS])
  })

  it('is never switched off anywhere under src/, in any spelling, but on the composer’s textarea in focus.css', () => {
    // The mockup shipped `outline:none` on the composer, replaced by nothing at all, and
    // this file once forbade it everywhere. The user has since asked for exactly that one
    // field to draw no ring, so the one rule in focus.css that does it is taken out before
    // the sweep reads, and the sweep still finds it anywhere else, in any spelling: the
    // longhands, a zero with or without a unit, the quoted and camelCase JSX forms.
    const OFF =
      /\boutline(?:-?(?:style|width|color))?\s*[:=]\s*\{?\s*['"]?\s*(?:none|0(?:px|rem|em|%)?)\b/i
    const COMPOSER_EXEMPTION = /\.composer-input:focus-visible\s*\{\s*outline:\s*none;\s*\}/

    expect(sources.filter((path) => OFF.test((sourceText.get(path) ?? '').replace(COMPOSER_EXEMPTION, '')))).toEqual([])
    expect(sourcesMatching(COMPOSER_EXEMPTION)).toEqual([FOCUS_CSS])
    // The pattern is checked against the spellings it claims to catch, so a
    // rule that has stopped matching cannot pass by matching nothing.
    for (const spelling of [
      'outline: none',
      'outline:0',
      'outline: 0px',
      "outline: 'none'",
      'outline-style: none',
      'outline-width: 0',
      "outlineStyle: 'none'",
      'outlineWidth: 0',
      'style={{ outline: 0 }}'
    ]) {
      expect(OFF.test(spelling), spelling).toBe(true)
    }
    // And not against the ring itself.
    for (const kept of [
      'outline: var(--focus-ring-width) solid var(--accent)',
      'outline-offset: var(--focus-ring-offset)'
    ]) {
      expect(OFF.test(kept), kept).toBe(false)
    }
  })

  it('ships rather than merely existing: the renderer entry loads it', () => {
    const entry = readFileSync(ENTRY, 'utf8')

    expect(entry).toMatch(/^import '\.\.\/design\/focus\.css'$/m)
    // Tokens first, or the var()s in the rule resolve to nothing.
    expect(entry.indexOf("import '../design/tokens.css'")).toBeLessThan(
      entry.indexOf("import '../design/focus.css'")
    )
  })
})

// ---------------------------------------------------------------------------
// Exactly one polite live region.
// ---------------------------------------------------------------------------

describe('the live region', () => {
  it('exists exactly once in the whole product, and is polite', () => {
    // Counted by the bare attribute name first, so a spelling the value
    // pattern below cannot read is still seen: a second region written as
    // `aria-live={urgency}` would otherwise be invisible to both checks at
    // once, leaving "exactly one" green while two regions compete.
    expect(sourcesMatching(/aria-live/)).toEqual([LIVE_REGION])
    expect(
      (sourceText.get(LIVE_REGION) ?? '').match(/aria-live/g),
      'one region, one attribute'
    ).toHaveLength(1)
    expect(attributeValues('aria-live')).toEqual([{ path: LIVE_REGION, value: 'polite' }])
  })

  it('reads the part that changed, and announces a repeat as its own event', () => {
    const source = sourceText.get(LIVE_REGION) ?? ''

    expect(source).toMatch(/aria-atomic\s*=\s*['"]false['"]/)
    // React bails out of re-rendering equal state, so an unchanged DOM is a
    // polite region saying nothing. The keyed node is what makes the second of
    // two identical messages a mutation, and so an announcement.
    expect(source).toMatch(/key=\{[^}]*\}/)
  })

  it('never interrupts what the user is reading', () => {
    // Nothing here is urgent enough for either spelling, and both are cheap to
    // add by reflex once a surface wants to be noticed. A computed value is
    // reported as its own expression, so it fails rather than passing unseen.
    expect(attributeValues('aria-live').filter(({ value }) => value !== 'polite')).toEqual([])
    expect(
      attributeValues('role').filter(
        ({ value }) => value.startsWith('{') || /^alert/i.test(value)
      )
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The shell's stylesheets sit inside the whole-tree sweeps (Story 1.9).
// ---------------------------------------------------------------------------

describe('the shell stylesheets', () => {
  const SHELL_CSS = 'src/renderer/ui/shell/shell.css'
  const LIVE_REGION_CSS = `${A11Y}live-region.css`

  it('are governed by the literal guard and swept by the focus-stroke and arrow-key sweeps', () => {
    for (const path of [SHELL_CSS, LIVE_REGION_CSS]) {
      // Asserted rather than assumed: a stylesheet outside these lists would
      // pass every sweep above by never being looked at.
      expect(guardedStylesheets(), path).toContain(path)
      expect(sources, path).toContain(path)
      expect(literalsIn(path, sourceText.get(path) ?? ''), path).toEqual([])
      expect(sourceText.get(path) ?? '', path).not.toMatch(/outline/i)
    }
  })

  it('leave the view switch to the shared ring: one button rule, no focus rule', () => {
    expect(withoutAnyComments(sourceText.get(SHELL_CSS) ?? '')).not.toMatch(/:focus/)
  })

  it('leave the end-session control to the shared ring and the native button: no tabindex, no key handler, no live region of its own', () => {
    const control = withoutAnyComments(sourceText.get('src/renderer/ui/shell/end-session.tsx') ?? '')

    expect(control).toMatch(/<button type="button"/)
    expect(control).not.toMatch(/tabIndex|onKeyDown|onKeyUp|aria-live|role=/)
    expect(withoutAnyComments(sourceText.get(SHELL_CSS) ?? '')).toContain('.end-session {')
  })

  it('mount the live region once per window, hidden by the component and not by its caller', () => {
    // Three windows, three pages, one region each: the project window's (app.tsx),
    // the document window's own (Story 1.12) and the Welcome's (Story 5.1), which
    // share no file with it.
    expect(sourcesMatching(/<LiveRegion/)).toEqual([
      'src/renderer/ui/app.tsx',
      'src/renderer/ui/doc/doc-app.tsx',
      'src/renderer/ui/welcome/welcome-app.tsx'
    ])
    expect(sourceText.get(LIVE_REGION) ?? '').toContain('className="visually-hidden"')
  })
})

// ---------------------------------------------------------------------------
// The team's stylesheets and sources sit inside the whole-tree sweeps (Story 1.10).
// ---------------------------------------------------------------------------

describe('the team, status and chat stylesheets', () => {
  const NEW_CSS = [
    'src/renderer/ui/team/team.css',
    'src/renderer/ui/status/status-dot.css',
    'src/renderer/ui/chat/chat-header.css'
  ]

  it('are governed by the literal guard and swept by the focus-stroke sweep', () => {
    for (const path of NEW_CSS) {
      // Asserted rather than assumed: a stylesheet outside these lists would
      // pass every sweep above by never being looked at.
      expect(guardedStylesheets(), path).toContain(path)
      expect(sources, path).toContain(path)
      expect(literalsIn(path, sourceText.get(path) ?? ''), path).toEqual([])
      expect(sourceText.get(path) ?? '', path).not.toMatch(/outline/i)
    }
  })

  it('open the menu hint on :hover and :focus-visible together, and draw no ring of their own', () => {
    const team = withoutAnyComments(sourceText.get(NEW_CSS[0]) ?? '')

    expect(team).toMatch(
      /\.persona-tile:hover \.menu-hint,\s*\n\s*\.persona-tile:focus-visible \.menu-hint\s*\{/
    )
    expect(team.match(/:focus(?!-visible)/g)).toBeNull()
    for (const path of NEW_CSS.slice(1)) {
      expect(withoutAnyComments(sourceText.get(path) ?? '')).not.toMatch(/:focus/)
    }
  })

  it('leave the arrows to a11y/: the team names none and lists are one tab stop through rovingKey', () => {
    const nav = sourceText.get('src/renderer/ui/team/tile-nav.ts') ?? ''

    expect(nav).toContain('rovingKey(')
    expect(sourcesMatching(/Arrow(?:Up|Down|Left|Right)/).filter((path) => !path.startsWith(A11Y) && path !== SPLITTER_KEYS)).toEqual([])
  })

  it('never add a second live region', () => {
    expect(sourcesMatching(/aria-live/)).toEqual([LIVE_REGION])
  })
})

// ---------------------------------------------------------------------------
// The decision block's options are native buttons: a tab stop each (Story 2.10).
// ---------------------------------------------------------------------------

describe('the decision block', () => {
  const BLOCK = 'src/renderer/ui/chat/decision-block.tsx'
  const BLOCK_CSS = 'src/renderer/ui/chat/decision-block.css'

  it('makes each option a native button, so each is a tab stop and Enter or Space activates it with no key code', () => {
    const block = withoutAnyComments(sourceText.get(BLOCK) ?? '')

    expect(block).toMatch(/<button\s+key=\{index\}\s+type="button"\s+className="decision-option"\s+onClick=/)
    expect(block).not.toMatch(/tabIndex|onKey|role="button"|aria-disabled|aria-pressed|aria-selected/)
    expect(sourcesMatching(/tabIndex=\{?-?\d/).filter((path) => path === BLOCK)).toEqual([])
  })

  it('is a group named by its title, adds no live region, and leaves the ring to the shared one', () => {
    const block = withoutAnyComments(sourceText.get(BLOCK) ?? '')

    expect(block).toContain('role="group"')
    expect(block).toContain('aria-labelledby={titleId}')
    expect(block).not.toMatch(/aria-live|role="(?:status|alert|log)"/)
    expect(sourcesMatching(/aria-live/)).toEqual([LIVE_REGION])
    expect(sourceText.get(BLOCK_CSS) ?? '').not.toMatch(/outline|:focus/i)
  })
})

// ---------------------------------------------------------------------------
// The orphan header's close control is a native button: one tab stop (Story 2.11).
// ---------------------------------------------------------------------------

describe('the orphan header', () => {
  const HEADER = 'src/renderer/ui/chat/orphan-header.tsx'
  const HEADER_CSS = 'src/renderer/ui/chat/orphan-header.css'

  it('makes its close control a native button, so it is a tab stop and Enter or Space activates it with no key code', () => {
    const header = withoutAnyComments(sourceText.get(HEADER) ?? '')

    expect(header).toMatch(/<button\s+type="button"\s+className="orphan-close"/)
    expect(header).toMatch(/aria-label=\{`close session · \$\{agent\.name\}`\}/)
    expect(header).not.toMatch(/tabIndex|onKey|role="button"|aria-disabled|aria-pressed|aria-selected/)
    expect([...header.matchAll(/<button\b/g)]).toHaveLength(1)
  })

  it('is governed by the literal guard and swept by the focus-stroke sweep, and leaves the ring to the shared one', () => {
    expect(guardedStylesheets()).toContain(HEADER_CSS)
    expect(sources).toContain(HEADER_CSS)
    expect(literalsIn(HEADER_CSS, sourceText.get(HEADER_CSS) ?? '')).toEqual([])
    expect(sourceText.get(HEADER_CSS) ?? '').not.toMatch(/outline|:focus/i)
  })

  it('adds no live region: there is still exactly one in the shipping tree', () => {
    expect(sourcesMatching(/aria-live/)).toEqual([LIVE_REGION])
    expect(withoutAnyComments(sourceText.get(HEADER) ?? '')).not.toMatch(/aria-live|role="(?:status|alert|log)"/)
  })
})

describe('a run, heard through the one live region (Story 3.1)', () => {
  const read = (path: string): string => withoutComments(readFileSync(join(ROOT, path), 'utf8'))
  const CARD = 'src/renderer/ui/chat/run-card.tsx'
  const CONVERSATION = 'src/renderer/ui/chat/use-conversation.ts'

  it('is announced by the window’s one announcer, from the run’s lifecycle events alone', () => {
    const app = read('src/renderer/ui/app.tsx')
    const conversation = read(CONVERSATION)
    expect(app).toMatch(/announceLifecycle = useCallback\(\s*\(line: string\) => announcer\.announce\(line, performance\.now\(\)\)/)
    expect(app).toContain('useConversation(snapshot?.agents ?? NO_AGENTS, announceHandoff, announceLifecycle)')
    // Only the four lifecycle events reach it; a note, a commit and prose never do.
    const gate = conversation.slice(conversation.indexOf('function announceLifecycle'))
    const body = gate.slice(0, gate.indexOf('\n  }\n'))
    expect([...body.matchAll(/event\.name !== '([a-z:]+)'/g)].map(([, name]) => name)).toEqual([
      'run:started',
      'run:finished',
      'run:stopped',
      'run:failed'
    ])
  })

  it('never announces prose: neither the card nor the prose store reaches an announcer or a live region', () => {
    for (const path of [CARD, 'src/renderer/ui/chat/prose-store.ts']) {
      expect(read(path), path).not.toMatch(/announce|aria-live|role="(?:status|alert|log)"/)
    }
    // The prose bypasses the fold before any lifecycle check runs.
    const conversation = read(CONVERSATION)
    const bypass = conversation.indexOf("if (event.name === 'doc:prose')")
    expect(bypass).toBeGreaterThan(-1)
    expect(bypass).toBeLessThan(conversation.indexOf('announceLifecycle(event)'))
  })

  it('marks the card busy while its run is in flight, and moves no focus but once, on a card drawn from a line', () => {
    const card = read(CARD)
    expect(card).toContain('aria-busy={running ? true : undefined}')
    expect(card).not.toMatch(/autoFocus/)
    // Story 3.5: the one `.focus(` is the expansion effect's, and the one tabindex is its target's, never a tab stop.
    expect(card.match(/\.focus\(/g)).toHaveLength(1)
    expect([...card.matchAll(/tabIndex=\{[^}]*\}/g)].map(([hit]) => hit)).toEqual(['tabIndex={focusFirst ? -1 : undefined}'])
    const effect = card.slice(card.indexOf('useLayoutEffect(() => {\n    if (focusFirst'))
    expect(effect.slice(0, effect.indexOf('}, [focusFirst')).match(/\.focus\(/g)).toHaveLength(1)
  })
})

describe('the collapsed run card, reached and heard (Story 3.5)', () => {
  const read = (path: string): string => withoutAnyComments(readFileSync(join(ROOT, path), 'utf8'))
  const LINE = 'src/renderer/ui/chat/run-card-line.tsx'
  const CHAT = 'src/renderer/ui/chat/'

  it('is one expanding native button and the stop beside it: no key handler, role or tab index of its own, expanded=false, and busy', () => {
    const line = read(LINE)
    expect(line.match(/<button\b/g)).toHaveLength(1)
    expect(line).toContain('<button type="button" className="run-card-line-button" aria-expanded={false} onClick={() => onExpand(runId)}>')
    expect(line).not.toMatch(/onKey|\.key\b|role=|tabIndex|autoFocus|\.focus\(/)
    expect(line).toContain('<section className="run-card-line" aria-busy>')
    // The stop is a sibling after the button (a button inside a button is invalid), its own tab stop, named for the persona.
    expect(line.match(/<RunStop\b/g)).toHaveLength(1)
    expect(line.indexOf('<RunStop')).toBeGreaterThan(line.indexOf('</button>'))
    expect(line).toContain('label={name}')
  })

  it('moves focus in exactly one place of its own: the expansion effect of the card the line becomes', () => {
    const sources = readdirSync(join(ROOT, CHAT)).filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
    const focusing = sources.filter((name) => /\.focus\(/.test(read(`${CHAT}${name}`)))
    // The composer's own focus is Story 2.3's; the card's is this story's, and nothing else in chat/ takes any.
    expect(focusing).toEqual(['composer.tsx', 'run-card.tsx'])
    expect(read(`${CHAT}run-card.tsx`).match(/\.focus\(/g)).toHaveLength(1)
    expect(read('src/renderer/ui/app.tsx')).not.toMatch(/\.focus\(|autoFocus|tabIndex/)
  })

  it('adds no live region, announcement or role: the window’s one lifecycle line is unchanged', () => {
    for (const path of [LINE, 'src/renderer/ui/chat/transcript.tsx']) {
      expect(read(path), path).not.toMatch(/announce|aria-live|role=/)
    }
  })

  it('names the elapsed time through the card’s own ticking counter, which no setting stops', () => {
    const line = read(LINE)
    expect(line).toContain('<RunElapsed entry={entry} />')
    expect(line).not.toMatch(/matchMedia|prefers-reduced-motion/)
  })
})

describe('the stop control, reached and heard (Story 3.7)', () => {
  const read = (path: string): string => withoutAnyComments(readFileSync(join(ROOT, path), 'utf8'))
  const STOP = 'src/renderer/ui/chat/run-stop.tsx'
  const STOP_CSS = 'src/renderer/ui/chat/run-stop.css'

  it('is one native button of type button, never disabled, with no role, tab index or key handler of its own', () => {
    const stop = read(STOP)
    expect(stop.match(/<button\b/g)).toHaveLength(1)
    expect(stop).toContain('type="button"')
    expect(stop).not.toMatch(/\bdisabled\b|aria-disabled|role=|tabIndex|onKey|\.key\b|autoFocus|\.focus\(/)
  })

  it('announces nothing and takes no focus, drawn or removed: the lifecycle line already says the run ended', () => {
    expect(read(STOP)).not.toMatch(/announce|aria-live|aria-atomic|aria-busy|useEffect|useLayoutEffect|useRef|\.focus\(/)
    // The two places that move focus in chat/ are as they were; the stop is not a third.
    const sources = readdirSync(join(ROOT, 'src/renderer/ui/chat')).filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
    expect(sources.filter((name) => /\.focus\(/.test(read(`src/renderer/ui/chat/${name}`)))).toEqual(['composer.tsx', 'run-card.tsx'])
  })

  it('is named `stop`, and `stop · <label>` when it is told whose stop it is', () => {
    expect(read(STOP)).toContain('`stop · ${label}`')
    expect(read('src/renderer/ui/chat/run-card.tsx')).toContain("label={path === '' ? undefined : path}")
  })

  it('draws no focus treatment of its own: the shared ring is the one', () => {
    const css = withoutAnyComments(readFileSync(join(ROOT, STOP_CSS), 'utf8'))
    expect(css).not.toMatch(/:focus|outline|box-shadow/)
  })
})

describe('the pinned running card, heard and reached (Story 3.14)', () => {
  const read = (path: string): string => withoutAnyComments(readFileSync(join(ROOT, path), 'utf8'))
  const SHELL = 'src/renderer/ui/shell/shell.tsx'
  const SHELL_CSS = 'src/renderer/ui/shell/shell.css'

  it('puts the slot first in the chat column in source, so DOM and tab order agree', () => {
    const shell = read(SHELL)
    const chat = shell.slice(shell.indexOf('<div className="chat">'))
    const slot = chat.indexOf('className="pinned"')
    expect(slot).toBeGreaterThan(-1)
    expect(slot).toBeLessThan(chat.indexOf('orphans.map'))
    expect(slot).toBeLessThan(chat.indexOf('<ChatHeader'))
    expect(slot).toBeLessThan(chat.indexOf('className="scroll"'))
  })

  it('takes no focus and is no live region: the slot holds no tab stop, role or announcement', () => {
    const shell = read(SHELL)
    expect(shell).not.toMatch(/\.focus\(|autoFocus|tabIndex|aria-live|role=|announce/)
    const app = read('src/renderer/ui/app.tsx')
    const pinned = app.slice(app.indexOf('pinned={'), app.indexOf('composer={'))
    expect(pinned).toContain('<RunCard')
    expect(pinned).not.toMatch(/\.focus\(|autoFocus|tabIndex|aria-live|role=|announce/)
  })

  it('is no position or motion rule, so reduced motion changes nothing but position', () => {
    const css = read(SHELL_CSS)
    const rule = css.slice(css.indexOf('.pinned {'), css.indexOf('}', css.indexOf('.pinned {')))
    expect(rule).toContain('padding: var(--pinned-padding)')
    expect(rule).not.toMatch(/position|animation|transition|z-index|scroll|overflow|transform|opacity|(?<![\w-])order\s*:/)
  })
})

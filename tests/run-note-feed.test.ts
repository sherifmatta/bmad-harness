import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { emphasisSpans } from '../src/renderer/ui/feed/emphasis'
import { kindTreatment } from '../src/renderer/ui/feed/kind-treatment'
import { parseMemlog } from '../src/renderer/ui/feed/memlog'
import type { RunNote } from '../src/renderer/ui/feed/memlog'
// The NFR23 guard is imported rather than re-derived, for the same reason
// tests/accessibility.test.ts imports it: a second copy of those regular
// expressions is a second definition of "literal", and the two would drift.
import { guardedStylesheets, literalsIn, withoutComments } from './literal-guard'

/**
 * The run-note feed's three pure modules, asserted twice over: against the
 * spec's I/O matrix, which is where the format's edges are written down, and
 * against the real memlogs on disk, which is where they actually occur.
 *
 * The corpus half is not decoration. The format has no schema and no
 * validator — it is whatever `_bmad/scripts/memlog.py` last wrote — so a
 * fixture proves only that the parser agrees with the fixture's author. Every
 * entry of every memlog in the repository is parsed here, and the counts are
 * derived from the files rather than transcribed, so a memlog that gains an
 * entry cannot quietly fall out of the sweep.
 *
 * The rendered markup is asserted in `src/renderer/ui/feed/run-note-feed.test.tsx`
 * instead of here: `tests/` is typechecked by `tsconfig.node.json`, which sets
 * no `jsx`, so no test in this directory may import a `.tsx`. What remains
 * here for the component is the pair of invariants that must survive any
 * rewrite of it — the stylesheet spends only tokens, and no project content
 * ever becomes HTML.
 */

const ROOT = resolve(import.meta.dirname, '..')
const BMAD = join(ROOT, '_bmad')
const UX_MEMLOG = '_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/.memlog.md'
const BRAINSTORM_MEMLOG = '_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/.memlog.md'
const FEED = 'src/renderer/ui/feed'
const RUN_NOTE_CSS = `${FEED}/run-note.css`
const RUN_NOTE_FEED = `${FEED}/run-note-feed.tsx`
const APP = 'src/renderer/ui/app.tsx'
const ENTRY = 'src/renderer/ui/main.tsx'
const TOKENS_CSS = 'src/renderer/design/tokens.css'
const PAGE_CSS = 'src/renderer/design/page.css'

/** Every `.memlog.md` in the project, found rather than listed. */
function memlogsUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return memlogsUnder(path)
    }
    return entry.name === '.memlog.md' ? [relative(ROOT, path)] : []
  })
}

const corpus = memlogsUnder(BMAD).sort()
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

/** The writer's own definition of an entry: a body line beginning dash-space. */
function entryLines(text: string): string[] {
  return text.split('\n').filter((line) => line.startsWith('- '))
}

const uxNotes = parseMemlog(read(UX_MEMLOG))
const allNotes: RunNote[] = corpus.flatMap((path) => parseMemlog(read(path)))

// ---------------------------------------------------------------------------
// The parser — every row of the spec's I/O matrix.
// ---------------------------------------------------------------------------

describe('parseMemlog', () => {
  it('reads a tagged entry as kind and reason', () => {
    expect(parseMemlog('- (decision) Scope fixed to EU-only')).toEqual([
      { kind: 'decision', author: null, time: null, reason: 'Scope fixed to EU-only' }
    ])
  })

  it('reads the authored form, and keeps the author out of the reason', () => {
    expect(parseMemlog('- (idea by user) FACT: the stall is the product')).toEqual([
      { kind: 'idea', author: 'user', time: null, reason: 'FACT: the stall is the product' }
    ])
  })

  it('reads the kindless authored form the writer’s strip() produces', () => {
    // `label = f"{type} by {by}".strip()` — with no `--type` that is
    // "by coach", with no leading space for a ` by ` split to find.
    const [note] = parseMemlog('- (by coach) what if the room were the product')

    expect(note).toEqual({
      kind: null,
      author: 'coach',
      time: null,
      reason: 'what if the room were the product'
    })
    expect(kindTreatment(note.kind)).toBe('neutral')
  })

  it('reads an untagged entry as reason alone', () => {
    expect(parseMemlog('- spines finalized')).toEqual([
      { kind: null, author: null, time: null, reason: 'spines finalized' }
    ])
  })

  it('closes the tag at the first `)`, so a reason may contain parens', () => {
    // 139 of the 267 real entries contain a `)` in the reason. A greedy
    // `\((.*)\)` would swallow to the last paren and corrupt the majority of
    // the corpus into a kind that is really a sentence.
    const line =
      '- (event) Create from brainstorm (brainstorm-intent.md + its memlog); slug inherited'

    expect(parseMemlog(line)).toEqual([
      {
        kind: 'event',
        author: null,
        time: null,
        reason: 'Create from brainstorm (brainstorm-intent.md + its memlog); slug inherited'
      }
    ])
  })

  it('gives an embedded ` by ` to the author, which is the free-text half', () => {
    // `--type` and `--by` are both unvalidated free strings and the writer
    // joins them with exactly one ` by `, so a label carrying two is ambiguous
    // on re-read. The author keeps the extra: it names a person, where every
    // kind in the corpus is a single word.
    expect(parseMemlog('- (idea by van by der) x')).toEqual([
      { kind: 'idea', author: 'van by der', time: null, reason: 'x' }
    ])
  })

  it('keeps an entry whose text is empty, which the writer permits', () => {
    expect(parseMemlog('- (decision) ')).toEqual([
      { kind: 'decision', author: null, time: null, reason: '' }
    ])
  })

  it('skips the frontmatter block entirely: a fence is never an entry', () => {
    const memlog = ['---', 'topic: x', 'updated: 2026-09-25T11:32', '---', '', '- (event) go'].join(
      '\n'
    )

    // The fences match `^-` but not `^- `, so the dash-space test already
    // rejects them — this asserts the block is skipped rather than merely
    // surviving it.
    expect(parseMemlog(memlog)).toEqual([
      { kind: 'event', author: null, time: null, reason: 'go' }
    ])
  })

  it('ignores a body line that is not an entry', () => {
    const memlog = ['---', 'updated: x', '---', '', 'a heading', '', '- (note) kept'].join('\n')

    // Only the dash-space line survives; the heading and the blank lines are
    // not entries and are not rendered.
    expect(parseMemlog(memlog)).toEqual([
      { kind: 'note', author: null, time: null, reason: 'kept' }
    ])
  })

  it('does not mistake a parenthesised phrase for a tag', () => {
    // `memlog.py` writes `- <text>` whenever neither --type nor --by is given,
    // so an entry may legally open with a parenthesis of its own. A kind is
    // one word; a phrase in that position was never a tag, and reading it as
    // one deletes the words from the reason where nobody would look for them.
    expect(parseMemlog('- (see note A) real text here')).toEqual([
      { kind: null, author: null, time: null, reason: '(see note A) real text here' }
    ])
  })

  it('still reads a one-word tag, and an authored one, after that rule', () => {
    // The rule above must not cost the two forms the writer actually emits:
    // the author half may be free text with spaces in it, and only the kind
    // half is held to one word.
    expect(parseMemlog('- (decision) settled')[0].kind).toBe('decision')
    expect(parseMemlog('- (idea by van der berg) x')[0]).toEqual({
      kind: 'idea',
      author: 'van der berg',
      time: null,
      reason: 'x'
    })
  })

  it('lower-cases and trims the kind before anything looks it up', () => {
    expect(parseMemlog('- (Decision) x')[0].kind).toBe('decision')
    expect(parseMemlog('- ( decision ) x')[0].kind).toBe('decision')
  })

  it('answers [] for a file with no entries, rather than throwing', () => {
    expect(parseMemlog('')).toEqual([])
    expect(parseMemlog('---\nupdated: x\n---\n')).toEqual([])
    expect(parseMemlog('nothing here at all')).toEqual([])
  })

  it('carries no time: the format has none to carry', () => {
    // The slot exists because Epic 3 fills it from when the harness observed
    // the append. Read from a file there is nothing to put in it, and
    // inventing one — the file's mtime, the frontmatter's `updated` — would
    // be a timestamp that means something other than what it says.
    expect(allNotes.every((note) => note.time === null)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The kind vocabulary is open (FR41).
// ---------------------------------------------------------------------------

describe('kindTreatment', () => {
  it('gives the accent treatment to a decision and to nothing else', () => {
    expect(kindTreatment('decision')).toBe('accent')
  })

  it('gives the warm friction treatment to an unresolved question', () => {
    expect(kindTreatment('question')).toBe('friction')
    expect(kindTreatment('gap')).toBe('friction')
  })

  it('falls back to neutral for every other kind, including one nobody has seen', () => {
    // FR41's promise is that a kind shipped by a future BMad release renders
    // rather than breaking the feed, so the fallback is the rule and not the
    // error case. `note` is here because DESIGN.md says so by name: it is the
    // neutral tag and must not reach for `{colors.note}`.
    for (const kind of ['assumption', 'note', 'event', 'moment', 'a-kind-from-2031', '', null]) {
      expect(kindTreatment(kind), String(kind)).toBe('neutral')
    }
  })
})

// ---------------------------------------------------------------------------
// Emphasis, where the text marks it and nowhere else.
// ---------------------------------------------------------------------------

describe('emphasisSpans', () => {
  it('splits a marked reason into three spans, the middle one emphasised', () => {
    expect(emphasisSpans('Scope fixed to **EU-only for v1** — the brief names EU')).toEqual([
      { text: 'Scope fixed to ', emphasised: false },
      { text: 'EU-only for v1', emphasised: true },
      { text: ' — the brief names EU', emphasised: false }
    ])
  })

  it('leaves an unmatched marker as literal text', () => {
    // The format carries no escape sequence, so two asterisks with no partner
    // are two asterisks — not a broken document to be repaired.
    expect(emphasisSpans('a ** b')).toEqual([{ text: 'a ** b', emphasised: false }])
  })

  it('drops empty runs rather than emitting an emphasised nothing', () => {
    expect(emphasisSpans('**a**')).toEqual([{ text: 'a', emphasised: true }])
    expect(emphasisSpans('')).toEqual([])
  })

  it('reads every marker in a reason, not only the first', () => {
    expect(emphasisSpans('**a** and **b**')).toEqual([
      { text: 'a', emphasised: true },
      { text: ' and ', emphasised: false },
      { text: 'b', emphasised: true }
    ])
  })

  it('is stated exhaustively at its edges, because the marker is its own escape', () => {
    // Every shape two asterisks can take. The only lossy case is a marked run
    // that is empty — `****` renders as nothing, the way an empty `<strong>`
    // would — and it is named here so that it is a decision rather than a
    // surprise found later in a reason nobody read.
    const cases: [string, [string, boolean][]][] = [
      ['', []],
      ['plain', [['plain', false]]],
      ['a **b** c', [['a ', false], ['b', true], [' c', false]]],
      ['a ** b', [['a ** b', false]]],
      ['**a**', [['a', true]]],
      ['**', [['**', false]]],
      ['****', []],
      ['a****b', [['a', false], ['b', false]]]
    ]

    for (const [reason, expected] of cases) {
      expect(emphasisSpans(reason), JSON.stringify(reason)).toEqual(
        expected.map(([text, emphasised]) => ({ text, emphasised }))
      )
    }
  })
})

// ---------------------------------------------------------------------------
// The real corpus, read from disk at run time.
// ---------------------------------------------------------------------------

describe('the memlogs in this repository', () => {
  it('parses every entry of every memlog, counted from the files themselves', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(5)
    expect(corpus).toContain(UX_MEMLOG)
    expect(corpus).toContain(BRAINSTORM_MEMLOG)

    for (const path of corpus) {
      const text = read(path)

      // The writer's own `entry_count` is `startswith("- ")`, so the parser
      // agreeing with it is the parser agreeing with the writer.
      expect(parseMemlog(text).length, path).toBe(entryLines(text).length)
    }
  })

  it('reads the named UX memlog in file order, newest last', () => {
    // The count comes off the file, not out of this line. These memlogs are
    // live artifacts that a later BMad run appends to, and a transcribed 36
    // would redden on the next append rather than on a defect — the same
    // reason the kind count below is a floor.
    const entries = entryLines(read(UX_MEMLOG))

    expect(uxNotes).toHaveLength(entries.length)
    expect(uxNotes.length).toBeGreaterThanOrEqual(36)
    expect(uxNotes[0].kind).toBe('decision')
    expect(uxNotes[0].reason.startsWith('Sources bound:')).toBe(true)
    // Order is the claim: the first line of the file is the first note and the
    // last line is the last, so nothing sorted or reversed on the way through.
    expect(uxNotes[0].reason).toBe(entries[0].replace(/^- \([^)]*\) ?/, ''))
    expect(uxNotes[uxNotes.length - 1].reason).toBe(
      entries[entries.length - 1].replace(/^- \([^)]*\) ?/, '')
    )
  })

  it('never fails in the three ways a tag regex is known to fail', () => {
    // An empty reason means the tag ate the text; a reason beginning `(` means
    // the tag was never recognised; a kind containing a space means the tag
    // closed at the wrong paren. Each is silent in the markup and loud here.
    expect(allNotes.filter((note) => note.reason === '')).toEqual([])
    expect(allNotes.filter((note) => note.reason.startsWith('('))).toEqual([])
    expect(allNotes.filter((note) => note.kind !== null && /\s/.test(note.kind))).toEqual([])
  })

  it('exercises the neutral fallback against real data rather than a fixture', () => {
    // Deliberately a floor, not a count. The vocabulary is open — the number
    // of kinds in this repository is a fact about this repository on this day,
    // and a test that pinned it would fail on the next memlog append rather
    // than on a defect.
    const named = ['decision', 'assumption', 'question', 'gap']
    const kinds = new Set(allNotes.map((note) => note.kind).filter((kind) => kind !== null))

    expect(kinds.size).toBeGreaterThan(named.length)
    for (const kind of kinds) {
      if (!named.includes(kind)) {
        expect(kindTreatment(kind), kind).toBe('neutral')
      }
    }
    // And the named kinds really are in there, so the assertion above is not
    // passing because the corpus happens to contain none of them.
    expect(kinds.has('decision')).toBe(true)
    expect(kinds.has('question')).toBe(true)
  })

  it('covers every kind FR41 names for the fallback, by name', () => {
    // FR41 enumerates the kinds the neutral fallback must cover. The corpus
    // sweep above happens to reach most of them, but "happens to" is not
    // traceability: a requirement written as a list is checked as that list.
    const named = [
      'event',
      'constraint',
      'capability',
      'change',
      'version',
      'technique',
      'note',
      'override',
      'direction'
    ]

    for (const kind of named) {
      expect(kindTreatment(kind), kind).toBe('neutral')
    }
    // `note` is the trap in that list: it also names a colour token and a
    // status-dot state, and DESIGN.md says in two places that the tag must not
    // reach for `--note`. Neutral is the whole treatment.
    expect(kindTreatment('note')).toBe('neutral')
  })

  it('treats `open` as neutral, because the real format never emits it', () => {
    // DESIGN.md gives `open` the friction treatment; FR41 replaces it with
    // `question` and `gap` because `open` occurs in no memlog the writer has
    // ever produced. Pinned here so the substitution is a decision on record
    // rather than an omission nobody notices.
    expect(kindTreatment('open')).toBe('neutral')
    expect(new Set(allNotes.map((note) => note.kind))).not.toContain('open')
  })

  it('resolves the author of every authored entry, and leaks none into a reason', () => {
    // The brainstorming memlog is the only file carrying `(kind by author)`,
    // and it carries it 59 times out of 68.
    const notes = parseMemlog(read(BRAINSTORM_MEMLOG))
    const authored = notes.filter((note) => note.author !== null)

    // A floor, for the same reason as above: this file can gain entries.
    expect(authored.length).toBeGreaterThanOrEqual(59)
    expect(new Set(authored.map((note) => note.author))).toEqual(new Set(['user', 'coach']))
    for (const note of authored) {
      expect(note.reason.includes(` by ${note.author}`), note.reason).toBe(false)
      expect(note.reason.startsWith(String(note.author)), note.reason).toBe(false)
      expect(note.kind, note.reason).not.toBeNull()
    }
  })

  it('renders every real reason as spans that rebuild the original text', () => {
    // Emphasis is nearly unexercised in the corpus — one entry in 267 carries
    // a marker — so this is the assertion that the splitter is harmless on the
    // other 266 rather than that it fires.
    for (const note of allNotes) {
      const rebuilt = emphasisSpans(note.reason)
        .map(({ text, emphasised }) => (emphasised ? `**${text}**` : text))
        .join('')

      expect(rebuilt, note.reason).toBe(note.reason)
    }
  })
})

/**
 * The mount the story's acceptance depends on.
 *
 * Story 1.5 exists to be looked at and ruled on, so the feed being reachable
 * in the running app is part of the deliverable rather than scaffolding around
 * it. Nothing else asserts it: no test imports `app.tsx`, and dropping the
 * mount leaves the whole suite green.
 */
describe('the preview in force', () => {
  it('mounts the feed over a real memlog', () => {
    const app = read(APP)

    expect(app).toContain('<RunNoteFeed notes={PREVIEW_NOTES} />')
    expect(app).toContain('parseMemlog(uxMemlog)')
    expect(app).toContain(UX_MEMLOG.slice(UX_MEMLOG.indexOf('_bmad')))
  })

  it('renders it on a ground the palette was designed for', () => {
    // Every colour token is chosen against `--bg`. With no page rule the
    // window keeps the browser's light default and `--dim` text at
    // `--fs-body-ui` is pale-on-pale — the tokens all correct, the surface
    // unreadable, and the judgement this story exists for unavailable.
    const page = read(PAGE_CSS)
    const entry = read(ENTRY)

    expect(page).toContain('background: var(--bg)')
    expect(page).toContain('color: var(--text)')
    expect(entry).toMatch(/^import '\.\.\/design\/page\.css'$/m)
    // Tokens first, or the var()s resolve to nothing.
    expect(entry.indexOf("import '../design/tokens.css'")).toBeLessThan(
      entry.indexOf("import '../design/page.css'")
    )
  })
})

// ---------------------------------------------------------------------------
// The invariants that must survive a rewrite of the component.
// ---------------------------------------------------------------------------

describe('the run-note stylesheet', () => {
  const css = read(RUN_NOTE_CSS)

  it('is governed by the NFR23 guard, and is the first real file it sweeps', () => {
    // Story 1.3 built the guard with nothing under `src/renderer/` for it to
    // govern, so the filesystem sweep was vacuous and only the in-memory
    // probes proved it wired. This is the file that ends that.
    expect(guardedStylesheets()).toContain(RUN_NOTE_CSS)
  })

  it('reports no literal under the imported guard', () => {
    expect(
      literalsIn(RUN_NOTE_CSS, css).map(({ line, kind, text }) => `${line} ${kind} ${text}`)
    ).toEqual([])
  })

  it('carries no media query: NFR27 allows no third breakpoint', () => {
    // The binding mockup collapses this row to one column at 640px. NFR27
    // fixes the product at two breakpoints and that is not one of them, so the
    // collapse is deliberately not ported.
    expect(css).not.toContain('@media')
  })

  it('spends a var() for every value that carries a design decision', () => {
    // Stronger than the guard, which only rejects the literals it knows how to
    // spell. Here every value is accounted for: what is left once the `var()`
    // references are removed must come from a closed list of things that carry
    // no design decision at all.
    const carriesNothing = new Set([
      '0',
      '1fr',
      'flex',
      'column',
      'grid',
      'none',
      'baseline',
      'solid',
      'start',
      'tabular-nums'
    ])

    const leftovers = [...withoutComments(css).matchAll(/\{([^{}]*)\}/g)]
      .flatMap(([, block]) => [...block.matchAll(/[a-z-]+\s*:\s*([^;]+);/g)])
      .flatMap(([, value]) =>
        value
          .replace(/var\(\s*--[\w-]+\s*\)/g, ' ')
          .split(/\s+/)
          .filter((token) => token !== '')
      )
      .filter((token) => !carriesNothing.has(token))

    expect(leftovers).toEqual([])
  })

  it('spends tokens that actually exist', () => {
    // `literalsIn` rejects literal spellings, and the leftover check above
    // strips `var(--anything)` name-agnostically — so a typo like
    // `var(--panel-two)` passes both while the declaration is simply invalid
    // in the browser and the surface ships unstyled. Every guarded stylesheet
    // is checked, not just this one: this file is the template the next
    // component stylesheet will copy.
    // Not line-anchored: tokens.css carries the mockup's `:root` block
    // verbatim, and that block puts two declarations on one line.
    const declared = new Set(
      [...withoutComments(read(TOKENS_CSS)).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name)
    )

    expect(declared.size).toBeGreaterThan(50)
    for (const sheet of guardedStylesheets()) {
      for (const [, name] of withoutComments(read(sheet)).matchAll(/var\(\s*(--[\w-]+)/g)) {
        expect(declared.has(name), `${sheet} references ${name}`).toBe(true)
      }
    }
  })

  it('spends the tokens UX-DR20 names, in the properties it names them for', () => {
    // The token values are coupled to DESIGN.md in tests/tokens.test.ts. What
    // that cannot see is whether this file spends them *here* — a grid built
    // from two unrelated tokens would satisfy every other check in this
    // describe while drawing the wrong row.
    const declarations = withoutComments(css)

    expect(declarations).toContain(
      'grid-template-columns: var(--run-note-time) var(--run-note-kind) 1fr'
    )
    expect(declarations).toContain('gap: var(--space-lg)')
    expect(declarations).toContain('align-items: baseline')
    expect(declarations).toContain('border-top: var(--rule-width) solid var(--line-soft)')
  })

  it('addresses every treatment the component can emit, and only those', () => {
    // The component builds `run-note-kind--${kindTreatment(...)}` and this
    // file defines the rules behind those strings. Nothing else connects the
    // two, so renaming a selector drops the accent treatment with the whole
    // suite green.
    const modifiers = new Set(
      [...withoutComments(css).matchAll(/\.run-note-kind--([\w-]+)/g)].map(([, name]) => name)
    )

    // `neutral` is the base rule deliberately, not an omission: the plain
    // `.run-note-kind` chip *is* the neutral treatment, so a modifier for it
    // would be a second way to spell the same thing.
    expect(modifiers).toEqual(new Set(['accent', 'friction']))
    expect(css).toContain('.run-note-kind {')
    expect(css).toContain('.run-note-reason strong {')

    // And the component cannot emit a treatment this file does not address.
    const emitted = new Set(
      [...allNotes.map((note) => note.kind), 'decision', 'question', 'gap', null].map(
        (kind) => kindTreatment(kind)
      )
    )
    for (const treatment of emitted) {
      expect(treatment === 'neutral' || modifiers.has(treatment), treatment).toBe(true)
    }
  })

  it('is loaded by the component, not merely present beside it', () => {
    // Without this, deleting one import line leaves lint, typecheck, build and
    // every other test in this file green while the feed renders as unstyled
    // spans — no grid, no register split, no tag treatment. The same contract
    // tests/tokens.test.ts pins for the renderer entry and tokens.css.
    expect(read(RUN_NOTE_FEED)).toContain("import './run-note.css'")
  })

  it('draws no focus treatment of its own', () => {
    // UX-DR23: the ring is defined once, in design/focus.css. A component that
    // adds its own is the reimplementation the floor exists to prevent.
    expect(css).not.toContain(':focus')
  })
})

describe('the run-note component', () => {
  // Comments stripped, the way tests/accessibility.test.ts strips them: this
  // guard is about what the component does, and the block comment above
  // `RunNoteFeed` says the words it forbids in order to say why.
  const source = withoutComments(read(RUN_NOTE_FEED)).replace(/^\s*\/\/.*$/gm, '')

  it('never turns project content into HTML', () => {
    // A memlog is project content. The spans are rendered as React children,
    // which escapes by construction — there is no sanitizer here to be
    // bypassed because there is no HTML pipeline to sanitize.
    for (const escape of ['dangerouslySetInnerHTML', 'markdown-it', 'dompurify', 'innerHTML']) {
      expect(source, escape).not.toContain(escape)
    }
  })

  it('takes its notes as a prop rather than reading a file', () => {
    // Epic 3 mounts this same component against a live stream of appends. A
    // component that read files could not be reused there.
    expect(source).toMatch(/notes:\s*RunNote\[\]/)
    for (const io of ['node:fs', 'readFileSync', '?raw']) {
      expect(source, io).not.toContain(io)
    }
  })

  it('emits three grid children unconditionally, not behind a condition', () => {
    // The markup assertion lives in the `.test.tsx`; this is the source-text
    // half of it, and it is what catches a well-meant `{note.time && …}`
    // arriving in a later edit and taking the time cell away with it.
    expect(source).toMatch(/className="run-note-time"/)
    expect(source).not.toMatch(/\{note\.time\s*&&/)
    expect(source).not.toMatch(/\{note\.kind\s*&&/)
  })
})

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AgentView, InstallSnapshot } from '../../../shared/install'
import { Shell } from '../shell/shell'
import { Composer } from './composer'
import { canAnswer, initialConversation, sendMessage } from './conversation-state'
import { handoffTarget } from './handoff-target'
import { createProseStore } from './prose-store'
import { RunCard } from './run-card'
import type { RunCardEntry } from './transcript-entry'
import { Turns } from './transcript'
import type { TranscriptEntry } from './transcript-entry'
import { withoutSplitters } from '../testing/audit-patterns'

/**
 * Epic 2's negative surface, rendered (Story 2.13).
 *
 * The sweeps in `tests/negative-surface.test.ts` read the sources; this reads the
 * markup the assembled chat column produces — the composer, a persona's turn, the
 * user's queued turn, the sysline, a decision block and an orphan's header — which
 * the shell's own negative test never mounts. A surface that grows a tooltip, a
 * stand-in sentence or a recommendation out of pieces no pattern names still has
 * to put it in this markup.
 */

const NOW = 1_000_000_000_000

const agent = (id: string, name: string): AgentView => ({
  id,
  module: 'bmm',
  name,
  title: 'Role',
  icon: 'i',
  description: 'Keeps the plan honest'
})

const ADA = agent('bmad-agent-a', 'Ada')
const BEN = agent('bmad-agent-b', 'Ben')
const CY = agent('bmad-agent-c', 'Cy')
const GONE = agent('bmad-agent-gone', 'Gil')
const ROSTER = [ADA, BEN, CY]

/** Menus whose codes, descriptions and a skill name must appear nowhere in the column. */
const MENUS: InstallSnapshot['menus'] = {
  'bmad-agent-a': [{ code: 'WS', description: 'Write the spec for this project' }],
  'bmad-agent-b': [{ code: 'CP', description: 'Create the plan for delivery' }]
}

const snapshot = (agents: AgentView[] = ROSTER): InstallSnapshot => ({
  revision: 1,
  agents,
  menus: MENUS,
  errors: [],
  preflight: []
})

const WORDS = [
  'Ada: I can write the brief, the spec or the plan.',
  '',
  'Which would you like me to start with?',
  '',
  'A. The brief for the board',
  'B. The spec for the build team',
  'C. The plan for delivery'
].join('\n')

const persona = (id: string, at: number, text: string, who: AgentView = ADA): TranscriptEntry => ({
  kind: 'persona',
  id,
  at,
  agent: who,
  text
})

const user = (id: string, at: number, text: string, queuedFor?: string): TranscriptEntry => ({
  kind: 'user',
  id,
  at,
  text,
  ...(queuedFor === undefined ? {} : { queuedFor })
})

const sysline = (id: string, at: number): TranscriptEntry => ({
  kind: 'sysline',
  id,
  at,
  text: 'handed to Ada'
})

type Column = { entries: TranscriptEntry[]; answerable?: boolean }

/** The whole chat column, as the shell draws it: orphan header, thread, composer. */
function column({ entries, answerable = false }: Column): string {
  const markup = renderToStaticMarkup(
    <Shell
      projectPath="/work/falcon"
      snapshot={snapshot()}
      currentId={ADA.id}
      orphans={[GONE]}
      onCloseOrphan={() => {}}
      composer={(current) => <Composer agentName={current.name} onSend={() => {}} />}
    >
      <Turns
        entries={entries}
        onCancel={() => {}}
        canAnswer={() => answerable}
        onChoose={() => {}}
      />
    </Shell>
  )
  // From the chat column's opening tag to the rail's: the rail carries the tiles,
  // whose hints are the menus' codes by design, and is not the conversation.
  const start = markup.indexOf('<div class="chat">')
  const end = markup.indexOf('<div class="rail">')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return markup.slice(start, end)
}

/** A persona asking while the user's earlier message waits: the queued state. */
const QUEUED: Column = {
  entries: [
    sysline('s', NOW),
    persona('p', NOW + 1000, WORDS),
    user('u', NOW + 2000, 'and the budget too', 'Ada')
  ],
  // The persona could take a reply, so the only thing keeping its question from
  // becoming a block is the later entry: that is the rule under test.
  answerable: true
}

/** A persona that stopped to ask, with nothing after it: the answerable state. */
const ASKING: Column = {
  entries: [sysline('s', NOW), persona('p', NOW + 1000, WORDS)],
  answerable: true
}

const STAND_IN =
  /\b(?:loading|resolving|scanning|fetching|connecting|initiali[sz]ing|please wait|spinner|skeleton|shimmer|opening|starting|thinking|typing|waiting|processing|preparing|booting|launching|warming|getting ready|in progress|one moment|just a moment|hold on|stand by|busy)\b|\.\.\.|…/i

const RECOMMENDATION =
  /recommend|suggest|preferred|\bbest\b|\bdefault\b|next move|next step|you (?:may|might|could|should) |would you like to (?:talk|switch|hand)|better suited|outside (?:my|their) |not my (?:area|speciality)|hand(?:ing)? (?:this |you )?(?:off|over) to/i

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

const STATES: [string, Column][] = [
  ['a queued message beside a persona turn and a sysline', QUEUED],
  ['a persona turn that ends in a decision', ASKING]
]

describe.each(STATES)('the chat column with %s', (_label, state) => {
  const markup = column(state)

  it('draws something to inspect: composer, orphan header, turns', () => {
    expect(markup).toContain('class="composer"')
    expect(markup).toContain('orphan-head')
    expect(count(markup, /class="turn /g)).toBeGreaterThan(0)
    expect(markup).toContain('class="sysline"')
  })

  it('has one text field, the composer’s, and no other input, select, dialog or menu', () => {
    expect(count(markup, /<textarea\b/g)).toBe(1)
    expect(markup).not.toMatch(/<(?:input|select|dialog|datalist|progress|meter|output)\b/i)
    expect(markup).not.toMatch(/role="(?:dialog|alertdialog|combobox|search|searchbox|listbox|menu|tooltip)"/)
    expect(markup).not.toMatch(/aria-(?:modal|haspopup|autocomplete|activedescendant|expanded|controls|owns)|contenteditable/i)
  })

  it('has no tooltip, `title`, `data-*` or described-by anywhere in it', () => {
    expect(markup).not.toMatch(/\stitle=|\sdata-[a-z]|aria-describedby|tooltip|popover|<title\b/i)
  })

  it('has no live region, busy flag, status role or progress of its own', () => {
    // The window's one polite region is mounted by `App`, outside the column. (The group
    // spells its attribute so: tests/accessibility.test.ts counts the literal across `src/`.)
    expect(withoutSplitters(markup)).not.toMatch(/aria-(?:live)|aria-busy|role="(?:status|alert|log|progressbar|timer)"|aria-valuenow/)
  })

  it('has no stand-in sentence, loading-like word or ellipsis', () => {
    expect(markup).not.toMatch(STAND_IN)
  })

  it('has no recommendation, default, refusal or handoff offer', () => {
    expect(markup).not.toMatch(RECOMMENDATION)
    // The persona's question is its own words. The sysline's `handed to` is a past-tense fact and
    // does not match; an offer to hand off (`hand off`, `handing off`) would.
    expect(markup).not.toMatch(/\bhand(?:ing)?[- ]?off\b/i)
  })

  it('carries no skill: no code, description, menu or agent id leaks into the chat column', () => {
    expect(markup).not.toContain('>WS<')
    expect(markup).not.toContain('>CP<')
    expect(markup).not.toContain('Write the spec for this project')
    expect(markup).not.toContain('Create the plan for delivery')
    expect(markup).not.toMatch(/bmad-agent-[abc]\b/)
  })

  it('has no badge, count or unread marker, and no sound or media element', () => {
    expect(markup).not.toMatch(/badge|unread|<audio|<video|<canvas/i)
    expect(markup).not.toMatch(/>\+?\d+</)
  })

  it('has no button but the orphan’s close, the composer’s send, the queued message’s cancel and decision options', () => {
    const labels = [...markup.matchAll(/<button\b([^>]*)>/g)].map(([, attributes]) => /class="([^"]*)"/.exec(attributes)?.[1] ?? '(no class)')

    expect(labels.filter((name) => !/^(?:orphan-close|composer-send|turn-cancel|decision-option)$/.test(name))).toEqual([])
    expect(count(markup, /class="orphan-close"/g)).toBe(1)
    expect(count(markup, /class="composer-send"/g)).toBe(1)
  })

  it('is never disabled', () => {
    expect(markup).not.toMatch(/\sdisabled|aria-disabled|readonly/i)
    expect(markup).not.toMatch(/role="button"/)
  })

  it('shows the composer’s hint as the two keys it answers to, and no ⌘↵', () => {
    expect(markup).toContain('<span>enter sends</span>')
    expect(markup).toContain('<span>shift+enter adds a line</span>')
    expect(markup).not.toMatch(/⌘|↵/)
  })
})

describe('a queued message', () => {
  const markup = column(QUEUED)

  it('is the only status copy beside the persona’s state, and says what it waits for', () => {
    expect(count(markup, /queued ·/g)).toBe(1)
    expect(markup).toContain('queued · sends when Ada finishes')
    expect(count(markup, /class="turn-cancel"/g)).toBe(1)
  })

  it('draws no decision: a later entry removes the block from the persona’s turn', () => {
    expect(markup).not.toMatch(/class="decision/)
  })
})

describe('a session that is opening', () => {
  // The first message typed with no live session: no sessionId, nothing busy. The
  // only sign anything is waiting is the user's own message, queued.
  const sent = sendMessage(initialConversation, ADA.id, NOW, 'hello Ada', 'Ada')
  const markup = column({ entries: [...sent.state.entries] })

  it('sends nothing yet, and holds the user’s turn as a queued message', () => {
    expect(sent.deliver).toBeUndefined()
    expect(sent.state.entries).toHaveLength(1)
    expect(sent.state.sessions.size).toBe(0)
    expect(canAnswer(sent.state, ADA.id)).toBe(false)
  })

  it('draws the user’s turn and its queued mark and nothing else in the thread', () => {
    const thread = markup.slice(markup.indexOf('<div class="thread">'), markup.indexOf('<div class="composer">'))

    expect(count(thread, /class="turn /g)).toBe(1)
    expect(thread).toContain('turn--user turn--queued')
    expect(thread).toContain('queued · sends when Ada finishes')
    expect(thread).not.toContain('class="turn turn--persona')
    expect(thread).not.toContain('class="sysline"')
    // The thread holds the turn and its mark: no other element and no other sentence.
    const text = thread.replace(/<[^>]*>/g, '|').split('|').map((part) => part.trim()).filter((part) => part !== '')
    expect(text.filter((part) => !/^(?:You|you|hello Ada|queued · sends when Ada finishes|cancel)$/.test(part) && !/^\d{1,2}:\d{2}/.test(part) && !/^[A-Z]{1,3}$/.test(part))).toEqual([])
  })

  it('draws no status role, busy flag, progress element or stand-in sentence', () => {
    expect(markup).not.toMatch(/role="status"|aria-busy|<progress\b|aria-(?:live)/)
    expect(markup).not.toMatch(STAND_IN)
  })
})

describe('the decision block', () => {
  // The persona’s own order, whatever the options say: reverse alphabetical text,
  // and a lean in the persona’s words.
  const OPTIONS = [
    'Zebra stripes first',
    'Middle road, taking both',
    'Apple pie last (I lean here)'
  ]
  const ASK = ['Which way?', '', ...OPTIONS.map((text, index) => `${'ABC'[index]}. ${text}`)].join('\n')
  const asking = (text: string): string =>
    column({ entries: [persona('p', NOW, text)], answerable: true })
  const markup = asking(ASK)
  const options = [...markup.matchAll(/<button type="button" class="decision-option">(.*?)<\/button>/g)].map(
    ([, inner]) => inner
  )

  it('shows the options in the persona’s order, keyed by position', () => {
    expect(options).toHaveLength(3)
    expect(options.map((inner) => inner.replace(/<[^>]*>/g, '|').split('|').filter(Boolean))).toEqual([
      ['A', OPTIONS[0]],
      ['B', OPTIONS[1]],
      ['C', OPTIONS[2]]
    ])
  })

  it('makes every option the same button bar its key and its words: no lean, default or style', () => {
    const bare = options.map((inner) =>
      inner.replace(/(<span class="decision-key">)[^<]*/, '$1').replace(/(<span class="decision-text">)[^<]*/, '$1')
    )

    expect(new Set(bare).size).toBe(1)
    expect(withoutSplitters(markup)).not.toMatch(/aria-(?:pressed|selected|checked|current|disabled)|autofocus|tabindex|\sstyle=|checked|selected/i)
    // The lean is the persona's sentence, inside its words and its option, and nowhere else.
    expect(count(markup, /I lean here/g)).toBe(2)
  })

  it('does not reorder options that arrive as C, A, B: there is no block, and the words are whole', () => {
    const jumbled = asking(['Which way?', '', 'C. third', 'A. first', 'B. second'].join('\n'))

    expect(jumbled).not.toContain('class="decision')
    expect(jumbled).toContain('C. third')
  })

  it('leaves no residue once the user’s turn exists: the block, its title and its group are gone', () => {
    const answered = sendMessage(
      { ...initialConversation, entries: [persona('p', NOW, ASK)], sessions: new Map([[ADA.id, 'session-1']]) },
      ADA.id,
      NOW + 1000,
      OPTIONS[2],
      'Ada'
    )
    const after = column({ entries: [...answered.state.entries], answerable: canAnswer(answered.state, ADA.id) })

    expect(canAnswer(answered.state, ADA.id)).toBe(false)
    expect(after).not.toMatch(/class="decision|role="group"|aria-labelledby/)
    // The title survives only as the persona's own paragraph, in its words.
    expect(count(after, /Which way\?/g)).toBe(1)
    expect(after).not.toContain('decision-title')
    // The option is echoed in the user's turn, and the persona's words keep theirs as written.
    const userTurn = after.slice(after.indexOf('turn--user'))
    expect(userTurn).toContain(OPTIONS[2])
    expect(count(after, /Apple pie last \(I lean here\)/g)).toBe(2)
    expect(after.slice(0, after.indexOf('turn--user'))).not.toContain('decision-')
  })

  it('also leaves nothing when the persona can no longer take a reply', () => {
    const busy = column({ entries: [persona('p', NOW, ASK)], answerable: false })

    expect(busy).not.toMatch(/class="decision|role="group"/)
  })
})

describe('`@` in the composer', () => {
  // A roster whose skills and codes carry the same words as the inputs below.
  const roster = [ADA, BEN, CY, agent('bmad-agent-pm', 'WS')]

  it.each([
    ['a skill code', '@WS write the spec'],
    ['a skill code in lower case', '@cp'],
    ['an agent id', '@bmad-agent-b'],
    ['the id of the current persona', '@bmad-agent-a'],
    ['a menu description word', '@Write'],
    ['a skill name', '@bmad-create-prd'],
    ['no persona of that name', '@unknown hello'],
    ['the current persona', '@Ada hello'],
    ['a leading slash', '/bmad-agent-b']
  ])('does not hand off on %s', (_why, message) => {
    // None of these is a roster name here, so each is null on that ground alone; the
    // next test is the one that shows a menu code is read as a name and nothing more.
    const target = handoffTarget(message, ROSTER, ADA.id)

    expect(target).toBeNull()
  })

  it('resolves a name that is also a menu code, as a name and for no other reason', () => {
    expect(handoffTarget('@WS hello', roster, ADA.id)?.agent.id).toBe('bmad-agent-pm')
    expect(handoffTarget('@ws', roster, ADA.id)?.agent.id).toBe('bmad-agent-pm')
    expect(handoffTarget('@WS hello', ROSTER, ADA.id)).toBeNull()
  })

  it('resolves a roster name other than the current persona’s, and only that', () => {
    expect(handoffTarget('@Ben hello', ROSTER, ADA.id)).toEqual({ agent: BEN, text: 'hello', mention: '@Ben' })
    expect(handoffTarget('@Ada', ROSTER, ADA.id)).toBeNull()
  })
})

/**
 * The run card in every state it can draw (Story 3.4): no waiting sentence,
 * spinner, skeleton or bar, and nothing between the notes and the prose.
 */
describe('the run card, in every state', () => {
  const entry = (over: Partial<RunCardEntry> = {}): RunCardEntry => ({
    kind: 'run',
    id: 'r1',
    at: NOW,
    runId: 'r1',
    sessionId: 's1',
    agentId: ADA.id,
    status: 'running',
    notes: [],
    documents: [],
    plan: ['Vision', 'Scope'],
    ...over
  })
  const draw = (card: RunCardEntry, text = ''): string => {
    const store = createProseStore({ raf: (run) => run() })
    if (text !== '') store.seed(card.runId, [{ callId: 'c1', path: 'prd.md', text, written: text.length, sections: [] }])
    return renderToStaticMarkup(<RunCard entry={card} prose={store} />)
  }
  const words = (markup: string): string => markup.replace(/<[^>]*>/g, '|')
  const STATES: [string, string][] = [
    ['born', draw(entry())],
    ['in dead air with notes', draw(entry({ notes: [{ text: '- (decision) One', at: NOW + 1 }] }))],
    ['writing', draw(entry(), '## 1. Vision\nwords')],
    ['finished', draw(entry({ status: 'finished', endedAt: NOW + 5 }), '## 1. Vision\nwords')],
    ['failed', draw(entry({ status: 'failed', endedAt: NOW + 5 }))],
    ['stopped', draw(entry({ status: 'stopped', endedAt: NOW + 5 }))]
  ]

  it.each(STATES)('says no waiting sentence and draws no spinner, skeleton or bar when %s', (_state, markup) => {
    expect(words(markup)).not.toMatch(STAND_IN)
    expect(words(markup)).not.toMatch(/nothing written|opens when|awaiting|not yet|yet to/i)
    expect(markup).not.toMatch(/<progress|<meter|role="progressbar"|aria-valuenow|skeleton|spinner|shimmer/i)
  })

  it.each(STATES)('has at least one row in its body when %s', (_state, markup) => {
    expect(markup).toMatch(/class="run-note"/)
  })

  it.each(STATES)('puts no label, rule or container between the notes and the prose when %s', (_state, markup) => {
    const flow = markup.slice(markup.indexOf('<div class="run-card-flow">'), markup.indexOf('</span></div></div></div>') + 1)
    expect(flow).toMatch(/^<div class="run-card-flow"><div class="run-note-feed">.*<\/div><div class="run-card-prose"/)
    expect(flow).not.toMatch(/<hr|<legend|<label|<h\d|role="separator"|divider/)
  })
})

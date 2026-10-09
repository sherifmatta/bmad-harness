import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { RunCardSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import { subjectOf } from '../src/main/fold/run-card'
import { createRunProjection } from '../src/main/projections/runs'
import { foldEvent, hydrate, initialConversation } from '../src/renderer/ui/chat/conversation-state'
import type { ConversationState } from '../src/renderer/ui/chat/conversation-state'
import { createProseStore } from '../src/renderer/ui/chat/prose-store'
import type { ProseStore } from '../src/renderer/ui/chat/prose-store'

/**
 * Two folds, one truth (Story 3.1). Main folds a run's events into the card it
 * hands a reloading window (`fold/run-card.ts`); the window folds the same
 * events live (`conversation-state.ts`, with prose in `prose-store.ts`). The
 * same sequence through both must leave the same card, field for field, or a
 * window that reloads would draw a different card from one that never did.
 */

type Card = Omit<RunCardSnapshot, 'code'>

/** Main's card, without the menu code: the renderer is never handed what the code ran, and keeps no code. */
function mainCard(events: ContractEvent[], runId: string): Card | undefined {
  const runs = createRunProjection()
  for (const event of events) runs.apply(event)
  const card = runs.snapshot().find((each) => each.runId === runId)
  if (card === undefined) return undefined
  const rest: Card & { code?: string } = { ...card }
  delete rest.code
  return rest
}

/** The window's card: the transcript entry, and its documents' text from the store, their sections from the entry. */
function windowCard(state: ConversationState, prose: ProseStore, runId: string): Card | undefined {
  const entry = state.entries.find((each) => each.kind === 'run' && each.runId === runId)
  if (entry === undefined || entry.kind !== 'run') return undefined
  const { at, notes, steps, documents, sessionId, status, plan, skill } = entry
  return {
    runId: entry.runId,
    sessionId,
    ...(entry.agentId === undefined ? {} : { agentId: entry.agentId }),
    ...(skill === undefined ? {} : { skill }),
    startedAt: at,
    status,
    ...(entry.endedAt === undefined ? {} : { endedAt: entry.endedAt }),
    ...(entry.error === undefined ? {} : { error: entry.error }),
    notes: [...notes],
    steps: [...steps],
    ...(plan === undefined ? {} : { plan: [...plan] }),
    documents: prose.documents(runId).map((document) => ({
      ...document,
      sections: [...(documents.find((each) => each.path === document.path)?.sections ?? [])]
    }))
  }
}

/** Fold events as the window does (`use-conversation.ts`): prose to the store, an `ok` commit to both, all else through `foldEvent`. */
function fold(events: ContractEvent[], from: ConversationState = initialConversation, store = createProseStore({ raf: (run) => run() })) {
  let state = from
  for (const event of events) {
    if (event.name === 'doc:prose') {
      store.append(event.payload.runId, event.payload.callId, event.payload.path, event.payload.text)
      continue
    }
    if (event.name === 'doc:committed' && event.payload.ok) {
      store.commit(event.payload.runId, event.payload.path, event.payload.callId, event.payload.text)
    }
    state = foldEvent(state, event, () => undefined).state
  }
  return { state, store }
}

const R = { runId: 'r1', sessionId: 's1' }
const started: ContractEvent = { name: 'run:started', payload: { ...R, agentId: 'bmad-agent-pm', code: 'CP', at: 100 } }
const startedWithPlan: ContractEvent = {
  name: 'run:started',
  payload: { ...R, agentId: 'bmad-agent-pm', code: 'CP', plan: ['Vision', 'Scope', 'Risks'], at: 100 }
}
const note = (text: string, at: number, pulled?: string[]): ContractEvent => ({
  name: 'run:note',
  payload: { ...R, text, ...(pulled === undefined ? {} : { pulled }), at }
})
const stepRunning = (callId: string, label: string, at: number): ContractEvent => ({
  name: 'run:step',
  payload: { ...R, callId, status: 'running', label, at }
})
const stepEnded = (callId: string, status: 'done' | 'failed', at: number): ContractEvent => ({
  name: 'run:step',
  payload: { ...R, callId, status, at }
})
const prose = (callId: string, path: string, text: string): ContractEvent => ({
  name: 'doc:prose',
  payload: { ...R, callId, path, text, at: 110 }
})
const committed = (callId: string, sections: string[], path = 'prd.md', text?: string): ContractEvent => ({
  name: 'doc:committed',
  payload: { ...R, ok: true, callId, path, sections, ...(text === undefined ? {} : { text }), at: 120 }
})
const rejected = (callId: string, path = 'prd.md'): ContractEvent => ({
  name: 'doc:committed',
  payload: { ...R, ok: false, callId, path, error: { code: 'doc/write-rejected', message: 'doc · the write was rejected' }, at: 121 }
})

const startedWithSkill: ContractEvent = {
  name: 'run:started',
  payload: { ...R, agentId: 'bmad-agent-pm', code: 'CP', skill: 'bmad-build', at: 100 }
}

const SEQUENCES: [string, ContractEvent[]][] = [
  ['a card just born', [started]],
  ['a card born with the skill it invoked, kept through notes, a step and the end (Story 3.18)', [startedWithSkill, note('- (event) one', 101), stepRunning('s1', 'read a.md', 102), stepEnded('s1', 'done', 103), { name: 'run:finished', payload: { ...R, at: 140 } }]],
  ['notes before any prose', [started, note('- (event) one', 101), note('- (decision) **two**', 102)]],
  [
    'a write, its commit, a revision, a rejection and the end',
    [
      started,
      note('- (event) one', 101),
      prose('c1', 'prd.md', '# PRD\n\n## Vision\n'),
      prose('c1', 'prd.md', 'words\n## Scope\n'),
      committed('c1', ['Vision', 'Scope']),
      prose('c2', 'prd.md', '## Scope\nrevised'),
      committed('c2', ['Scope', 'Risks']),
      prose('c3', 'other.md', 'never'),
      rejected('c3'),
      note('- (event) done', 130),
      { name: 'run:finished', payload: { ...R, at: 140 } }
    ]
  ],
  [
    'a failure, and events after it',
    [
      started,
      prose('c1', 'prd.md', 'part'),
      { name: 'run:failed', payload: { ...R, error: { code: 'run/failed', message: 'run · the run failed', detail: 'error_max_budget_usd' }, at: 150 } },
      note('- late', 151),
      committed('c1', ['Late']),
      { name: 'run:finished', payload: { ...R, at: 152 } }
    ]
  ],
  [
    'two paths, a switch of subject, an Edit with text, a rejection and a commit of a path never written',
    [
      started,
      prose('a1', 'addendum.md', '## One\n'),
      prose('a1', 'addendum.md', 'abc'),
      committed('a1', ['One']),
      prose('p1', 'prd.md', '# PRD\n'),
      prose('p1', 'prd.md', '## Vision\nwords'),
      committed('p1', ['Vision']),
      committed('e1', ['Vision', 'Goals'], 'prd.md', '# PRD\n## Vision\nwords\n## Goals'),
      committed('e2', [], 'elsewhere.md'),
      prose('p2', 'prd.md', 'short'),
      rejected('p2'),
      committed('e3', ['One', 'Two'], 'addendum.md', '## One\n## Two'),
      { name: 'run:finished', payload: { ...R, at: 140 } }
    ]
  ],
  [
    'a plan, a concern scan that pulls two names (one the plan holds), a later one that pulls the same, and the writes',
    [
      startedWithPlan,
      note('- (event) concern scan surfaced: Why Now and vision', 101, ['Why Now', 'vision']),
      note('- (event) concern scan surfaced: Why Now', 102, ['Why Now']),
      note('- (event) plain', 103),
      prose('c1', 'prd.md', '## Vision\nwords'),
      committed('c1', ['Vision']),
      { name: 'run:finished', payload: { ...R, at: 140 } },
      note('- (event) after the end', 141, ['Late'])
    ]
  ],
  [
    'steps interleaved with notes, a failed step, a repeat, a close of an unknown call, and a write with its own step',
    [
      started,
      stepRunning('t1', 'read prd.md', 101),
      note('- (event) one', 102),
      stepRunning('t2', 'run git', 103),
      stepRunning('t1', 'read again', 104),
      stepEnded('t1', 'done', 105),
      stepEnded('t1', 'failed', 106),
      stepEnded('nobody', 'done', 107),
      note('- (event) two', 108),
      stepRunning('w1', 'write prd.md', 109),
      prose('w1', 'prd.md', '## Vision\nwords'),
      committed('w1', ['Vision']),
      stepEnded('w1', 'done', 111),
      stepEnded('t2', 'failed', 112),
      { name: 'run:finished', payload: { ...R, at: 140 } }
    ]
  ],
  [
    'a step still running when the run is stopped, and a step after the end',
    [
      started,
      stepRunning('t1', 'read a.md', 101),
      stepRunning('t2', 'grep', 102),
      stepEnded('t1', 'done', 103),
      { name: 'run:stopped', payload: { ...R, at: 160 } },
      stepRunning('t3', 'read late.md', 161),
      stepEnded('t2', 'done', 162)
    ]
  ],
  [
    'a step still running when the run fails',
    [
      started,
      stepRunning('t1', 'run curl', 101),
      { name: 'run:failed', payload: { ...R, error: { code: 'run/failed', message: 'run · the run failed' }, at: 150 } }
    ]
  ],
  [
    'more steps than a card keeps, the oldest finished dropped and a running one kept',
    [
      started,
      stepRunning('first', 'read first.md', 101),
      ...Array.from({ length: 304 }, (_, n) => [
        stepRunning(`c${n}`, `read ${n}.md`, 200 + n),
        ...(n % 2 === 0 ? [stepEnded(`c${n}`, 'done', 600 + n)] : [])
      ]).flat(),
      { name: 'run:finished', payload: { ...R, at: 900 } } as ContractEvent
    ]
  ],
  ['a stop', [started, { name: 'run:stopped', payload: { ...R, at: 160 } }]],
  ['events of another run beside it', [started, { name: 'run:note', payload: { runId: 'r2', sessionId: 's2', text: '- x', at: 1 } }]]
]

describe('the run card, folded in main and in the window', () => {
  it.each(SEQUENCES)('is the same card after %s', (_label, events) => {
    const live = fold(events)
    expect(windowCard(live.state, live.store, 'r1')).toEqual(mainCard(events, 'r1'))
  })

  it.each(SEQUENCES)('is the same card after %s, for a window that reloaded halfway', (_label, events) => {
    for (let cut = 1; cut <= events.length; cut += 1) {
      const runs = createRunProjection()
      for (const event of events.slice(0, cut)) runs.apply(event)
      const snapshot = {
        entries: [],
        sessions: [],
        busy: [],
        personas: [],
        runs: runs.snapshot()
      }
      const store = createProseStore({ raf: (run) => run() })
      for (const card of snapshot.runs) store.seed(card.runId, card.documents)
      const hydrated = hydrate(initialConversation, snapshot, () => undefined).state
      const after = fold(events.slice(cut), hydrated, store)

      expect(windowCard(after.state, after.store, 'r1'), `cut at ${cut}`).toEqual(mainCard(events, 'r1'))
    }
  })

  it('holds at most 300 steps and never drops a running one', () => {
    const events = SEQUENCES.find(([label]) => label.startsWith('more steps'))?.[1] ?? []
    const card = mainCard(events, 'r1')
    expect(card?.steps).toHaveLength(300)
    // `first` never reported, so it was running while the finished ones were dropped, and it stayed.
    expect(card?.steps[0]).toMatchObject({ callId: 'first', status: 'failed', endedAt: 900 })
    expect(card?.steps.some((step) => step.callId === 'c0')).toBe(false)
    const midway = mainCard(events.slice(0, events.length - 1), 'r1')
    expect(midway?.steps).toHaveLength(300)
    expect(midway?.steps[0]).toMatchObject({ callId: 'first', status: 'running' })
    expect(midway?.steps.filter((step) => step.status === 'running').length).toBeGreaterThan(100)
    // The run ended: every step still running is failed at the terminal instant.
    expect(card?.steps.filter((step) => step.status === 'running')).toEqual([])
    expect(card?.steps.filter((step) => step.status === 'failed').every((step) => step.endedAt === 900)).toBe(true)
  })

  it('records how many notes a step began after, never a time', () => {
    const events = SEQUENCES.find(([label]) => label.startsWith('steps interleaved'))?.[1] ?? []
    const card = mainCard(events, 'r1')
    expect(card?.steps.map((step) => [step.callId, step.notesBefore, step.status])).toEqual([
      ['t1', 0, 'done'],
      ['t2', 1, 'failed'],
      ['w1', 2, 'done']
    ])
  })

  it('folds the recorded fast-path-sonnet write to the same text and sections on both sides', () => {
    // The document as the CLI wrote it, split into the pieces it streamed, as one call.
    const frames = readFileSync(resolve(import.meta.dirname, '..', 'fixtures', 'runs', 'fast-path-sonnet.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { type: string; parent_tool_use_id?: string | null; message?: { content?: { type: string; name?: string; id?: string; input?: { content?: string } }[] } })
    const write = frames
      .filter((frame) => frame.type === 'assistant' && !frame.parent_tool_use_id)
      .flatMap((frame) => frame.message?.content ?? [])
      .find((block) => block.type === 'tool_use' && block.name === 'Write' && (block.input?.content ?? '').length > 40_000)
    const text = write?.input?.content ?? ''
    expect(text.length).toBeGreaterThan(40_000)
    const pieces: ContractEvent[] = []
    for (let at = 0; at < text.length; at += 997) pieces.push(prose('w', 'prd.md', text.slice(at, at + 997)))
    const events = [started, ...pieces, committed('w', ['A']), { name: 'run:finished', payload: { ...R, at: 200 } } as ContractEvent]

    const live = fold(events)
    expect(windowCard(live.state, live.store, 'r1')).toEqual(mainCard(events, 'r1'))
    expect(live.store.get('r1')?.text).toBe(text)
  })

  it('agrees on the subject on both sides, after every event of a run that writes several files', () => {
    const events = SEQUENCES.find(([label]) => label.startsWith('two paths'))?.[1] ?? []
    const subjects: (string | undefined)[] = []
    for (let cut = 1; cut <= events.length; cut += 1) {
      const live = fold(events.slice(0, cut))
      const main = mainCard(events.slice(0, cut), 'r1')
      expect(live.store.get('r1')?.path, `cut at ${cut}`).toBe(subjectOf(main?.documents ?? [])?.path)
      subjects.push(live.store.get('r1')?.path)
    }
    // The addendum until the PRD's one Write passes it, then the PRD to the end.
    expect(subjects).toEqual([undefined, 'addendum.md', 'addendum.md', 'addendum.md', 'addendum.md', 'prd.md', ...Array(7).fill('prd.md')])
    expect(fold(events).store.get('r1')?.text).toBe('short')
  })
})

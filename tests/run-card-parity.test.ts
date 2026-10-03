import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { RunCardSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
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

/** The window's card: the transcript entry, and its prose from the store. */
function windowCard(state: ConversationState, prose: ProseStore, runId: string): Card | undefined {
  const entry = state.entries.find((each) => each.kind === 'run' && each.runId === runId)
  if (entry === undefined || entry.kind !== 'run') return undefined
  const { at, notes, sections, sessionId, status } = entry
  return {
    runId: entry.runId,
    sessionId,
    ...(entry.agentId === undefined ? {} : { agentId: entry.agentId }),
    startedAt: at,
    status,
    ...(entry.endedAt === undefined ? {} : { endedAt: entry.endedAt }),
    ...(entry.error === undefined ? {} : { error: entry.error }),
    notes: [...notes],
    sections: [...sections],
    prose: prose.get(runId) ?? null
  }
}

/** Fold events as the window does: prose to the store, everything else through `foldEvent`. */
function fold(events: ContractEvent[], from: ConversationState = initialConversation, store = createProseStore({ raf: (run) => run() })) {
  let state = from
  for (const event of events) {
    if (event.name === 'doc:prose') {
      store.append(event.payload.runId, event.payload.callId, event.payload.path, event.payload.text)
    } else {
      state = foldEvent(state, event, () => undefined).state
    }
  }
  return { state, store }
}

const R = { runId: 'r1', sessionId: 's1' }
const started: ContractEvent = { name: 'run:started', payload: { ...R, agentId: 'bmad-agent-pm', code: 'CP', at: 100 } }
const note = (text: string, at: number): ContractEvent => ({ name: 'run:note', payload: { ...R, text, at } })
const prose = (callId: string, path: string, text: string): ContractEvent => ({
  name: 'doc:prose',
  payload: { ...R, callId, path, text, at: 110 }
})
const committed = (callId: string, sections: string[]): ContractEvent => ({
  name: 'doc:committed',
  payload: { ...R, ok: true, callId, path: 'prd.md', sections, at: 120 }
})
const rejected = (callId: string): ContractEvent => ({
  name: 'doc:committed',
  payload: { ...R, ok: false, callId, path: 'prd.md', error: { code: 'doc/write-rejected', message: 'doc · the write was rejected' }, at: 121 }
})

const SEQUENCES: [string, ContractEvent[]][] = [
  ['a card just born', [started]],
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
      for (const card of snapshot.runs) store.seed(card.runId, card.prose)
      const hydrated = hydrate(initialConversation, snapshot, () => undefined).state
      const after = fold(events.slice(cut), hydrated, store)

      expect(windowCard(after.state, after.store, 'r1'), `cut at ${cut}`).toEqual(mainCard(events, 'r1'))
    }
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
})

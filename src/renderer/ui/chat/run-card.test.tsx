import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { createProseStore } from './prose-store'
import { RunCard } from './run-card'
import type { RunCardEntry } from './transcript-entry'

const card = (over: Partial<RunCardEntry> = {}): RunCardEntry => ({
  kind: 'run',
  id: 'r1',
  at: Date.now(),
  runId: 'r1',
  sessionId: 's1',
  agentId: 'bmad-agent-pm',
  status: 'running',
  notes: [],
  sections: [],
  ...over
})

function draw(entry: RunCardEntry, prose?: { callId: string; path: string; text: string }): string {
  const store = createProseStore({ raf: (run) => run() })
  if (prose !== undefined) store.seed(entry.runId, prose)
  return renderToStaticMarkup(<RunCard entry={entry} prose={store} />)
}

/** The words a card shows, tags removed. */
const words = (markup: string): string[] =>
  markup
    .replace(/<[^>]*>/g, '|')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part !== '')

const STAND_IN =
  /\b(?:loading|resolving|scanning|fetching|connecting|initiali[sz]ing|please wait|spinner|skeleton|shimmer|thinking|typing|waiting|processing|preparing|in progress|one moment)\b|\.\.\.|…|%|\bof\b/i

describe('a card just born', () => {
  const markup = draw(card())

  it('is busy while its run is in flight, with the feed mounted and no rows, and no text standing in', () => {
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('<div class="run-note-feed"></div>')
    expect(markup).not.toContain('class="run-note"')
    expect(words(markup)).toEqual(['writing', '0s'])
    expect(markup).not.toMatch(STAND_IN)
  })

  it('draws no spinner, skeleton, progress bar or caret before any prose', () => {
    expect(markup).not.toMatch(/<progress|role="progressbar"|aria-valuenow|run-card-caret|skeleton|spinner/)
    expect(markup).toMatch(/<div class="run-card-prose" hidden="">/)
  })
})

describe('a card with notes and prose', () => {
  const entry = card({ notes: [{ text: '- (decision) **Fast** path', at: Date.UTC(2026, 9, 3, 9, 7) }] })
  const markup = draw(entry, { callId: 'c1', path: '_bmad/prds/x/prd.md', text: '# PRD\n## Vision' })

  it('shows the path in the head and the note in the feed, with the caret at the tail of prose', () => {
    expect(markup).toContain('<span class="run-card-path">_bmad/prds/x/prd.md</span>')
    expect(markup).toContain('run-note-kind--accent')
    expect(markup).toContain('<strong>Fast</strong>')
    expect(markup).toContain('<span class="run-card-caret" aria-hidden="true"></span>')
    expect(markup).not.toMatch(/<div class="run-card-prose" hidden/)
  })

  it('keeps notes above prose in the same scroll container, with nothing between them', () => {
    const body = markup.slice(markup.indexOf('<div class="run-card-body">'))
    expect(body.indexOf('run-note-feed')).toBeLessThan(body.indexOf('run-card-prose'))
    expect(body).not.toMatch(/<hr|role="separator"|run-card-divider/)
  })
})

describe('a finished card', () => {
  const now = Date.now()
  const markup = draw(card({ at: now - 65_000, status: 'finished', endedAt: now, sections: ['A', 'B', 'C'] }), {
    callId: 'c1',
    path: 'prd.md',
    text: '## A'
  })

  it('reads saved · just now · N sections, with the elapsed fixed and the caret removed', () => {
    expect(markup).toContain('<span class="run-card-status run-card-status--finished">saved · just now · 3 sections</span>')
    expect(markup).toContain('<span class="run-card-elapsed">1m 05s</span>')
    expect(markup).not.toContain('run-card-caret')
    expect(markup).not.toContain('aria-busy')
    expect(markup).toContain('status-dot--live')
  })
})

describe('a failed card', () => {
  it('reads failed, with the error dot and no error text', () => {
    const at = Date.now()
    const markup = draw(card({ at, status: 'failed', endedAt: at + 1000, error: { code: 'run/failed', message: 'run · the run failed' } }))
    expect(words(markup)).toEqual(['failed', '1s'])
    expect(markup).toContain('status-dot--error')
    expect(markup).not.toContain('run · the run failed')
  })
})

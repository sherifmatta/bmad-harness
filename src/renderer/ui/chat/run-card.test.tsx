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
  documents: [],
  ...over
})

type Held = { callId: string; path: string; text: string; written?: number }

function draw(entry: RunCardEntry, ...held: Held[]): string {
  const store = createProseStore({ raf: (run) => run() })
  store.seed(
    entry.runId,
    held.map(({ callId, path, text, written }) => ({ callId, path, text, written: written ?? text.length, sections: [] }))
  )
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

  it('is busy while its run is in flight, with the start row as its whole body and no text standing in', () => {
    expect(markup).toContain('aria-busy="true"')
    expect(markup.match(/class="run-note"/g)).toHaveLength(1)
    expect(markup).toContain('<span class="run-note-reason">run started</span>')
    expect(markup).toContain('<span class="run-note-kind run-note-kind--neutral"></span>')
    expect(markup).not.toMatch(STAND_IN)
  })

  it('has no status in its head: the path (empty), then the elapsed time', () => {
    const head = markup.slice(markup.indexOf('<div class="run-card-head">'), markup.indexOf('<div class="run-card-body">'))
    expect(head).not.toContain('run-card-status')
    expect(words(head)).toEqual(['0s'])
  })

  it('reads `0 words on disk` and `autosave on` in its foot, before any named section', () => {
    const foot = markup.slice(markup.indexOf('<div class="run-card-foot">'))
    expect(words(foot)).toEqual(['0 words on disk · autosave on'])
  })

  it('puts the phrases before the count and the names, then the other files', () => {
    const entry = card({ plan: ['Vision', 'Scope'] })
    const foot = draw(entry)
    const tail = foot.slice(foot.indexOf('<div class="run-card-foot">'))
    expect(words(tail)).toEqual(['0 words on disk · autosave on', '2 to write', 'Vision', 'Scope'])
  })

  it('draws no spinner, skeleton, progress bar or caret before any prose', () => {
    expect(markup).not.toMatch(/<progress|role="progressbar"|aria-valuenow|run-card-caret|skeleton|spinner/)
    expect(markup).toMatch(/<div class="run-card-prose" hidden="">/)
  })
})

describe('a card in dead air with notes', () => {
  it('shows the start row, then each note in order, and the dead-air foot', () => {
    const entry = card({
      notes: [
        { text: '- (decision) First', at: Date.UTC(2026, 9, 3, 9, 7) },
        { text: '- (open) Second', at: Date.UTC(2026, 9, 3, 9, 9) },
        { text: '- (assumption) Third', at: Date.UTC(2026, 9, 3, 9, 12) }
      ]
    })
    const markup = draw(entry)
    const reasons = [...markup.matchAll(/<span class="run-note-reason">(.*?)<\/span>/g)].map((match) => match[1])
    expect(reasons).toEqual(['run started', 'First', 'Second', 'Third'])
    expect(words(markup.slice(markup.indexOf('<div class="run-card-foot">')))).toEqual(['0 words on disk · autosave on'])
  })
})

describe('a card once prose is held', () => {
  const markup = draw(card(), { callId: 'c1', path: 'prd.md', text: '## Vision\n' })

  it('reads writing in the head, keeps the start row above the prose, and drops the two phrases from its foot', () => {
    expect(words(markup)).toContain('writing · §1 Vision')
    expect(markup).not.toContain('0 words on disk')
    expect(markup).not.toContain('autosave on')
    expect(markup.indexOf('run started')).toBeLessThan(markup.indexOf('run-card-prose'))
  })
})

describe('a terminal card', () => {
  it('keeps the start row and its notes, and never the dead-air foot', () => {
    for (const status of ['finished', 'failed', 'stopped'] as const) {
      const markup = draw(card({ status, endedAt: Date.now() + 1000, notes: [{ text: '- (decision) Kept', at: 1 }] }))
      expect(markup).toContain('run started')
      expect(markup).toContain('Kept')
      expect(markup).not.toContain('0 words on disk')
      expect(markup).not.toContain('autosave on')
    }
  })
})

describe('a card with notes and prose', () => {
  const entry = card({ notes: [{ text: '- (decision) **Fast** path', at: Date.UTC(2026, 9, 3, 9, 7) }] })
  const markup = draw(entry, { callId: 'c1', path: '_bmad/prds/x/prd.md', text: '# PRD\n## Vision\n' })

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

  it('names no other file in its foot while it holds one document', () => {
    expect(markup).not.toContain('also written')
    expect(markup).not.toContain('run-card-foot-path')
  })

  it('reads the section being written in its head, and lists the one it has seen but not had committed in its foot', () => {
    expect(words(markup)).toContain('writing · §1 Vision')
    expect(words(markup)).toContain('1 to write')
  })
})

describe('a card whose run wrote several files', () => {
  const now = Date.now()
  const entry = card({
    at: now - 1000,
    status: 'finished',
    endedAt: now,
    documents: [
      { path: 'addendum.md', sections: ['One', 'Two', 'Three', 'Four'] },
      { path: 'prd.md', sections: ['Vision', 'Scope'] }
    ]
  })
  const markup = draw(
    entry,
    { callId: 'c1', path: 'addendum.md', text: 'ADDENDUM', written: 3000 },
    { callId: 'e1', path: 'prd.md', text: '## Vision\n## Scope', written: 5000 },
    { callId: 'e2', path: '_bmad/copy.md', text: '', written: 0 }
  )

  it('shows only the subject in the head and the body, and counts its sections alone', () => {
    // The body's text is written once a frame, after mounting (`run-card.dom.test.tsx`); the other file's never is.
    expect(markup).toContain('<span class="run-card-path">prd.md</span>')
    expect(markup).not.toContain('ADDENDUM')
    expect(markup).toContain('saved · just now · 2 sections')
  })

  it('names every other file in the foot, after the body, and in no live region', () => {
    const foot = markup.slice(markup.indexOf('<div class="run-card-foot">'))
    expect(markup.indexOf('run-card-foot')).toBeGreaterThan(markup.indexOf('run-card-body'))
    expect(words(foot)).toEqual(['also written', 'addendum.md', '_bmad/copy.md'])
    expect(foot).not.toMatch(/\baria-|role=/)
  })
})

describe('a finished card', () => {
  const now = Date.now()
  const markup = draw(card({ at: now - 65_000, status: 'finished', endedAt: now, documents: [{ path: 'prd.md', sections: ['A', 'B', 'C'] }] }), {
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
    // The start row stays: a terminal card is never empty either.
    expect(words(markup)).toEqual(['failed', '1s', expect.stringMatching(/^\d{2}:\d{2}$/), 'run started'])
    expect(markup).not.toContain('run-card-foot')
    expect(markup).toContain('status-dot--error')
    expect(markup).not.toContain('run · the run failed')
  })
})

describe('a card that ended early with a confirmed write (Story 3.8)', () => {
  const PRD = '_bmad/prd.md'
  const TEXT = '## Vision\nA.\n## Goals\nB.\n## Scope\nC.\n'
  /** The card as main holds it after a stop: the subject's last `ok` commit named two sections. */
  const ended = (status: 'stopped' | 'failed', sections: string[]): RunCardEntry => {
    const at = Date.now()
    return card({ at, status, endedAt: at + 1000, plan: ['Vision', 'Goals', 'Scope'], documents: [{ path: PRD, sections }] })
  }

  it.each([
    ['stopped', 'stopped · §2 Goals'],
    ['failed', 'failed · §2 Goals']
  ] as const)('%s names the section its last confirmed write reached, and keeps no foot', (status, head) => {
    const markup = draw(ended(status, ['Vision', 'Goals']), { callId: 'c1', path: PRD, text: TEXT })

    expect(markup).toContain(`<span class="run-card-status run-card-status--${status}">${head}</span>`)
    // No foot at all: a terminal card names nothing still to write and no other file.
    expect(markup).not.toContain('run-card-foot')
    expect(markup).not.toContain('run-card-caret')
    expect(markup).not.toContain('aria-busy')
    expect(markup).toContain('status-dot--error')
    expect(markup).not.toMatch(STAND_IN)
  })

  it('names the commit’s last section, never the one the streamed text had reached', () => {
    // The text held streams as far as §3 Scope; the commit confirmed two names.
    const markup = draw(ended('stopped', ['Vision', 'Goals']), { callId: 'c1', path: PRD, text: TEXT })

    expect(markup).toContain('stopped · §2 Goals')
    expect(markup).not.toContain('§3 Scope')
  })

  it('reads the bare word when the write never came back', () => {
    const markup = draw(ended('stopped', []), { callId: 'c1', path: PRD, text: TEXT })

    expect(markup).toContain('<span class="run-card-status run-card-status--stopped">stopped</span>')
    expect(markup).not.toContain('§')
    expect(markup).not.toContain('run-card-foot')
  })
})

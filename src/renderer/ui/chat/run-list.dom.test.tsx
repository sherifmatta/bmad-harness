// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { RunCardStep } from '../../../shared/conversation'
import { LIVE_REGIONS } from '../testing/audit-patterns'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { RunList } from './run-list'
import type { RunCardEntry } from './transcript-entry'

const card = (over: Partial<RunCardEntry> = {}): RunCardEntry => ({
  kind: 'run',
  id: 'r1',
  at: Date.UTC(2026, 9, 3, 9, 0),
  runId: 'r1',
  sessionId: 's1',
  status: 'running',
  notes: [],
  steps: [],
  documents: [],
  ...over
})

const step = (callId: string, over: Partial<RunCardStep> = {}): RunCardStep => ({
  callId,
  label: `read ${callId}`,
  status: 'done',
  startedAt: 0,
  endedAt: 3_000,
  notesBefore: 0,
  ...over
})

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
})

function draw(entry: RunCardEntry): HTMLElement {
  mounted?.unmount()
  mounted = mount(createElement(RunList, { entry }))
  return mounted.container
}

const rows = (root: HTMLElement): Element[] => [...(root.querySelector('.run-note-feed')?.children ?? [])]
const cells = (row: Element): string[] => [...row.children].map((cell) => cell.textContent ?? '')

describe('the run list', () => {
  it('keeps the run-note feed’s class and draws the start row first, as a note', () => {
    const root = draw(card({ steps: [step('a')] }))
    const [first, second] = rows(root)
    expect(first.className).toBe('run-note')
    expect(cells(first)[2]).toBe('run started')
    expect(second.classList.contains('run-step')).toBe(true)
  })

  it('draws the start row alone for a card holding neither notes nor steps, and the notes alone with no step', () => {
    expect(rows(draw(card())).map((row) => row.className)).toEqual(['run-note'])
    const root = draw(card({ notes: [{ text: '- (decision) One', at: 1_000 }] }))
    expect(rows(root).map((row) => row.className)).toEqual(['run-note', 'run-note'])
    expect(root.querySelector('.run-step')).toBeNull()
  })

  it('draws a note between the steps it fell among, with its tag, unchanged', () => {
    const root = draw(
      card({
        notes: [
          { text: '- (decision) **Chose** one', at: 1_000 },
          { text: '- (open) Second', at: 2_000 }
        ],
        steps: [step('s0', { notesBefore: 0 }), step('s1', { notesBefore: 1 }), step('s2', { notesBefore: 2 })]
      })
    )
    expect(rows(root).map((row) => (row.classList.contains('run-step') ? cells(row)[1] : cells(row)[2]))).toEqual([
      'run started',
      'read s0',
      'Chose one',
      'read s1',
      'Second',
      'read s2'
    ])
    expect(root.querySelector('.run-note-kind--accent')?.textContent).toBe('decision')
    expect(root.querySelector('.run-note-reason strong')?.textContent).toBe('Chose')
  })

  it('draws a done step as ✓, the label and the duration as m:ss', () => {
    const root = draw(card({ steps: [step('a', { endedAt: 3_000 }), step('b', { endedAt: 65_000 }), step('c', { endedAt: 3_725_000 })] }))
    const done = [...root.querySelectorAll('.run-step--done')]
    expect(done.map(cells)).toEqual([
      ['✓', 'read a', '0:03'],
      ['✓', 'read b', '1:05'],
      ['✓', 'read c', '1:02:05']
    ])
    expect(root.querySelector('.run-step .status-dot')).toBeNull()
  })

  it('draws a failed step as ✕ with its duration', () => {
    const root = draw(card({ steps: [step('a', { status: 'failed', endedAt: 2_000 })] }))
    expect(cells(root.querySelector('.run-step--failed') as Element)).toEqual(['✕', 'read a', '0:02'])
  })

  it('draws a running step on a running card as the work dot, with now for its elapsed', () => {
    const root = draw(card({ steps: [step('a', { status: 'running', endedAt: undefined })] }))
    const row = root.querySelector('.run-step--running') as Element
    expect(cells(row)).toEqual(['', 'read a', 'now'])
    const dot = row.querySelector('.status-dot')
    expect(dot?.classList.contains('status-dot--work')).toBe(true)
    expect(dot?.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws a step still running on a card that is not as ✕, with no dot and no now', () => {
    for (const status of ['failed', 'stopped', 'finished'] as const) {
      const root = draw(card({ status, endedAt: 9_000, steps: [step('a', { status: 'running', endedAt: undefined, startedAt: 1_000 })] }))
      const row = root.querySelector('.run-step') as Element
      expect(row.classList.contains('run-step--failed')).toBe(true)
      expect(cells(row)).toEqual(['✕', 'read a', '0:08'])
      expect(root.querySelector('.status-dot')).toBeNull()
    }
  })

  it('draws what the card holds and says nothing of more: 300 steps are 300 rows, with no count, mark or sentence beside them', () => {
    const many = Array.from({ length: 300 }, (_, at) => step(`c${at}`, { notesBefore: 0 }))
    const root = draw(card({ steps: many }))
    expect(root.querySelectorAll('.run-step')).toHaveLength(300)
    expect(root.textContent).not.toMatch(/earlier|more|\d+ of\b|\bpending\b|\bnext\b/i)
  })

  it('gives a step row no tab stop, role or live region, and three cells', () => {
    const root = draw(card({ steps: [step('a'), step('b', { status: 'running', endedAt: undefined })] }))
    for (const row of root.querySelectorAll('.run-step')) {
      expect(row.getAttribute('tabindex')).toBeNull()
      expect(row.getAttribute('role')).toBeNull()
      expect(row.querySelector(`[tabindex], [role], ${LIVE_REGIONS}, button, a`)).toBeNull()
      expect(row.children).toHaveLength(3)
    }
    expect(root.querySelector(LIVE_REGIONS)).toBeNull()
  })
})

// @vitest-environment jsdom
import { Profiler, act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { createProseStore } from './prose-store'
import type { ProseStore } from './prose-store'
import { RunCard } from './run-card'
import { SkillRow } from './skill-row'
import type { RunCardEntry } from './transcript-entry'

/** A frame that runs only when the test turns the crank, as the window's would once a refresh. */
function crank() {
  const pending: (() => void)[] = []
  return {
    raf: (callback: () => void) => void pending.push(callback),
    frame: () => act(() => pending.splice(0).forEach((callback) => callback()))
  }
}

const card = (over: Partial<RunCardEntry> = {}): RunCardEntry => ({
  kind: 'run',
  id: 'r1',
  at: Date.now(),
  runId: 'r1',
  sessionId: 's1',
  status: 'running',
  notes: [],
  documents: [],
  ...over
})

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
})

function draw(store: ProseStore, entry: RunCardEntry = card()) {
  let commits = 0
  const element = (next: RunCardEntry) =>
    createElement(Profiler, { id: 'card', onRender: () => void (commits += 1) }, createElement(RunCard, { entry: next, prose: store }))
  const root = mount(element(entry))
  mounted = root
  const text = (): string => root.container.querySelector('.run-card-text')?.textContent ?? ''
  return {
    root,
    text,
    commits: () => commits,
    rerender: (next: RunCardEntry) => {
      // A fresh mount stands in for React's own re-render with new props.
      root.unmount()
      return draw(store, next)
    }
  }
}

describe('the run card’s prose', () => {
  it('applies thousands of pieces with one DOM write per frame and no React render per piece', () => {
    const frames = crank()
    const store = createProseStore(frames)
    const view = draw(store)
    const node = view.root.container.querySelector('.run-card-text') as HTMLElement
    const observer = new MutationObserver(() => {})
    observer.observe(node, { characterData: true, childList: true, subtree: true })
    const before = view.commits()

    const pieces = Array.from({ length: 3947 }, (_, at) => `piece ${at}\n`)
    const writes: number[] = []
    for (let at = 0; at < pieces.length; at += 1) {
      store.append('r1', 'c1', '_bmad/prd.md', pieces[at])
      // A frame every 40 pieces: many pieces arrive between two refreshes.
      if (at % 40 === 39 || at === pieces.length - 1) {
        frames.frame()
        writes.push(observer.takeRecords().length)
      }
    }

    expect(view.text()).toBe(pieces.join(''))
    expect(writes.every((count) => count === 1)).toBe(true)
    // React renders once, when the card first has text and a path, and never again for a piece.
    expect(view.commits() - before).toBe(1)
    expect(view.root.container.querySelector('.run-card-path')?.textContent).toBe('_bmad/prd.md')
    observer.disconnect()
  })

  it('starts the text again when a new Write of the path begins, and draws the whole document an Edit commits', () => {
    const frames = crank()
    const store = createProseStore(frames)
    const view = draw(store)
    store.append('r1', 'c1', 'a.md', 'first write')
    frames.frame()
    store.append('r1', 'c2', 'a.md', 'revision')
    frames.frame()
    expect(view.text()).toBe('revision')
    store.commit('r1', 'a.md', 'e1', 'revision, patched whole')
    frames.frame()
    expect(view.text()).toBe('revision, patched whole')
  })

  it('stays on its subject until another file’s Write passes it, then switches head and body, naming the first in the foot', () => {
    const frames = crank()
    const store = createProseStore(frames)
    const view = draw(store)
    const path = (): string | null | undefined => view.root.container.querySelector('.run-card-path')?.textContent
    const foot = (): string | null | undefined => view.root.container.querySelector('.run-card-foot')?.textContent
    store.append('r1', 'c1', 'addendum.md', 'a'.repeat(30))
    frames.frame()
    expect(foot()).toBeUndefined()
    store.append('r1', 'c2', 'prd.md', 'p'.repeat(30))
    frames.frame()
    expect(path()).toBe('addendum.md')
    expect(view.text()).toBe('a'.repeat(30))
    expect(foot()).toBe('also writtenprd.md')
    store.append('r1', 'c2', 'prd.md', 'p')
    frames.frame()
    expect(path()).toBe('prd.md')
    expect(view.text()).toBe('p'.repeat(31))
    expect(foot()).toBe('also writtenaddendum.md')
    // An Edit of the other file never touches the body.
    store.commit('r1', 'addendum.md', 'e1', 'patched')
    frames.frame()
    expect(view.text()).toBe('p'.repeat(31))
  })

  it('draws the whole text on mounting after a reload, having seen none of its pieces', () => {
    const frames = crank()
    const store = createProseStore(frames)
    store.seed('r1', [{ callId: 'c1', path: 'a.md', text: '## Vision\nwhole', written: 15, sections: ['Vision'] }])
    const view = draw(store)
    expect(view.text()).toBe('## Vision\nwhole')
    expect(view.root.container.querySelector('.run-card-caret')).not.toBeNull()
  })

  it('removes the caret, rather than fading it, when the run finishes, and drops aria-busy', () => {
    const frames = crank()
    const store = createProseStore(frames)
    store.seed('r1', [{ callId: 'c1', path: 'a.md', text: 'text', written: 4, sections: ['A'] }])
    const running = draw(store)
    expect(running.root.container.querySelector('section')?.getAttribute('aria-busy')).toBe('true')
    const finished = running.rerender(card({ status: 'finished', endedAt: Date.now(), documents: [{ path: 'a.md', sections: ['A'] }] }))
    expect(finished.root.container.querySelector('.run-card-caret')).toBeNull()
    expect(finished.root.container.querySelector('section')?.hasAttribute('aria-busy')).toBe(false)
    expect(finished.root.container.querySelector('.run-card-status')?.textContent).toBe('saved · just now · 1 section')
  })
})

describe('the run card’s focus, when it replaces a line (Story 3.5)', () => {
  const drawFocusing = (props: { focusOnMount?: boolean; onFocused?: () => void }) => {
    const container = document.createElement('div')
    document.body.append(container)
    const root: Root = createRoot(container)
    const render = (next: { focusOnMount?: boolean; onFocused?: () => void }): void =>
      act(() => root.render(createElement(RunCard, { entry: card(), prose: createProseStore(crank()), ...next })))
    render(props)
    return {
      container,
      render,
      stop: () => {
        act(() => root.unmount())
        container.remove()
      }
    }
  }
  let view: ReturnType<typeof drawFocusing> | null = null
  afterEach(() => {
    view?.stop()
    view = null
  })

  it('takes focus on its container as it mounts, with a tabindex of -1, and puts none on a control', () => {
    view = drawFocusing({ focusOnMount: true })
    const section = view.container.querySelector('section.run-card')
    expect(section?.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(section)
    expect(section?.querySelectorAll('button, a, input, [tabindex]:not(section)')).toHaveLength(0)
  })

  it('takes no focus, and has no tabindex, when it is drawn any other way', () => {
    view = drawFocusing({})
    const section = view.container.querySelector('section.run-card')
    expect(section?.hasAttribute('tabindex')).toBe(false)
    expect(document.activeElement).toBe(document.body)

    view.render({ focusOnMount: false })
    expect(document.activeElement).toBe(document.body)
  })

  it('says once that it took focus, and not again however it renders after', () => {
    const calls: number[] = []
    const onFocused = (): void => void calls.push(calls.length)
    view = drawFocusing({ focusOnMount: true, onFocused })
    expect(calls).toHaveLength(1)
    view.render({ focusOnMount: true, onFocused })
    view.render({ focusOnMount: false, onFocused: () => void calls.push(-1) })
    expect(calls).toEqual([0])
  })

  it('asks for focus on mounting alone: a card already drawn is not moved to by a later request, nor off by a spent one', () => {
    view = drawFocusing({})
    view.render({ focusOnMount: true })
    expect(document.activeElement).toBe(document.body)
    expect(view.container.querySelector('section.run-card')?.hasAttribute('tabindex')).toBe(false)

    view.stop()
    view = drawFocusing({ focusOnMount: true })
    const section = view.container.querySelector('section.run-card')
    view.render({ focusOnMount: false })
    // The request is spent, and the card keeps the focus and the tabindex that hold it.
    expect(section?.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(section)
  })
})

describe('the skill row’s buttons', () => {
  it('hand their code, and nothing else, to the one callback; a disabled one hands nothing', () => {
    const ran: unknown[][] = []
    const items = [
      { code: 'CP', description: 'Create the PRD' },
      { code: 'VP', description: 'Validate a PRD' }
    ]
    mounted = mount(createElement(SkillRow, { name: 'John', items, disabled: false, onRun: (...args: unknown[]) => void ran.push(args) }))
    const buttons = [...mounted.container.querySelectorAll('button')]
    act(() => buttons[1].click())
    expect(ran).toEqual([['VP']])

    mounted.unmount()
    mounted = mount(createElement(SkillRow, { name: 'John', items, disabled: true, onRun: (...args: unknown[]) => void ran.push(args) }))
    act(() => mounted?.container.querySelector('button')?.click())
    expect(ran).toEqual([['VP']])
  })
})

const PRD_PLAN = [
  'Document Purpose',
  'Vision',
  'Target User',
  'Glossary',
  'Features',
  'Non-Goals (Explicit)',
  'MVP Scope',
  'Success Metrics',
  'Open Questions',
  'Assumptions Index'
]

/** A card mounted once, re-rendered in place with new props, as React does when the conversation state changes. */
function drawLive(store: ProseStore, first: RunCardEntry) {
  const container = document.createElement('div')
  document.body.append(container)
  const root: Root = createRoot(container)
  let commits = 0
  const render = (entry: RunCardEntry): void =>
    act(() =>
      root.render(
        createElement(Profiler, { id: 'card', onRender: () => void (commits += 1) }, createElement(RunCard, { entry, prose: store }))
      )
    )
  render(first)
  return {
    container,
    render,
    commits: () => commits,
    head: (): string => container.querySelector('.run-card-status')?.textContent ?? '',
    foot: (): string[] => [...container.querySelectorAll('.run-card-foot-name')].map((node) => node.textContent ?? ''),
    count: (): string | undefined => container.querySelector('.run-card-foot-count')?.textContent ?? undefined,
    stop: () => {
      act(() => root.unmount())
      container.remove()
    }
  }
}

describe('progress against a plan (Story 3.3)', () => {
  let live: ReturnType<typeof drawLive> | null = null
  afterEach(() => {
    live?.stop()
    live = null
  })

  const planned = (over: Partial<RunCardEntry> = {}): RunCardEntry => card({ plan: PRD_PLAN, ...over })

  it('lists all ten planned sections by name, with a count, before any prose, and reads no status in the head', () => {
    live = drawLive(createProseStore(crank()), planned())
    expect(live.head()).toBe('')
    expect(live.count()).toBe('10 to write')
    expect(live.foot()).toEqual(PRD_PLAN)
  })

  it('reads the section being written from the streamed text: the fourth seen is §4, numbering stripped', () => {
    const frames = crank()
    const store = createProseStore(frames)
    live = drawLive(store, planned())
    store.append('r1', 'c1', 'prd.md', '# PRD\n\n## 0. Document Purpose\nx\n## 1. Vision\ny\n## 2. Target User\nz\n')
    frames.frame()
    expect(live.head()).toBe('writing · §3 Target User')
    store.append('r1', 'c1', 'prd.md', '## 3. Glossary\nterms')
    frames.frame()
    expect(live.head()).toBe('writing · §4 Glossary')
    // Streaming alone removes nothing from the foot: only a confirmed commit does.
    expect(live.foot()).toEqual(PRD_PLAN)
    expect(live.count()).toBe('10 to write')
  })

  it('re-renders the head only when its words change, not for each piece of prose', () => {
    const frames = crank()
    const store = createProseStore(frames)
    live = drawLive(store, planned())
    store.append('r1', 'c1', 'prd.md', '## 0. Document Purpose\n')
    frames.frame()
    const before = live.commits()
    for (let at = 0; at < 300; at += 1) {
      store.append('r1', 'c1', 'prd.md', `more words ${at} `)
      if (at % 20 === 19) frames.frame()
    }
    expect(live.head()).toBe('writing · §1 Document Purpose')
    expect(live.commits() - before).toBe(0)
  })

  it('appends a heading the plan lacks to the foot after the plan’s names, and never renumbers', () => {
    const frames = crank()
    const store = createProseStore(frames)
    live = drawLive(store, planned())
    store.append('r1', 'c1', 'prd.md', '## 0. Document Purpose\n## Risks\nx\n## 1. Vision\n')
    frames.frame()
    expect(live.head()).toBe('writing · §3 Vision')
    expect(live.foot()).toEqual([...PRD_PLAN, 'Risks'])
    expect(live.count()).toBe('11 to write')
  })

  it('takes every name an atomic commit lists out of the foot in one render, fifteen of them, with no stagger', () => {
    const frames = crank()
    const store = createProseStore(frames)
    const plan = Array.from({ length: 15 }, (_, at) => `Section ${at + 1}`)
    const text = plan.map((name, at) => `## ${at + 1}. ${name}\nwords`).join('\n') + '\n'
    live = drawLive(store, card({ plan }))
    store.append('r1', 'c1', 'prd.md', text)
    frames.frame()
    expect(live.foot()).toHaveLength(15)
    const observer = new MutationObserver(() => {})
    observer.observe(live.container, { childList: true, characterData: true, subtree: true, attributes: true })
    const before = live.commits()
    const footBefore = live.container.querySelector('.run-card-foot')
    expect(footBefore?.querySelectorAll('.run-card-foot-name')).toHaveLength(15)

    live.render(card({ plan, documents: [{ path: 'prd.md', sections: plan.map((name, at) => `${at + 1}. ${name}`) }] }))

    expect(live.commits() - before).toBe(1)
    // All fifteen leave as one removal of the foot that held them: no record touches a name on its own.
    const records = observer.takeRecords()
    expect(records.flatMap((record) => [...record.removedNodes])).toContain(footBefore)
    expect(records.filter((record) => footBefore?.contains(record.target) && record.target !== footBefore)).toEqual([])
    expect(live.foot()).toEqual([])
    expect(live.count()).toBeUndefined()
    observer.disconnect()
  })

  it('keeps a planned name in the foot until a commit names it, matching without regard to case or numbering', () => {
    const store = createProseStore(crank())
    live = drawLive(store, planned())
    live.render(planned({ documents: [{ path: 'prd.md', sections: ['0. document purpose', '1. Vision'] }] }))
    // Nothing is written until a subject exists, though: the plan is for the subject's own commits.
    expect(live.foot()).toEqual(PRD_PLAN)
    store.append('r1', 'c1', 'prd.md', '## 0. Document Purpose\n## 1. Vision\n## 2. Target User\n')
    live.render(planned({ documents: [{ path: 'prd.md', sections: ['0. document purpose', '1. Vision'] }] }))
    expect(live.foot()).toEqual(PRD_PLAN.slice(2))
    expect(live.count()).toBe('8 to write')
  })

  it('reads `revising · §N <Name>` after an applied Edit, and `writing` again at the next Write piece', () => {
    const frames = crank()
    const store = createProseStore(frames)
    live = drawLive(store, planned())
    store.append('r1', 'c1', 'prd.md', '## 0. Purpose\nold\n## 1. Vision\nwords\n')
    frames.frame()
    store.commit('r1', 'prd.md', 'e1', '## 0. Purpose\nnew\n## 1. Vision\nwords\n')
    frames.frame()
    expect(live.head()).toBe('revising · §1 Purpose')
    store.append('r1', 'c2', 'prd.md', '## 0. Purpose\n## 1. Vision\n## 2. Next\n')
    frames.frame()
    expect(live.head()).toBe('writing · §3 Next')
  })

  it('draws a reload’s card whole from the plan and the seeded text, having seen none of the pieces', () => {
    const store = createProseStore(crank())
    store.seed('r1', [
      { path: 'prd.md', callId: 'c1', text: '## 0. Document Purpose\nx\n## 1. Vision\ny', written: 40, sections: ['Document Purpose'] }
    ])
    live = drawLive(store, planned({ documents: [{ path: 'prd.md', sections: ['0. Document Purpose'] }] }))
    expect(live.head()).toBe('writing · §2 Vision')
    expect(live.foot()).toEqual(PRD_PLAN.slice(1))
  })

  it('shows a saved card’s head as before, with no sections still to write in its foot', () => {
    const store = createProseStore(crank())
    store.seed('r1', [{ path: 'prd.md', callId: 'c1', text: '## Vision\nx', written: 12, sections: ['Vision'] }])
    live = drawLive(
      store,
      planned({ status: 'finished', endedAt: Date.now(), documents: [{ path: 'prd.md', sections: ['Vision'] }] })
    )
    expect(live.head()).toBe('saved · just now · 1 section')
    expect(live.container.querySelector('.run-card-foot')).toBeNull()
  })

  it('holds the foot and the head to no denominator, bar or per-section tick, in any state it draws', () => {
    const frames = crank()
    const store = createProseStore(frames)
    live = drawLive(store, planned())
    for (const text of ['', '## 0. Document Purpose\nx', '\n## 1. Vision\ny']) {
      store.append('r1', 'c1', 'prd.md', text)
      frames.frame()
      const markup = live.container.innerHTML
      expect(markup).not.toMatch(/\bof\b|\/\s*\d|%|<progress|role="progressbar"|aria-valuenow|style=/i)
    }
  })
})

describe('the card is never empty (Story 3.4)', () => {
  let live: ReturnType<typeof drawLive> | null = null
  afterEach(() => {
    live?.stop()
    live = null
  })

  const rows = (): string[] => [...(live?.container.querySelectorAll('.run-note-reason') ?? [])].map((node) => node.textContent ?? '')
  const phrases = (): string[] => [...(live?.container.querySelectorAll('.run-card-foot-phrase') ?? [])].map((node) => node.textContent ?? '')
  const foot = (): string[] => [...(live?.container.querySelector('.run-card-foot')?.children ?? [])].map((node) => node.textContent ?? '')

  it('born: the start row only, a head of path and elapsed with no status, and a foot of the two phrases then the plan', () => {
    live = drawLive(createProseStore(crank()), card({ plan: ['Vision', 'Scope'] }))
    expect(rows()).toEqual(['run started'])
    expect(live.container.querySelector('.run-card-status')).toBeNull()
    expect(live.container.querySelector('.run-card-elapsed')).not.toBeNull()
    expect(foot()).toEqual(['0 words on disk · autosave on', '2 to write', 'Vision', 'Scope'])
  })

  it('in dead air with three notes: the start row, then the notes in order, and the same foot', () => {
    live = drawLive(
      createProseStore(crank()),
      card({
        notes: [
          { text: '- (decision) One', at: 1_000 },
          { text: '- (open) Two', at: 2_000 },
          { text: '- (note) Three', at: 3_000 }
        ]
      })
    )
    expect(rows()).toEqual(['run started', 'One', 'Two', 'Three'])
    expect(phrases()).toEqual(['0 words on disk · autosave on'])
  })

  it('when prose begins: the head reads writing, the start row stays above the prose, and the foot loses the two phrases', () => {
    const frames = crank()
    const store = createProseStore(frames)
    live = drawLive(store, card({ plan: ['Vision', 'Scope'] }))
    expect(live.head()).toBe('')
    store.append('r1', 'c1', 'prd.md', '## 1. Vision\nwords')
    frames.frame()
    expect(live.head()).toBe('writing · §1 Vision')
    expect(rows()).toEqual(['run started'])
    expect(phrases()).toEqual([])
    expect(live.container.querySelector('.run-card-foot')?.textContent).not.toMatch(/words on disk|autosave/)
  })

  it('quiet after prose: the head keeps its last words, the body keeps its rows and the prose, and the foot is the plan’s', () => {
    const frames = crank()
    const store = createProseStore(frames)
    live = drawLive(store, card({ plan: ['Vision', 'Scope'] }))
    store.append('r1', 'c1', 'prd.md', '## 1. Vision\nwords')
    frames.frame()
    // Minutes pass with no piece; a note arrives and the card re-renders.
    live.render(card({ plan: ['Vision', 'Scope'], notes: [{ text: '- (decision) Later', at: 9_000 }] }))
    expect(live.head()).toBe('writing · §1 Vision')
    expect(rows()).toEqual(['run started', 'Later'])
    expect(live.container.querySelector('.run-card-text')?.textContent).toBe('## 1. Vision\nwords')
    expect(phrases()).toEqual([])
    expect(foot()[0]).toBe('2 to write')
  })

  it('a terminal card keeps its start row and notes and has no dead-air foot', () => {
    for (const status of ['finished', 'failed', 'stopped'] as const) {
      live = drawLive(
        createProseStore(crank()),
        card({ status, endedAt: Date.now(), notes: [{ text: '- (decision) Kept', at: 1_000 }] })
      )
      expect(rows()).toEqual(['run started', 'Kept'])
      expect(phrases()).toEqual([])
      live.stop()
    }
    live = null
  })

  it('keeps the rows and the prose as siblings in one scroll container, with no wrapper, label or rule between them', () => {
    const frames = crank()
    const store = createProseStore(frames)
    live = drawLive(store, card({ notes: [{ text: '- (decision) One', at: 1_000 }] }))
    store.append('r1', 'c1', 'prd.md', '## 1. Vision\nwords')
    frames.frame()
    const body = live.container.querySelector('.run-card-body')
    const flow = body?.querySelector('.run-card-flow')
    expect(body?.children).toHaveLength(1)
    expect([...(flow?.children ?? [])].map((node) => node.className)).toEqual(['run-note-feed', 'run-card-prose'])
    expect(body?.querySelector('hr, [role="separator"], legend, label, h1, h2, h3, h4')).toBeNull()
    expect(flow?.querySelectorAll('.run-note-feed > *')).toHaveLength(2)
  })
})

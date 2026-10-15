// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentView } from '../../../shared/install'
import { renderMarkdown } from '../doc/render-markdown'
import { PartyTurn } from '../party/party-turn'
import '../testing/render-hook'
import { Turns } from './transcript'
import type { PersonaInFlight, TranscriptEntry } from './transcript'

/**
 * Story 7.2 (FR130): a persona's completed turn is read as markdown in the chat, through the
 * document window's one pipeline and `MarkdownBody`'s one `innerHTML`, under the chat's own
 * `.turn-md`; a turn in flight stays plain text. The real DOMPurify runs here (jsdom); the renderer
 * is wrapped so a test can count its calls and make it fail closed.
 */
vi.mock('../doc/render-markdown', async (importOriginal) => {
  const real = await importOriginal<typeof import('../doc/render-markdown')>()
  return { ...real, renderMarkdown: vi.fn(real.renderMarkdown) }
})

const actual = await vi.importActual<typeof import('../doc/render-markdown')>('../doc/render-markdown')
const renderer = vi.mocked(renderMarkdown)

const MARY: AgentView = { id: 'bmad-agent-analyst', module: 'bmm', name: 'Mary', title: 'Analyst', icon: 'i', description: 'd' }
const TEXT = '## T\n\n- a\n- b\n\n`x`'

let container: HTMLElement
let root: Root

function draw(node: ReturnType<typeof createElement>): void {
  if (container === undefined || !container.isConnected) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  act(() => root.render(node))
}

function persona(text: string, id = 'p1'): TranscriptEntry {
  return { kind: 'persona', id, at: 1, agent: MARY, text, messageId: 'm1' }
}

function thread(entries: readonly TranscriptEntry[], inFlight: readonly PersonaInFlight[] = []): void {
  draw(createElement(Turns, { entries, onCancel: () => {}, inFlight }))
}

const flying = (entryId: string): PersonaInFlight => ({ agent: MARY, since: 1, entryId })

beforeEach(() => {
  renderer.mockReset()
  renderer.mockImplementation(actual.renderMarkdown)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('a persona’s completed turn', () => {
  it('is drawn by MarkdownBody under .turn-md, as headings, lists and code, and never as .doc-md', () => {
    thread([persona(TEXT)])

    const md = container.querySelector('.turn--persona .turn-body > .turn-md') as HTMLElement
    expect(md).not.toBeNull()
    expect(md.querySelector('h2')?.textContent).toBe('T')
    expect([...md.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual(['a', 'b'])
    expect(md.querySelector('p > code')?.textContent).toBe('x')
    expect(container.querySelector('.turn-words')).toBeNull()
    expect(container.querySelector('.doc-md')).toBeNull()
  })

  it('is drawn once, and not again for the same text', () => {
    thread([persona(TEXT)])
    thread([persona(TEXT)])
    thread([persona(TEXT)])

    expect(renderer).toHaveBeenCalledTimes(1)
    expect(renderer).toHaveBeenCalledWith(TEXT)
  })

  it('is drawn when it is read back from a stored transcript, never having been in flight', () => {
    thread([persona(TEXT)], [])

    expect(container.querySelector('.turn--persona .turn-md h2')).not.toBeNull()
  })

  it('is plain text when the sanitiser gives nothing back for words that are not blank, never an empty row', () => {
    renderer.mockImplementation(() => '')
    thread([persona('Two silences.\n\nAlready.')])

    expect(container.querySelector('.turn-md')).toBeNull()
    const words = container.querySelector('.turn--persona .turn-words') as HTMLElement
    expect([...words.children].map((p) => p.textContent)).toEqual(['Two silences.', 'Already.'])
  })

  it('draws a requirement id as span.fr with no link', () => {
    thread([persona('see FR55 and **NFR8**')])

    const md = container.querySelector('.turn-md') as HTMLElement
    expect([...md.querySelectorAll('span.fr')].map((span) => span.textContent)).toEqual(['FR55', 'NFR8'])
    expect(md.querySelector('a, [href]')).toBeNull()
  })

  it('draws nothing hostile as an element, and a link as its text with no href', () => {
    thread([
      persona(
        [
          '<script>alert(1)</script>',
          '',
          '<style>p{display:none}</style>',
          '',
          '<img src=x onerror=alert(1)>',
          '',
          '[click](javascript:alert(1)) ![pic](http://example.com/x.png) <a href="http://x" onclick="y()">z</a>',
          '',
          '<p onclick="y()" style="color:red">raw</p>'
        ].join('\n')
      )
    ])

    const md = container.querySelector('.turn-md') as HTMLElement
    expect(md.querySelectorAll('style, script, img, a, [href], [src], [onclick], [onerror], [style]')).toHaveLength(0)
    expect(md.textContent).toContain('click')
    expect(md.textContent).toContain('<script>')
    // Nothing outside the turn took anything from it either.
    expect(container.querySelectorAll('style, script, img, a')).toHaveLength(0)
  })
})

describe('a turn in flight', () => {
  it('is plain words with the caret, no .turn-md, and the renderer is never called for it', () => {
    thread([persona(TEXT)], [flying('p1')])

    expect(container.querySelector('.turn-md')).toBeNull()
    const words = container.querySelector('.turn--persona .turn-words') as HTMLElement
    expect(words.querySelector('.caret')).not.toBeNull()
    expect(words.textContent).toContain('## T')
    expect(container.querySelector('.turn-state')).not.toBeNull()
    expect(renderer).not.toHaveBeenCalled()
  })

  it('is rendered once when it ends, in the same .turn node, with the caret and state line gone', () => {
    thread([persona(TEXT)], [flying('p1')])
    const node = container.querySelector('.turn--persona') as HTMLElement
    expect(renderer).not.toHaveBeenCalled()

    thread([persona(TEXT)], [])

    expect(container.querySelector('.turn--persona')).toBe(node)
    expect(node.querySelector('.turn-words')).toBeNull()
    expect(node.querySelector('.caret, .turn-state')).toBeNull()
    expect(node.querySelector('.turn-md h2')).not.toBeNull()
    expect(renderer).toHaveBeenCalledTimes(1)
  })

  it('does not call the renderer as its words grow', () => {
    thread([persona('One')], [flying('p1')])
    thread([persona('One two')], [flying('p1')])
    thread([persona('One two three')], [flying('p1')])

    expect(renderer).not.toHaveBeenCalled()
  })

  it('leaves the pending turn plain: the caret alone, no markdown', () => {
    thread([], [{ agent: MARY, since: 1, entryId: undefined }])

    expect(container.querySelector('.turn--pending .turn-words .caret')).not.toBeNull()
    expect(container.querySelector('.turn-md')).toBeNull()
    expect(renderer).not.toHaveBeenCalled()
  })
})

describe('what stays plain text', () => {
  it('is the user’s turn, a sysline and a decision block’s words', () => {
    const asked: TranscriptEntry = persona('Which one?\n\n- **A**. Postgres\n- **B**. SQLite')
    thread(
      [
        { kind: 'user', id: 'u1', at: 1, text: '## not a heading\n\n- not a list' },
        { kind: 'sysline', id: 's1', at: 2, text: '**handed** to Mary' } as TranscriptEntry,
        asked
      ],
      []
    )

    const user = container.querySelector('.turn--user .turn-words') as HTMLElement
    expect(user.querySelector('h2, ul')).toBeNull()
    expect(user.textContent).toContain('## not a heading')
    expect(container.querySelector('.sysline-text')?.textContent).toBe('**handed** to Mary')
    // Only the persona's turn was drawn through the renderer.
    expect(renderer).toHaveBeenCalledTimes(1)
    expect(renderer.mock.calls[0][0]).toBe(asked.kind === 'persona' ? asked.text : '')
  })

  it('leaves a decision block drawn from the raw text, after the rendered words', () => {
    const text = 'Which one?\n\nA. Postgres\nB. SQLite\nC. Neither'
    draw(
      createElement(Turns, {
        entries: [persona(text)],
        canAnswer: () => true,
        onChoose: () => {}
      })
    )

    const body = container.querySelector('.turn--persona .turn-body') as HTMLElement
    expect(body.querySelectorAll('.decision')).toHaveLength(1)
    expect((body.querySelector('.turn-md') as HTMLElement).nextElementSibling).toBe(body.querySelector('.decision'))
  })
})

describe('a persona’s turn in the room', () => {
  const party = (text: string, writing?: { since: number | undefined }): ReturnType<typeof createElement> =>
    createElement(PartyTurn, { agent: MARY, at: 1, text, live: false, writing })

  it('is rendered when it is done and plain while the room’s turn is in flight', () => {
    draw(party(TEXT, { since: 1 }))
    const node = container.querySelector('.turn') as HTMLElement
    expect(container.querySelector('.turn-md')).toBeNull()
    expect(container.querySelector('.turn-words .caret')).not.toBeNull()
    expect(renderer).not.toHaveBeenCalled()

    draw(party(TEXT))

    expect(container.querySelector('.turn')).toBe(node)
    expect(container.querySelector('.turn-words')).toBeNull()
    expect(container.querySelector('.turn-md h2')).not.toBeNull()
    expect(container.querySelector('.doc-md')).toBeNull()
    expect(renderer).toHaveBeenCalledTimes(1)
  })
})

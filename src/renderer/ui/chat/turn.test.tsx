import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AgentView } from '../../../shared/install'
import { formatTurnTime } from './format-turn-time'
import { Transcript, orderEntries } from './transcript'
import type { TranscriptEntry } from './transcript'
import { PersonaTurn, UserTurn } from './turn'

const AGENT: AgentView = {
  id: 'bmad-agent-pm',
  module: 'bmm',
  team: 'software-development',
  name: 'John',
  title: 'Product Manager',
  icon: '📋',
  description: 'Thinks like Marty Cagan and Teresa Torres.'
}

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

describe('PersonaTurn', () => {
  const markup = renderToStaticMarkup(
    <PersonaTurn
      agent={AGENT}
      at={Date.UTC(2026, 9, 1, 12, 5)}
      text={'First line.\n\nSecond line.'}
    />
  )

  it('is a flat row with a decorative 26px initials disc, the name, the role and a time', () => {
    expect(markup).toContain('class="turn turn--persona"')
    expect(markup).toContain(
      '<span class="initials initials--thread" aria-hidden="true">J</span>'
    )
    expect(markup).not.toContain('<svg')
    expect(markup).not.toContain('tabindex')
    expect(markup).not.toContain('role="img"')
    expect(markup).toContain('<span class="turn-name">John</span>')
    expect(markup).toContain('<span class="turn-role">Product Manager</span>')
    expect(markup).toMatch(/<span class="turn-time">\d{2}:\d{2}<\/span>/)
  })

  it('puts the time after the name and the role, and the words after the header', () => {
    expect(markup.indexOf('turn-time')).toBeGreaterThan(markup.indexOf('turn-role'))
    expect(markup.indexOf('turn-role')).toBeGreaterThan(markup.indexOf('turn-name'))
    expect(markup.indexOf('turn-words')).toBeGreaterThan(markup.indexOf('turn-time'))
  })

  it('splits the words on blank lines into paragraphs and adds nothing', () => {
    expect(markup).toContain('<div class="turn-words"><p>First line.</p><p>Second line.</p></div>')
  })

  it('has no ground of its own, no button, no inline style and no user tint', () => {
    expect(markup).not.toContain('turn--user')
    expect(markup).not.toContain('initials--you')
    expect(markup).not.toMatch(/<button|<input|<textarea/)
    expect(markup).not.toContain('style=')
  })

  it('renders hostile text as text', () => {
    const hostile = '<img src=x onerror=1>'
    const out = renderToStaticMarkup(
      <PersonaTurn agent={{ ...AGENT, name: hostile, title: hostile }} at={0} text={hostile} />
    )

    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
    expect(count(out, /&lt;img src=x onerror=1&gt;/g)).toBeGreaterThanOrEqual(3)
  })
})

describe('PersonaTurn with a decision', () => {
  const words = 'Which one?\n\nA. Postgres\nB. SQLite'
  const markup = renderToStaticMarkup(
    <PersonaTurn
      agent={AGENT}
      at={0}
      text={words}
      decision={{ title: 'Which one?', options: ['Postgres', 'SQLite'] }}
      onChoose={() => {}}
    />
  )

  it('draws the block inside the turn body after the words, and leaves the words whole', () => {
    expect(markup).toContain('<p>A. Postgres\nB. SQLite</p></div><div class="decision"')
    expect(markup.indexOf('class="decision"')).toBeGreaterThan(markup.indexOf('turn-words'))
    expect(markup.indexOf('class="decision"')).toBeLessThan(markup.lastIndexOf('</div></div>'))
    expect(count(markup, /<button/g)).toBe(2)
  })

  it('draws no block without a decision, or with nothing to call', () => {
    expect(renderToStaticMarkup(<PersonaTurn agent={AGENT} at={0} text={words} />)).not.toContain(
      'decision'
    )
    expect(
      renderToStaticMarkup(
        <PersonaTurn
          agent={AGENT}
          at={0}
          text={words}
          decision={{ title: 't', options: ['a', 'b'] }}
        />
      )
    ).not.toContain('decision')
  })
})

describe('UserTurn', () => {
  const markup = renderToStaticMarkup(
    <UserTurn at={Date.UTC(2026, 9, 1, 12, 5)} text="hello there" />
  )

  it('is the same flat row, with a decorative 26px initials disc tinted for you', () => {
    expect(markup).toContain('class="turn turn--user"')
    expect(markup).toContain(
      '<span class="initials initials--thread initials--you" aria-hidden="true">Y</span>'
    )
    expect(markup).not.toContain('<svg')
    expect(markup).not.toContain('tabindex')
    expect(markup).toContain('<p>hello there</p>')
  })

  it('takes the identity it is given', () => {
    const out = renderToStaticMarkup(
      <UserTurn at={0} text="x" user={{ name: 'Sherif Matta', title: 'owner' }} />
    )

    expect(out).toContain('<span class="turn-name">Sherif Matta</span>')
    expect(out).toContain('>SM<')
  })

  it('renders hostile text as text', () => {
    const out = renderToStaticMarkup(
      <UserTurn
        at={0}
        text="<img src=x onerror=1>"
        user={{ name: '<b>x</b>', title: '<i>y</i>' }}
      />
    )

    expect(out).not.toMatch(/<img|<b>|<i>/)
  })
})

describe('a queued UserTurn', () => {
  const markup = renderToStaticMarkup(
    <UserTurn at={0} text="later" queuedFor="John" onCancel={() => {}} />
  )

  it('is the user turn with a queued modifier, the marker and a cancel button', () => {
    expect(markup).toContain('class="turn turn--user turn--queued"')
    expect(markup).toContain(
      '<span class="turn-queued-mark">queued · sends when John finishes</span>'
    )
    expect(markup).toMatch(/<button type="button" class="turn-cancel"[^>]*>cancel<\/button>/)
    expect(markup).toContain('<p>later</p>')
  })

  it('carries no queued treatment once it is sent', () => {
    const sent = renderToStaticMarkup(<UserTurn at={0} text="later" />)

    expect(sent).toContain('class="turn turn--user"')
    expect(sent).not.toMatch(/queued|<button/)
  })

  it('has no cancel without a handler, and renders the persona’s name as text', () => {
    const out = renderToStaticMarkup(<UserTurn at={0} text="x" queuedFor="<b>J</b>" />)

    expect(out).not.toContain('<button')
    expect(out).not.toContain('<b>')
    expect(out).toContain('sends when &lt;b&gt;J&lt;/b&gt; finishes')
  })
})

describe('the time', () => {
  const EARLY = Date.UTC(2026, 9, 1, 3, 7)
  const LATE = Date.UTC(2026, 9, 1, 21, 42)
  const timeOf = (markup: string): string | undefined =>
    markup.match(/<span class="turn-time">([^<]*)<\/span>/)?.[1]

  it('is formatTurnTime of each turn’s own `at`, on both kinds of turn', () => {
    expect(EARLY).not.toBe(LATE)
    expect(formatTurnTime(EARLY)).not.toBe(formatTurnTime(LATE))
    for (const at of [EARLY, LATE]) {
      expect(timeOf(renderToStaticMarkup(<PersonaTurn agent={AGENT} at={at} text="x" />))).toBe(
        formatTurnTime(at)
      )
      expect(timeOf(renderToStaticMarkup(<UserTurn at={at} text="x" />))).toBe(formatTurnTime(at))
    }
  })
})

describe('the words, exactly as given', () => {
  const words = (text: string): string =>
    renderToStaticMarkup(<PersonaTurn agent={AGENT} at={0} text={text} />)

  it('keeps single newlines, indentation and runs of spaces inside a paragraph', () => {
    expect(words('a\n  b\n\n\n    c  d')).toContain('<p>a\n  b</p><p>    c  d</p>')
  })

  it('does not trim, prefix, frame or classify', () => {
    const out = words('  hello  ')

    expect(out).toContain('<p>  hello  </p>')
    expect(out).not.toMatch(/<(?:b|strong|em|code|blockquote|ul|ol|li|h\d)\b/)
  })

  it('does not interpret markdown or markup', () => {
    const out = words('**bold** `code` # head\n\n- item')

    expect(out).toContain('<p>**bold** `code` # head</p><p>- item</p>')
  })

  it('draws no paragraph for an empty or whitespace-only text', () => {
    for (const text of ['', '   ', '\n', ' \n\t\n ']) {
      expect(words(text), JSON.stringify(text)).not.toContain('<p>')
    }
  })
})

describe('orderEntries', () => {
  const at = (id: string, time: number) => ({ id, at: time })

  it('orders ascending by time', () => {
    expect(orderEntries([at('c', 30), at('a', 10), at('b', 20)]).map((e) => e.id)).toEqual([
      'a',
      'b',
      'c'
    ])
  })

  it('keeps input order for ties', () => {
    const entries = [at('x', 5), at('a', 1), at('y', 5), at('z', 5), at('b', 1)]

    expect(orderEntries(entries).map((e) => e.id)).toEqual(['a', 'b', 'x', 'y', 'z'])
  })

  it('returns a new array and leaves the input alone', () => {
    const entries = [at('b', 2), at('a', 1)]
    const ordered = orderEntries(entries)

    expect(ordered).not.toBe(entries)
    expect(entries.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('handles none', () => {
    expect(orderEntries([])).toEqual([])
  })
})

describe('Transcript', () => {
  const entries: TranscriptEntry[] = [
    { kind: 'persona', id: 'p2', at: 3000, agent: AGENT, text: 'third' },
    {
      kind: 'user',
      id: 'u1',
      at: 1000,
      text: 'first',
      user: { name: 'Sherif Matta', title: 'owner' }
    },
    { kind: 'persona', id: 'p1', at: 2000, agent: AGENT, text: 'second' }
  ]
  const markup = renderToStaticMarkup(<Transcript entries={entries} />)

  it('renders persona and user turns in time order, in the thread', () => {
    expect(markup.startsWith('<div class="thread">')).toBe(true)
    expect(count(markup, /class="turn turn--/g)).toBe(3)
    expect(markup.indexOf('first')).toBeLessThan(markup.indexOf('second'))
    expect(markup.indexOf('second')).toBeLessThan(markup.indexOf('third'))
    expect(markup.indexOf('turn--user')).toBeLessThan(markup.indexOf('turn--persona'))
  })

  it('takes each entry’s own identity: the user’s name and initials, the persona’s agent', () => {
    expect(markup).toContain('<span class="turn-name">Sherif Matta</span>')
    expect(markup).toContain('<span class="turn-role">owner</span>')
    expect(markup).toContain('>SM<')
    expect(markup).not.toContain('>You<')
    expect(markup).toContain('<span class="turn-name">John</span>')
    expect(markup).toContain('initials--thread" aria-hidden="true">J<')
    expect(count(markup, /<span class="turn-name">John<\/span>/g)).toBe(2)
  })

  it('is empty, not a placeholder, when there is nothing said', () => {
    expect(renderToStaticMarkup(<Transcript entries={[]} />)).toBe('<div class="thread"></div>')
  })
})

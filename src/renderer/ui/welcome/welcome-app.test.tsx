import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { ThemeChoice } from '../../../shared/theme'
import type { RecentRow } from '../../../shared/welcome'
import { Announcer } from '../a11y/announcer'
import { WelcomeView } from './welcome-app'

const NOW = 1_000_000_000_000
const row = (over: Partial<RecentRow> = {}): RecentRow => ({
  path: '/Users/me/work/falcon',
  name: 'falcon',
  parent: '~/work',
  openedAt: NOW - 2 * 3_600_000,
  exists: true,
  ...over
})

function render(
  rows: readonly RecentRow[] = [],
  notice: string | null = null,
  dragging = false,
  theme: ThemeChoice = 'system'
): string {
  const none = (): void => {}
  return renderToStaticMarkup(
    <WelcomeView
      rows={rows}
      now={NOW}
      notice={notice}
      dragging={dragging}
      theme={theme}
      onChoose={none}
      onOpenRecent={none}
      onTheme={none}
      onDragEnter={none}
      onDragOver={none}
      onDragLeave={none}
      onDrop={none}
      announcer={new Announcer()}
    />
  )
}

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

/** The page above its foot: the theme line is the one control beside the page's own, counted on its own below. */
const aboveFoot = (markup: string): string => markup.slice(0, markup.indexOf('<div class="welcome-foot">'))
/** The foot, through the end of its line. */
const foot = (markup: string): string => markup.slice(markup.indexOf('<div class="welcome-foot">'))

describe('the topbar and the head', () => {
  const markup = render()

  it('shows the brand and `no project open`, and nothing else of the shell', () => {
    expect(markup).toContain('<span class="welcome-brand-name">BMad Harness</span>')
    expect(markup).toContain('<span class="welcome-topbar-state">no project open</span>')
    expect(markup).not.toMatch(/class="chip"|view-switch|segmented|composer|rail/)
  })

  it('names the product once and says what it is, in the harness register', () => {
    expect(markup).toContain('<h1 class="welcome-title">BMad Harness</h1>')
    expect(markup).toContain('a visual harness for bmad projects')
  })
})

describe('the one action', () => {
  it('is a single button labelled `open project folder…` with the chord ⌘O, beside the drop hint', () => {
    const markup = render()

    expect(count(aboveFoot(markup), /<button/g)).toBe(1)
    expect(markup).toMatch(/<button type="button" class="welcome-open">.*open project folder…<span class="welcome-open-chord">⌘O<\/span><\/button>/)
    expect(markup).toContain('<span class="welcome-drop-hint">drop a project folder here</span>')
    expect(markup.indexOf('welcome-drop-hint')).toBeLessThan(markup.indexOf('welcome-open"'))
  })

  it('hides its glyph from assistive technology and draws it as one stroked path', () => {
    const glyph = /<svg class="welcome-open-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="[^"]+"><\/path><\/svg>/

    expect(render()).toMatch(glyph)
  })

  it('takes the accent border and ground while a folder is dragged over, and says nothing else for it', () => {
    expect(render([], null, true)).toContain('class="welcome-drop welcome-drop--over"')
    expect(render([], null, false)).toContain('class="welcome-drop"')
  })

  it('says a refused drop where the drop hint was, and the hint is gone while it is said', () => {
    const markup = render([], 'not a folder · notes.txt')

    expect(markup).toContain('<span class="welcome-drop-hint">not a folder · notes.txt</span>')
    expect(markup).not.toContain('drop a project folder here')
  })
})

describe('recent', () => {
  it('is not rendered at all with no rows: no label, no empty line', () => {
    const markup = render([])

    expect(markup).not.toMatch(/welcome-recent|>recent</)
  })

  it('shows each row’s folder name, ~ parent and age, newest first, as one button each', () => {
    const markup = render([
      row(),
      row({ path: '/Users/me/other', name: 'other', parent: '~', openedAt: NOW - 3 * 86_400_000 })
    ])

    expect(markup).toContain('>recent</h2>')
    expect(count(markup, /class="welcome-recent-row/g)).toBe(2)
    expect(markup).toContain('<span class="welcome-recent-name">falcon</span><span class="welcome-recent-path">~/work</span><span class="welcome-recent-age">2h</span>')
    expect(markup).toContain('<span class="welcome-recent-name">other</span><span class="welcome-recent-path">~</span><span class="welcome-recent-age">3d</span>')
    expect(markup.indexOf('falcon')).toBeLessThan(markup.indexOf('other'))
  })

  it('is one tab stop: the first row holds tabindex 0 and the rest -1', () => {
    const markup = render([row(), row({ path: '/b', name: 'b' }), row({ path: '/c', name: 'c' })])

    expect(count(aboveFoot(markup), /tabindex="0"/g)).toBe(1)
    expect(count(aboveFoot(markup), /tabindex="-1"/g)).toBe(2)
  })

  it('keeps a missing folder’s row, says `folder missing` where the age was, and marks it unavailable', () => {
    const markup = render([row({ exists: false })])

    expect(markup).toContain('aria-disabled="true"')
    expect(markup).toContain('<span class="welcome-recent-missing">folder missing</span>')
    expect(markup).not.toContain('welcome-recent-age')
    // Not `disabled`: the arrows still reach it, so the user can read why.
    expect(markup).not.toMatch(/ disabled/)
  })

  it('has no control to remove a row, no count, no badge and no install state on one', () => {
    const markup = render([row(), row({ exists: false, path: '/gone', name: 'gone' })])

    expect(count(aboveFoot(markup), /<button/g)).toBe(3)
    expect(markup).not.toMatch(/remove|clear|delete|forget|×|aria-label="[^"]*(?:agent|install|version)/i)
  })
})

describe('the team', () => {
  const markup = render()

  it('is five cards under four lanes in the method’s order', () => {
    expect(count(markup, /class="welcome-card"/g)).toBe(5)
    const lanes = [...markup.matchAll(/role="group" aria-label="([a-z]+)"/g)].map(([, lane]) => lane)

    expect(lanes).toEqual(['analysis', 'planning', 'solutioning', 'implementation'])
  })

  it('names each persona with portrait, name, title and the table’s sentence', () => {
    for (const [name, title] of [
      ['Mary', 'Business Analyst'],
      ['John', 'Product Manager'],
      ['Sally', 'UX Designer'],
      ['Winston', 'System Architect'],
      ['Amelia', 'Senior Software Engineer']
    ]) {
      expect(markup).toContain(`<div class="welcome-card-name">${name}</div><div class="welcome-card-title">${title}</div>`)
      expect(markup).toContain(`aria-label="${name}, ${title}"`)
    }
  })

  it('draws every portrait at 44 and none at any other size', () => {
    const sizes = [...markup.matchAll(/<svg class="portrait-face" width="(\d+)" height="(\d+)"/g)]

    expect(sizes).toHaveLength(5)
    expect(sizes.every(([, width, height]) => width === '44' && height === '44')).toBe(true)
  })

  it('carries the meta line, and no card is focusable, interactive or highlighted', () => {
    // The static markup escapes the apostrophe; the page's text node does not.
    expect(markup).toContain('the five core personas, by phase of the method · a project&#x27;s own install can add more')
    const cards = aboveFoot(markup).slice(markup.indexOf('welcome-lanes'))
    expect(cards).not.toMatch(/tabindex|<button|<a[\s>]|onclick|aria-current|aria-selected|aria-pressed|recommended|current/i)
  })
})

describe('the page as a whole', () => {
  it('has one live region, and it is the shared one, hidden by the component itself', () => {
    expect(count(render(), /class="visually-hidden"/g)).toBe(1)
  })

  it('has no link, input, dialog, spinner or progress element', () => {
    expect(render([row()])).not.toMatch(/<a[\s>]|<input|<select|<textarea|<dialog|<progress|role=\W?(?:progressbar|alert|status)/)
  })
})

describe('the theme line', () => {
  it('is the page’s foot, after the stage, in a div: `theme · system · light · dark`, three buttons and the words only', () => {
    const markup = render()

    expect(markup.indexOf('</main>')).toBeLessThan(markup.indexOf('welcome-foot'))
    expect(markup).not.toMatch(/<footer/)
    expect(foot(markup)).toContain('<span class="welcome-theme-label" id="welcome-theme-label">theme</span>')
    expect(count(foot(markup), /<button/g)).toBe(3)
    expect([...foot(markup).matchAll(/class="welcome-theme-word"[^>]*>([^<]+)</g)].map(([, word]) => word)).toEqual([
      'system',
      'light',
      'dark'
    ])
    expect(count(foot(markup), /<span class="welcome-theme-sep" aria-hidden="true">·<\/span>/g)).toBe(3)
  })

  it.each([
    ['system', ['true', 'false', 'false']],
    ['light', ['false', 'true', 'false']],
    ['dark', ['false', 'false', 'true']]
  ] as const)('marks %s as the pressed word, and it alone', (choice, pressed) => {
    const markup = render([], null, false, choice)

    expect([...foot(markup).matchAll(/aria-pressed="(\w+)"/g)].map(([, value]) => value)).toEqual(pressed)
  })

  it('makes the pressed word the one tab stop, and the other two -1', () => {
    const markup = render([], null, false, 'dark')

    expect([...foot(markup).matchAll(/tabindex="(-?\d)"/g)].map(([, value]) => value)).toEqual(['-1', '-1', '0'])
  })

  it('has no theme control anywhere else on the page, and no word of one', () => {
    const markup = aboveFoot(render([row()]))

    expect(markup).not.toMatch(/theme|aria-pressed|\blight\b|\bdark\b/i)
  })
})

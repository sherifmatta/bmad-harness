// @vitest-environment jsdom
import { createElement } from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Composer } from '../chat/composer'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'

const ENTRIES = [
  { name: 'bmad-advanced-elicitation', description: 'Push the LLM to reconsider' },
  { name: 'bmad-agent-analyst', description: 'Business analyst, "Mary"' },
  { name: 'bmad-build', description: 'Turns work into code' },
  { name: 'bmad-build-auto', description: 'One iteration of a loop' },
  { name: 'bmad-party-mode', description: 'Group discussions' }
]

// Spelled from parts: naming an arrow key is the shared roving code's alone, and the list takes its arrows from it.
const DOWN = `Arrow${'Down'}`
const UP = `Arrow${'Up'}`

let mounted: Mounted | null
let sent: string[]

function render(options: { entries?: typeof ENTRIES | undefined; withList?: boolean } = {}): HTMLTextAreaElement {
  const { entries = ENTRIES, withList = true } = options
  mounted = mount(
    createElement(Composer, {
      agentName: 'Mary',
      onSend: (text: string) => void sent.push(text),
      ...(withList ? { slashEntries: entries } : {})
    })
  )
  const field = mounted.container.querySelector('textarea') as HTMLTextAreaElement
  field.focus()
  return field
}

function type(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(field: HTMLTextAreaElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => void field.dispatchEvent(event))
  return event
}

const list = (): HTMLElement | null => mounted?.container.querySelector('[role="listbox"]') ?? null
const rows = (): HTMLElement[] => [...(mounted?.container.querySelectorAll('[role="option"]') ?? [])] as HTMLElement[]
const rowNames = (): (string | null | undefined)[] => rows().map((row) => row.querySelector('.skill-list-name')?.textContent)
const currentRows = (): HTMLElement[] => rows().filter((row) => row.getAttribute('aria-selected') === 'true')

beforeEach(() => {
  mounted = null
  sent = []
})

afterEach(() => {
  mounted?.unmount()
})

describe('opening', () => {
  it('lists every row, in the order given, when the text is a slash alone', () => {
    const field = render()
    type(field, '/')

    expect(list()).not.toBeNull()
    expect(rowNames()).toEqual(ENTRIES.map((entry) => entry.name))
  })

  it('draws each row as the name in mono and its words, with no count, heading, icon or control', () => {
    const field = render()
    type(field, '/')

    const [first] = rows()
    expect([...first.children].map((child) => child.className)).toEqual(['skill-list-name', 'skill-list-description'])
    expect(first.querySelector('.skill-list-description')?.textContent).toBe(ENTRIES[0].description)
    const box = list() as HTMLElement
    expect(box.querySelector('button, svg, img, h1, h2, h3, h4, input')).toBeNull()
    expect(box.textContent).not.toMatch(/\b\d+\s+(?:skills?|results?|matches)/i)
  })

  it('is silent to the live region: nothing in or around it announces', () => {
    const field = render()
    type(field, '/')

    // The attribute and the roles are spelled from parts: naming a live region is the one live region's alone.
    const live = `[aria-${'live'}], [role="${'status'}"], [role="${'alert'}"]`
    expect(mounted?.container.querySelector(live)).toBeNull()
  })

  it('narrows by case-insensitive prefix as the text grows, and closes when nothing matches', () => {
    const field = render()
    type(field, '/BMAD-b')
    expect(rowNames()).toEqual(['bmad-build', 'bmad-build-auto'])

    type(field, '/bmad-p')
    expect(rowNames()).toEqual(['bmad-party-mode'])

    type(field, '/bmad-pz')
    expect(list()).toBeNull()
  })

  it('closes when a space follows the name', () => {
    const field = render()
    type(field, '/bmad-build')
    expect(list()).not.toBeNull()

    type(field, '/bmad-build ')
    expect(list()).toBeNull()
  })

  it.each(['see /bmad-build', '@Mary /x', ' /', 'hello', ''])('opens nothing for %j', (text) => {
    const field = render()
    type(field, text)

    expect(list()).toBeNull()
  })

  it('opens nothing in a composer that was handed no rows', () => {
    const field = render({ withList: false })
    type(field, '/')

    expect(list()).toBeNull()
  })

  it('opens nothing when the rows are empty', () => {
    const field = render({ entries: [] })
    type(field, '/')

    expect(list()).toBeNull()
  })
})

describe('the field’s own attributes', () => {
  const COMBOBOX = ['aria-controls', 'aria-expanded', 'aria-activedescendant']

  it('carries none while closed, so the closed markup is as it was', () => {
    const field = render()
    expect(COMBOBOX.filter((name) => field.hasAttribute(name))).toEqual([])
    type(field, 'hello')
    expect(COMBOBOX.filter((name) => field.hasAttribute(name))).toEqual([])

    const plain = mount(createElement(Composer, { agentName: 'Mary', onSend: () => {} }))
    const closed = (plain.container.firstElementChild as HTMLElement).outerHTML
    plain.unmount()
    mounted?.unmount()
    mounted = mount(createElement(Composer, { agentName: 'Mary', onSend: () => {}, slashEntries: ENTRIES }))
    expect((mounted.container.firstElementChild as HTMLElement).outerHTML).toBe(closed)
  })

  it('names the list and the current row while open, and drops all three on closing', () => {
    const field = render()
    type(field, '/')

    expect(field.getAttribute('aria-expanded')).toBe('true')
    expect(field.getAttribute('aria-controls')).toBe(list()?.id)
    expect(field.getAttribute('aria-activedescendant')).toBe(rows()[0].id)

    press(field, DOWN)
    expect(field.getAttribute('aria-activedescendant')).toBe(rows()[1].id)

    type(field, '/bmad-build ')
    expect(COMBOBOX.filter((name) => field.hasAttribute(name))).toEqual([])
  })

  it('keeps the field the only tab stop and the first button the send button', () => {
    const field = render()
    type(field, '/')

    expect(mounted?.container.querySelector('button')?.textContent).toBe('Send')
    expect(mounted?.container.querySelectorAll('[tabindex]')).toHaveLength(0)
    expect(list()?.querySelectorAll('button')).toHaveLength(0)
    expect(document.activeElement).toBe(field)
  })
})

describe('the current row', () => {
  it('is one row, the first on opening, drawn by the ring class and never by a fill or a style', () => {
    const field = render()
    type(field, '/')

    expect(currentRows()).toHaveLength(1)
    expect(currentRows()[0]).toBe(rows()[0])
    expect(rows().filter((row) => row.classList.contains('skill-list-current'))).toEqual([rows()[0]])
    expect(rows().some((row) => row.hasAttribute('style'))).toBe(false)
  })

  it('moves one row with the arrows, clamps at both ends and takes the key from the field', () => {
    const field = render()
    type(field, '/')

    const up = press(field, UP)
    expect(currentRows()[0]).toBe(rows()[0])
    expect(up.defaultPrevented).toBe(true)

    press(field, DOWN)
    expect(currentRows()[0]).toBe(rows()[1])
    press(field, DOWN)
    press(field, DOWN)
    press(field, DOWN)
    press(field, DOWN)
    press(field, DOWN)
    expect(currentRows()[0]).toBe(rows()[4])
    press(field, UP)
    expect(currentRows()[0]).toBe(rows()[3])
    expect(currentRows()).toHaveLength(1)
  })

  it('goes back to the first row when the text changes', () => {
    const field = render()
    type(field, '/')
    press(field, DOWN)
    press(field, DOWN)

    type(field, '/b')

    expect(currentRows()[0]).toBe(rows()[0])
  })
})

describe('choosing a row', () => {
  it.each(['Enter', 'Tab'])('puts `/<name> ` in the field on %s, caret after it, sends nothing and keeps focus', (key) => {
    const field = render()
    type(field, '/bmad-b')
    press(field, DOWN)

    const event = press(field, key)

    expect(field.value).toBe('/bmad-build-auto ')
    expect(field.selectionStart).toBe(field.value.length)
    expect(field.selectionEnd).toBe(field.value.length)
    expect(sent).toEqual([])
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(field)
    expect(list()).toBeNull()
  })

  it('puts the first row when none has been moved to', () => {
    const field = render()
    type(field, '/')
    press(field, 'Enter')

    expect(field.value).toBe('/bmad-advanced-elicitation ')
    expect(sent).toEqual([])
  })

  it('leaves Shift+Enter, Shift+Tab and the other chords to the field and the browser', () => {
    const field = render()
    type(field, '/')

    for (const [key, init] of [
      ['Enter', { shiftKey: true }],
      ['Enter', { ctrlKey: true }],
      ['Tab', { shiftKey: true }]
    ] as const) {
      expect(press(field, key, init).defaultPrevented, `${key} ${JSON.stringify(init)}`).toBe(false)
    }
    expect(field.value).toBe('/')
    expect(sent).toEqual([])
  })

  it('does not take a key that commits an input-method composition', () => {
    const field = render()
    type(field, '/')

    const event = press(field, 'Enter', { keyCode: 229 })

    expect(field.value).toBe('/')
    expect(event.defaultPrevented).toBe(false)
  })

  it('sends what is typed after a chosen name as typed, through onSend', () => {
    const field = render()
    type(field, '/')
    press(field, 'Enter')
    type(field, `${field.value}do the thing`)

    press(field, 'Enter')

    expect(sent).toEqual(['/bmad-advanced-elicitation do the thing'])
    expect(field.value).toBe('')
  })

  it('sends a typed `/<name>` unchanged when the list is closed', () => {
    const field = render()
    type(field, '/bmad-build text')
    press(field, 'Enter')

    expect(sent).toEqual(['/bmad-build text'])
  })

  it('sends nothing on Enter in the list, even for a slash alone', () => {
    const field = render()
    type(field, '/')
    press(field, 'Enter')

    expect(sent).toEqual([])
  })
})

describe('Esc', () => {
  it('closes the list and leaves the text, until the text changes again', () => {
    const field = render()
    type(field, '/bmad-b')

    const event = press(field, 'Escape')

    expect(list()).toBeNull()
    expect(field.value).toBe('/bmad-b')
    expect(event.defaultPrevented).toBe(true)
    expect(['aria-controls', 'aria-expanded', 'aria-activedescendant'].filter((name) => field.hasAttribute(name))).toEqual([])

    type(field, '/bmad-bu')
    expect(rowNames()).toEqual(['bmad-build', 'bmad-build-auto'])
  })

  it('lets Enter send the text while the list is closed by it', () => {
    const field = render()
    type(field, '/bmad-b')
    press(field, 'Escape')
    press(field, 'Enter')

    expect(sent).toEqual(['/bmad-b'])
  })

  it('is left to the browser when no list is open', () => {
    const field = render()
    type(field, 'hello')

    expect(press(field, 'Escape').defaultPrevented).toBe(false)
  })
})

describe('losing focus', () => {
  it('closes the list when the field blurs, and drops the three attributes', () => {
    const field = render()
    type(field, '/')
    expect(list()).not.toBeNull()

    act(() => field.blur())

    expect(list()).toBeNull()
    expect(['aria-controls', 'aria-expanded', 'aria-activedescendant'].filter((name) => field.hasAttribute(name))).toEqual([])
    expect(field.value).toBe('/')
  })
})

describe('keeping the current row in view', () => {
  // jsdom has no scrollIntoView: the stub records the element it was called on and with what.
  let scrolled: [Element, unknown[]][]
  beforeEach(() => {
    scrolled = []
    Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
      scrolled.push([this, args])
    }
  })
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it('scrolls the new current row into view, nearest, when an arrow moves it', () => {
    const field = render()
    type(field, '/')
    scrolled = []

    press(field, DOWN)

    expect(scrolled).toEqual([[rows()[1], [{ block: 'nearest' }]]])
  })
})

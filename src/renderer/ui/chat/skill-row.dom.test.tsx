// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { SkillRow } from './skill-row'

const entries = (count: number) => Array.from({ length: count }, (_, at) => ({ code: `C${at}`, description: `Entry ${at}` }))

type Mounted = { container: HTMLElement; unmount(): void }

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
})

/**
 * Mounts the row the way the app holds it: the open choice lives outside, and a toggle asks for it to change.
 * Most cases here are about the open row (`open` defaults to true); the collapsed default is drawn with `false`.
 */
function draw(count: number, disabled = false, startOpen = true) {
  const ran: string[] = []
  const asked: boolean[] = []
  let open = startOpen
  let items = entries(count)
  let off = disabled
  const element = () =>
    createElement(SkillRow, {
      name: 'Mary',
      items,
      disabled: off,
      onRun: (code: string) => void ran.push(code),
      open,
      onOpenChange: (next: boolean) => {
        asked.push(next)
        open = next
        react.render(element())
      }
    })
  const container = document.createElement('div')
  document.body.append(container)
  const react = createRoot(container)
  act(() => react.render(element()))
  const root = {
    container,
    unmount() {
      act(() => react.unmount())
      container.remove()
    }
  }
  mounted = root
  return {
    ran,
    asked,
    skills: (): string[] => [...root.container.querySelectorAll('button.skill-button')].map((b) => b.textContent ?? ''),
    toggle: (): HTMLButtonElement | null => root.container.querySelector<HTMLButtonElement>('button.skill-more'),
    disclosure: (): HTMLButtonElement => root.container.querySelector<HTMLButtonElement>('button.skill-row-toggle') as HTMLButtonElement,
    rerender: (next: ReturnType<typeof entries>, nextOff = disabled) => {
      items = next
      off = nextOff
      act(() => react.render(element()))
    },
    setOpen: (next: boolean) => {
      open = next
      act(() => react.render(element()))
    }
  }
}

describe('the skill row’s expansion', () => {
  it('opens in place to every entry, reads `fewer`, and closes back to five', () => {
    const view = draw(10)
    expect(view.skills()).toHaveLength(5)
    expect(view.toggle()?.textContent).toBe('+5 more')
    expect(view.toggle()?.getAttribute('aria-expanded')).toBe('false')

    act(() => view.toggle()?.click())
    expect(view.skills()).toEqual(entries(10).map((entry) => `${entry.code}${entry.description}`))
    expect(view.toggle()?.textContent).toBe('fewer')
    expect(view.toggle()?.getAttribute('aria-expanded')).toBe('true')
    // Opening the row runs nothing.
    expect(view.ran).toEqual([])

    act(() => view.toggle()?.click())
    expect(view.skills()).toHaveLength(5)
    expect(view.toggle()?.textContent).toBe('+5 more')
    expect(view.toggle()?.getAttribute('aria-expanded')).toBe('false')
  })

  it('is a real button after the entries, so it keeps focus when it opens the row', () => {
    const view = draw(10)
    const toggle = view.toggle() as HTMLButtonElement
    expect(toggle.type).toBe('button')
    expect(toggle.previousElementSibling?.classList.contains('skill-button')).toBe(true)
    expect(toggle.nextElementSibling).toBeNull()

    toggle.focus()
    act(() => toggle.click())
    expect(document.activeElement).toBe(view.toggle())
    expect(view.toggle()).toBe(toggle)
  })

  it('shows no toggle at one entry or at five', () => {
    const one = draw(1)
    expect(one.toggle()).toBeNull()
    expect(one.skills()).toHaveLength(1)
    mounted?.unmount()
    const five = draw(5)
    expect(five.toggle()).toBeNull()
    expect(five.skills()).toHaveLength(5)
  })

  it('still works while a turn is in flight, which holds every skill button and not the toggle', () => {
    const view = draw(10, true)
    const buttons = () => [...(mounted as Mounted).container.querySelectorAll<HTMLButtonElement>('button.skill-button')]
    expect(buttons().every((button) => button.disabled)).toBe(true)
    expect(view.toggle()?.disabled).toBe(false)

    act(() => view.toggle()?.click())
    expect(buttons()).toHaveLength(10)
    expect(buttons().every((button) => button.disabled)).toBe(true)
    expect(view.toggle()?.disabled).toBe(false)

    act(() => buttons()[7].click())
    expect(view.ran).toEqual([])
  })

  it('hands an entry revealed by the toggle to the one callback, by its code alone', () => {
    const view = draw(10)
    act(() => view.toggle()?.click())
    act(() => (mounted as Mounted).container.querySelectorAll<HTMLButtonElement>('button.skill-button')[8].click())
    expect(view.ran).toEqual(['C8'])
  })

  it('leaves nothing stale when the menu shrinks to five while open', () => {
    const view = draw(10)
    act(() => view.toggle()?.click())
    view.rerender(entries(5))
    expect(view.toggle()).toBeNull()
    expect(view.skills()).toHaveLength(5)
  })
})

describe('the skill row’s toggle (Story 9.1)', () => {
  it('starts collapsed when the app says so: one button, no skill button and no `+N more` in the DOM', () => {
    const view = draw(7, false, false)
    expect(view.disclosure().getAttribute('aria-expanded')).toBe('false')
    expect(view.disclosure().textContent).toBe('▸Mary can· 7 skills')
    expect(view.disclosure().getAttribute('aria-label')).toBe('Mary can, 7 skills')
    expect(view.disclosure().querySelector('[aria-hidden="true"]')?.textContent).toBe('▸')
    expect(view.skills()).toEqual([])
    expect(view.toggle()).toBeNull()
    expect((mounted as Mounted).container.querySelectorAll('button')).toHaveLength(1)
  })

  it('opens on a click to five buttons and `+2 more`, asks once, and leaves focus on the toggle', () => {
    const view = draw(7, false, false)
    const disclosure = view.disclosure()
    disclosure.focus()
    act(() => disclosure.click())
    expect(view.asked).toEqual([true])
    expect(view.disclosure()).toBe(disclosure)
    expect(document.activeElement).toBe(disclosure)
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    expect(disclosure.textContent).toBe('▾Mary can')
    expect(view.skills()).toHaveLength(5)
    expect(view.toggle()?.textContent).toBe('+2 more')
    expect(view.ran).toEqual([])
  })

  it('is a native button, so `Enter` and `Space` open it (no key handler in its source: tests/negative-surface.test.ts; nothing above it cancels them: app.test.tsx)', () => {
    const view = draw(7, false, false)
    expect(view.disclosure().type).toBe('button')
    expect(view.disclosure().tagName).toBe('BUTTON')
  })

  it('closes back to one button, and asks once more', () => {
    const view = draw(7)
    act(() => view.disclosure().click())
    expect(view.asked).toEqual([false])
    expect(view.skills()).toEqual([])
    expect(view.toggle()).toBeNull()
    expect(view.disclosure().textContent).toBe('▸Mary can· 7 skills')
  })

  it('starts the in-row expansion closed every time the row opens', () => {
    const view = draw(7)
    act(() => view.toggle()?.click())
    expect(view.skills()).toHaveLength(7)
    act(() => view.disclosure().click())
    act(() => view.disclosure().click())
    expect(view.skills()).toHaveLength(5)
    expect(view.toggle()?.textContent).toBe('+2 more')
  })

  it('forgets the expansion when the app closes the row, too', () => {
    const view = draw(7)
    act(() => view.toggle()?.click())
    view.setOpen(false)
    view.setOpen(true)
    expect(view.skills()).toHaveLength(5)
  })

  it('stays enabled while a turn is in flight, and toggles; only the skill buttons are held', () => {
    const view = draw(7, true, false)
    expect(view.disclosure().disabled).toBe(false)
    act(() => view.disclosure().click())
    const buttons = [...(mounted as Mounted).container.querySelectorAll<HTMLButtonElement>('button.skill-button')]
    expect(buttons).toHaveLength(5)
    expect(buttons.every((button) => button.disabled)).toBe(true)
    expect(view.disclosure().disabled).toBe(false)
    act(() => view.disclosure().click())
    expect(view.asked).toEqual([true, false])
  })

  it('asks for no change of its own when its menu or its hold changes (the app keeps the choice: app.test.tsx covers what it does)', () => {
    const view = draw(7, false, false)
    view.rerender(entries(3), true)
    view.rerender(entries(9), false)
    expect(view.disclosure().getAttribute('aria-expanded')).toBe('false')
    expect(view.asked).toEqual([])
  })
})

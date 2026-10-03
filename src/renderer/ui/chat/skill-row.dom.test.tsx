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

function draw(count: number, disabled = false) {
  const ran: string[] = []
  const element = (items: ReturnType<typeof entries>, off: boolean) =>
    createElement(SkillRow, { name: 'Mary', items, disabled: off, onRun: (code: string) => void ran.push(code) })
  const container = document.createElement('div')
  document.body.append(container)
  const react = createRoot(container)
  act(() => react.render(element(entries(count), disabled)))
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
    skills: (): string[] => [...root.container.querySelectorAll('button.skill-button')].map((b) => b.textContent ?? ''),
    toggle: (): HTMLButtonElement | null => root.container.querySelector<HTMLButtonElement>('button.skill-more'),
    rerender: (items: ReturnType<typeof entries>, off = disabled) => act(() => react.render(element(items, off)))
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

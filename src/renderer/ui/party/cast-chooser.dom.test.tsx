// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import { CORE_AGENT_IDS } from '../welcome/personas'
import '../testing/render-hook'
import { CastChooser } from './cast-chooser'

let container: HTMLElement
let root: Root

function render(agents: readonly AgentView[], onOpen: (cast: readonly string[]) => void): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(CastChooser, { agents, onOpen })))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const agent = (id: string, name: string, title = 'Role'): AgentView => ({
  id,
  module: 'bmm',
  name,
  title,
  icon: 'i',
  description: 'must not be shown'
})
const CORE = CORE_AGENT_IDS.map((id, at) => agent(id, `Core ${at}`, `Title ${at}`))
const EXTRA = [agent('bmad-agent-tech-writer', 'Paige', 'Technical Writer'), agent('custom-agent', 'Zed')]
const ROSTER = [...CORE.slice(0, 2), EXTRA[0], ...CORE.slice(2), EXTRA[1]]

const boxes = (): HTMLInputElement[] => [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
const open = (): HTMLButtonElement => container.querySelector('button.cast-chooser-open') as HTMLButtonElement
const toggle = (box: HTMLInputElement): void => act(() => box.click())

describe('CastChooser', () => {
  it('lists every roster agent as a labelled native checkbox, with a disc, name and title', () => {
    render(ROSTER, () => {})

    expect(boxes()).toHaveLength(ROSTER.length)
    const labels = [...container.querySelectorAll('label')]
    expect(labels).toHaveLength(ROSTER.length)
    expect(labels[2].textContent).toBe('PPaigeTechnical Writer')
    expect(labels[0].querySelector('input')).toBe(boxes()[0])
    // The disc is decoration to assistive technology: the label's own words name the checkbox.
    expect(labels[0].querySelector('[aria-hidden="true"] .initials.initials--thread')).not.toBeNull()
    expect(labels[0].querySelector('svg, img')).toBeNull()
    expect(container.textContent).not.toContain('must not be shown')
  })

  it('ticks the five core personas and nobody else by default', () => {
    render(ROSTER, () => {})

    expect(boxes().map((box) => box.checked)).toEqual([true, true, false, true, true, true, false])
  })

  it('sends the ticked ids in roster order when *Open the room* is pressed', () => {
    const casts: (readonly string[])[] = []
    render(ROSTER, (cast) => void casts.push(cast))

    toggle(boxes()[2])
    toggle(boxes()[0])
    act(() => open().click())

    expect(casts).toEqual([[CORE[1].id, EXTRA[0].id, CORE[2].id, CORE[3].id, CORE[4].id]])
  })

  it('disables the button with nobody ticked and sends nothing from it', () => {
    const casts: (readonly string[])[] = []
    render(ROSTER, (cast) => void casts.push(cast))
    expect(open().disabled).toBe(false)

    for (const box of boxes().filter((held) => held.checked)) toggle(box)

    expect(boxes().every((box) => !box.checked)).toBe(true)
    expect(open().disabled).toBe(true)
    act(() => open().form?.requestSubmit())
    expect(casts).toEqual([])
  })

  it('follows a roster that changes: an agent the user never touched is ticked while it is one of the five', () => {
    render(ROSTER.slice(0, 3), () => {})
    toggle(boxes()[2])
    act(() => root.render(createElement(CastChooser, { agents: ROSTER, onOpen: () => {} })))

    // The user's own tick of Paige stays; Core 2 to 4 arrive ticked.
    expect(boxes().map((box) => box.checked)).toEqual([true, true, true, true, true, true, false])
  })

  it('has one button and no spinner, count, badge or guidance', () => {
    render(ROSTER, () => {})

    expect(container.querySelectorAll('button')).toHaveLength(1)
    expect(open().textContent).toBe('Open the room')
    expect(container.querySelector('legend')?.textContent).toBe('Choose who is in the room')
    expect(container.innerHTML).not.toMatch(/spinner|skeleton|badge|aria-busy/i)
    expect(container.innerHTML).not.toMatch(/\d+ (?:selected|chosen)/)
  })
})

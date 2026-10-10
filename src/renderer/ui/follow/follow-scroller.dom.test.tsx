// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LIVE_REGIONS } from '../testing/audit-patterns'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { installFakeScroll } from '../testing/fake-scroll'
import type { FakeScroll } from '../testing/fake-scroll'
import { useFollowPause } from './follow-context'
import { FollowScroller } from './follow-scroller'

let fake: FakeScroll
let view: Mounted | null = null

beforeEach(() => {
  fake = installFakeScroll({ client: 400, height: 1000, top: 0 })
})
afterEach(() => {
  view?.unmount()
  view = null
  fake.restore()
})

type Props = { resetKey?: unknown; sends?: number; fieldRef?: RefObject<HTMLTextAreaElement | null>; children?: ReactNode }

const frame = (props: Props = {}) =>
  createElement(FollowScroller, { className: 'scroll', contentClassName: 'thread', ...props }, props.children ?? createElement('p', null, 'words'))

function show(props: Props = {}): void {
  view = mount(frame(props))
}

const scroller = (): HTMLElement => document.querySelector('.scroll') as HTMLElement
const latest = (): HTMLButtonElement | null => document.querySelector('button.follow-latest')

/** The user scrolls: the browser has moved the position, then tells the page. */
function userScrollsTo(top: number): void {
  fake.metrics.top = top
  act(() => void scroller().dispatchEvent(new Event('scroll')))
}

describe('FollowScroller', () => {
  it('opens at its bottom, following, with no control', () => {
    show()

    expect(fake.metrics.top).toBe(600)
    expect(latest()).toBeNull()
  })

  it('keeps the bottom as the content grows, in the same frame as the observer says so, instantly', () => {
    show()

    fake.metrics.height = 1500
    act(() => fake.resize())

    expect(fake.metrics.top).toBe(1100)
    expect(fake.sets.every((value) => typeof value === 'number')).toBe(true)
    expect(latest()).toBeNull()
  })

  it('keeps the bottom as the window is resized', () => {
    show()

    fake.metrics.client = 300
    act(() => fake.resize())

    expect(fake.metrics.top).toBe(700)
  })

  it('observes the scroller and its content', () => {
    show()

    expect(fake.observed()).toBe(2)
    view?.unmount()
    view = null
    expect(fake.observed()).toBe(0)
  })

  it('keeps the bottom on every render when there is no ResizeObserver', () => {
    fake.restore()
    fake = installFakeScroll({ client: 400, height: 1000, top: 0 }, false)
    show()
    expect(fake.metrics.top).toBe(600)

    fake.metrics.height = 1300
    view?.unmount()
    view = null
    show()

    expect(fake.metrics.top).toBe(900)
  })

  it('pauses when the user scrolls farther than a line up, and draws the control', () => {
    show()

    userScrollsTo(575)

    expect(latest()).not.toBeNull()
  })

  it('does not pause within a line of the bottom', () => {
    show()

    userScrollsTo(576)

    expect(latest()).toBeNull()
  })

  it('moves nothing on growth while paused, and keeps the control', () => {
    show()
    userScrollsTo(100)
    const before = fake.sets.length

    fake.metrics.height = 2000
    act(() => fake.resize())
    fake.metrics.client = 300
    act(() => fake.resize())

    expect(fake.metrics.top).toBe(100)
    expect(fake.sets).toHaveLength(before)
    expect(latest()).not.toBeNull()
  })

  it('resumes, and the control goes, when the user scrolls back to within a line', () => {
    show()
    userScrollsTo(100)

    userScrollsTo(590)
    expect(latest()).toBeNull()

    fake.metrics.height = 1400
    act(() => fake.resize())
    expect(fake.metrics.top).toBe(1000)
  })

  it('does not read its own scroll as the user leaving, when growth lands before the event is delivered', () => {
    show()
    const own = fake.metrics.top

    // A second burst arrives after the pin and before its scroll event: measured now the thread looks far away.
    fake.metrics.height = 3000
    act(() => void scroller().dispatchEvent(new Event('scroll')))

    expect(fake.metrics.top).toBe(own)
    expect(latest()).toBeNull()
  })

  it('reads a scroll to a different place as the user', () => {
    show()

    fake.metrics.height = 3000
    userScrollsTo(601)

    expect(latest()).not.toBeNull()
  })

  it('puts the thread at its bottom, following, when the control is pressed, and the focus in the composer', () => {
    function Frame() {
      const field = useRef<HTMLTextAreaElement>(null)
      return createElement(
        'div',
        null,
        createElement(FollowScroller, { className: 'scroll', contentClassName: 'thread', fieldRef: field }, 'words'),
        createElement('textarea', { ref: field })
      )
    }
    view = mount(createElement(Frame))
    userScrollsTo(100)

    act(() => latest()?.click())

    expect(fake.metrics.top).toBe(600)
    expect(latest()).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('textarea'))
    fake.metrics.height = 1200
    act(() => fake.resize())
    expect(fake.metrics.top).toBe(800)
  })

  it('has nothing to focus when no composer is mounted, and still goes to the bottom', () => {
    show()
    userScrollsTo(100)

    act(() => latest()?.click())

    expect(fake.metrics.top).toBe(600)
    expect(latest()).toBeNull()
  })

  it('is a frame, a scroller and its content, with a button as the only extra element and nothing announced', () => {
    show()
    userScrollsTo(100)

    const root = document.querySelector('.follow') as HTMLElement
    expect(root.children).toHaveLength(2)
    expect(root.children[0]).toBe(scroller())
    expect(scroller().firstElementChild?.classList.contains('thread')).toBe(true)
    const button = latest() as HTMLButtonElement
    expect(button.textContent).toBe('↓ latest')
    expect(root.children[1].contains(button)).toBe(true)
    expect(root.querySelectorAll('button')).toHaveLength(1)
    expect(root.querySelectorAll(`[role], [tabindex], [aria-label], ${LIVE_REGIONS}`)).toHaveLength(0)
  })

  it('goes at once a following view is shown: a hidden scroller has no height, and a shown one is at its bottom', () => {
    show()

    fake.metrics.client = 0
    act(() => fake.resize())
    fake.metrics.client = 400
    act(() => fake.resize())

    expect(fake.metrics.top).toBe(600)
    expect(latest()).toBeNull()
  })

  it('puts a paused view back at its offset when it is shown, still paused, even if the browser reset it', () => {
    show()
    userScrollsTo(100)

    // Hidden: no height, and the browser may drop the position.
    fake.metrics.client = 0
    act(() => fake.resize())
    fake.metrics.top = 0
    fake.metrics.client = 400
    act(() => fake.resize())

    expect(fake.metrics.top).toBe(100)
    expect(latest()).not.toBeNull()

    // Still paused: growth moves nothing, and a scroll to the bottom resumes following.
    fake.metrics.height = 1500
    act(() => fake.resize())
    expect(fake.metrics.top).toBe(100)
    userScrollsTo(1100)
    expect(latest()).toBeNull()
  })
})

describe('FollowScroller hidden', () => {
  it('is not resumed by a scroll event while hidden: shown again it is paused at its offset', () => {
    show()
    userScrollsTo(100)

    fake.metrics.client = 0
    act(() => fake.resize())
    fake.metrics.top = 0
    act(() => void scroller().dispatchEvent(new Event('scroll')))
    expect(latest()).not.toBeNull()

    fake.metrics.client = 400
    act(() => fake.resize())

    expect(fake.metrics.top).toBe(100)
    expect(latest()).not.toBeNull()
  })
})

describe('FollowScroller with a changing thread', () => {
  function Host({ resetKey, sends }: { resetKey: string; sends: number }) {
    return createElement(FollowScroller, { className: 'scroll', contentClassName: 'thread', resetKey, sends }, 'words')
  }

  it('goes to the bottom, following, when the persona changes or a send raises the count, and when neither', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const draw = (resetKey: string, sends: number): void => act(() => root.render(createElement(Host, { resetKey, sends })))

    draw('mary', 0)
    userScrollsTo(100)
    expect(latest()).not.toBeNull()

    draw('mary', 0)
    expect(latest()).not.toBeNull()
    expect(fake.metrics.top).toBe(100)

    draw('mary', 1)
    expect(fake.metrics.top).toBe(600)
    expect(latest()).toBeNull()

    userScrollsTo(100)
    draw('john', 1)
    expect(fake.metrics.top).toBe(600)
    expect(latest()).toBeNull()

    // A count that falls (a window that holds fewer turns) is not a send.
    userScrollsTo(100)
    draw('john', 0)
    expect(fake.metrics.top).toBe(100)
    expect(latest()).not.toBeNull()

    act(() => root.unmount())
    container.remove()
  })
})

describe('the reveal pauses following', () => {
  function Card({ onReveal }: { onReveal: (pause: () => void) => void }) {
    const pause = useFollowPause()
    onReveal(pause)
    return createElement('span', { className: 'card' })
  }

  it('leaves the thread paused after its own scroll, with the control drawn, and only the user resumes it', () => {
    let pause: () => void = () => {}
    show({ children: createElement(Card, { onReveal: (given) => void (pause = given) }) })
    expect(latest()).toBeNull()

    // The reveal scrolls to the card, then pauses; the scroll event it causes carries the position pause read.
    fake.metrics.top = 250
    act(() => pause())
    act(() => void scroller().dispatchEvent(new Event('scroll')))

    expect(latest()).not.toBeNull()
    fake.metrics.height = 2000
    act(() => fake.resize())
    expect(fake.metrics.top).toBe(250)

    userScrollsTo(1590)
    expect(latest()).toBeNull()
  })

  it('stays paused when the card it scrolled to is at the bottom: its own scroll event resumes nothing', () => {
    let pause: () => void = () => {}
    show({ children: createElement(Card, { onReveal: (given) => void (pause = given) }) })

    fake.metrics.top = 595
    act(() => pause())
    act(() => void scroller().dispatchEvent(new Event('scroll')))

    expect(latest()).not.toBeNull()
    // The user's next scroll, even a small one, is theirs.
    userScrollsTo(596)
    expect(latest()).toBeNull()
  })

  it('is a no-op outside a thread', () => {
    let pause: (() => void) | null = null
    view = mount(createElement(Card, { onReveal: (given) => void (pause = given) }))

    expect(() => pause?.()).not.toThrow()
  })
})

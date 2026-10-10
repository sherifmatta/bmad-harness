// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { formatEventTime } from '../chat/format-turn-time'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import type { ActivityRow } from './board-activity'
import { ActivityPanel } from './board-activity-panel'

let mounted: Mounted | null = null

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

const rows: ActivityRow[] = [
  { key: 'r1:start', name: 'Ada', did: 'started CP', at: 1_700_000_000_000, state: 'work', pulse: true },
  { key: 'r2:end', name: 'Ben', did: 'finished CP', at: 1_700_000_060_000, state: 'idle', pulse: false },
  { key: 'r2:start', name: 'Ben', did: 'started CP', at: 1_699_999_000_000, state: 'work', pulse: false }
]

describe('ActivityPanel (Story 6.7)', () => {
  it('draws the head, then one row per event with its dot, name, words and absolute time', () => {
    mounted = mount(createElement(ActivityPanel, { rows }))
    const root = mounted.container

    expect(root.querySelector('.board-activity-head')?.textContent).toBe('recent activity')
    const items = [...root.querySelectorAll('.board-activity-row')]
    expect(items).toHaveLength(3)
    expect(items[0]?.querySelector('.board-activity-who')?.textContent).toBe('Ada')
    expect(items[0]?.querySelector('.board-activity-did')?.textContent).toBe('started CP')
    expect(items[0]?.querySelector('.board-activity-time')?.textContent).toBe(formatEventTime(rows[0]!.at))
    expect(items[0]?.querySelector('.status-dot--work')).not.toBeNull()
    expect(items[1]?.querySelector('.status-dot--idle')).not.toBeNull()
  })

  it('makes only the pulsing row’s dot free of the still class', () => {
    mounted = mount(createElement(ActivityPanel, { rows }))
    const items = [...mounted.container.querySelectorAll('.board-activity-row')]

    expect(items.map((item) => item.classList.contains('board-activity-still'))).toEqual([false, true, true])
  })

  it('is text: no control, tab stop, role, live region or tooltip', () => {
    mounted = mount(createElement(ActivityPanel, { rows }))
    const all = [...mounted.container.querySelectorAll('*')]

    expect(mounted.container.querySelector('button, input, a')).toBeNull()
    expect(all.some((el) => el.getAttributeNames().some((name) => name === 'role' || name === 'tabindex' || name === 'title' || (name.startsWith('aria-') && name !== 'aria-hidden')))).toBe(false)
  })

  it('draws the head over an empty list, with no empty-state text', () => {
    mounted = mount(createElement(ActivityPanel, { rows: [] }))

    expect(mounted.container.querySelector('.board-activity-head')?.textContent).toBe('recent activity')
    expect(mounted.container.querySelectorAll('.board-activity-row')).toHaveLength(0)
    expect(mounted.container.textContent).toBe('recent activity')
  })
})

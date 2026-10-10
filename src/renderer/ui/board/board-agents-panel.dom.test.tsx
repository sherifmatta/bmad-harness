// @vitest-environment jsdom
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentView } from '../../../shared/install'
import { createProseStore } from '../chat/prose-store'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { AgentsPanel } from './board-agents-panel'

const NOW = 1_700_000_000_000
const agent: AgentView = { id: 'a', module: 'bmm', name: 'Ada', title: 'Role', icon: 'i', description: 'd' }
let mounted: Mounted | null = null

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.useRealTimers()
})

describe('AgentsPanel’s run line (Story 6.6)', () => {
  it('ticks the run’s elapsed once a second, from the run’s own start', () => {
    mounted = mount(
      createElement(AgentsPanel, {
        rows: [{ agent, state: 'work', run: { runId: 'r1', code: 'CP', startedAt: NOW - 7_000 } }],
        prose: createProseStore({ raf: () => undefined })
      })
    )
    const line = (): string => mounted!.container.querySelector('.board-agent-run')?.textContent ?? ''

    expect(line()).toBe('CP 7s')
    act(() => void vi.advanceTimersByTime(1000))
    expect(line()).toBe('CP 8s')
    act(() => void vi.advanceTimersByTime(3000))
    expect(line()).toBe('CP 11s')
  })

  it('runs no timer for a row that is not on a run', () => {
    mounted = mount(createElement(AgentsPanel, { rows: [{ agent, state: 'work' }], prose: undefined }))

    expect(vi.getTimerCount()).toBe(0)
    expect(mounted.container.querySelector('.board-agent-run')?.textContent).toBe('in a turn')
  })
})

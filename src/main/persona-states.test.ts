import { describe, expect, it } from 'vitest'
import type { ContractEvent } from '../shared/events'
import { SESSION_EVENT_CHANNEL, personaProjectionFor } from './persona-states'

class FakeWindow {
  sent: [string, ContractEvent][] = []
  destroyed = false
  send(channel: string, event: ContractEvent) {
    this.sent.push([channel, event])
  }
  isDestroyed() {
    return this.destroyed
  }
}

const opened: ContractEvent = {
  name: 'session:opened',
  payload: { sessionId: 's1', agentId: 'bmad-agent-pm', at: 7 }
}

describe('the per-window persona projection', () => {
  it('is the same one for every ask about a window, so two bridges fold into one table', () => {
    const window = new FakeWindow()

    expect(personaProjectionFor(window)).toBe(personaProjectionFor(window))
    expect(personaProjectionFor(new FakeWindow())).not.toBe(personaProjectionFor(window))
  })

  it('sends persona:state on the session event channel', () => {
    const window = new FakeWindow()
    personaProjectionFor(window).apply(opened)

    expect(window.sent).toEqual([
      [
        SESSION_EVENT_CHANNEL,
        { name: 'persona:state', payload: { agentId: 'bmad-agent-pm', state: 'work', at: 7 } }
      ]
    ])
    expect(SESSION_EVENT_CHANNEL).toBe('session:event')
  })

  it('says nothing to a destroyed window', () => {
    const window = new FakeWindow()
    const projection = personaProjectionFor(window)
    window.destroyed = true
    projection.apply(opened)

    expect(window.sent).toEqual([])
  })
})

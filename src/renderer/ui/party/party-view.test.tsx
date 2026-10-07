import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import type { TranscriptEntry } from '../chat/transcript-entry'
import { PartyView } from './party-view'

const mary: AgentView = { id: 'bmad-agent-analyst', module: 'bmm', name: 'Mary', title: 'Analyst', icon: 'i', description: 'd' }

const ROOM_LINE: TranscriptEntry = {
  kind: 'sysline',
  id: 'm-1',
  at: 5,
  text: 'room opened by you · present · Mary',
  room: true
}
const OTHERS: TranscriptEntry[] = [
  { kind: 'user', id: 'u1', at: 1, text: 'hello there' },
  { kind: 'persona', id: 'p1', at: 2, agent: mary, text: 'good morning' },
  { kind: 'sysline', id: 'm-0', at: 3, text: 'handed off · Mary → John' }
]

const render = (room: string | undefined, entries: readonly TranscriptEntry[]): string =>
  renderToStaticMarkup(<PartyView agents={[mary]} room={room} entries={entries} onOpen={() => {}} />)

describe('PartyView', () => {
  it('is the chooser while there is no live room, whatever the transcript holds', () => {
    const markup = render(undefined, [...OTHERS, ROOM_LINE])

    expect(markup).toContain('cast-chooser')
    expect(markup).not.toContain('party-thread')
    expect(markup).not.toContain('room opened by you')
  })

  it('is the party thread once a room is live, replacing the chooser', () => {
    const markup = render('s1', [ROOM_LINE])

    expect(markup).toContain('party-thread')
    expect(markup).not.toContain('cast-chooser')
    expect(markup).toContain('<div class="sysline"><span class="sysline-text">room opened by you · present · Mary</span></div>')
  })

  it('draws only the room’s syslines: no turn, no persona line and no other sysline', () => {
    const markup = render('s1', [...OTHERS, ROOM_LINE])

    expect(markup.match(/class="sysline"/g)).toHaveLength(1)
    expect(markup).not.toContain('hello there')
    expect(markup).not.toContain('good morning')
    expect(markup).not.toContain('handed off')
    expect(markup).not.toMatch(/class="turn|portrait|initials|<button|<input/)
  })

  it('draws the room’s lines in time order, with no name, portrait or time', () => {
    const later: TranscriptEntry = { ...ROOM_LINE, id: 'm-2', at: 9, text: 'session ended · the process exited' }
    const markup = render('s1', [later, ROOM_LINE])

    expect(markup.indexOf('room opened by you')).toBeLessThan(markup.indexOf('session ended'))
    expect(markup).not.toMatch(/<time|turn-time|turn-name/)
  })
})

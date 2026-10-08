import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import type { RailRow } from '../../../shared/rail'
import type { TranscriptEntry } from '../chat/transcript-entry'
import { PartyView } from './party-view'

const mary: AgentView = { id: 'bmad-agent-analyst', module: 'bmm', name: 'Mary', title: 'Analyst', icon: 'i', description: 'd' }
const john: AgentView = { id: 'bmad-agent-pm', module: 'bmm', name: 'John', title: 'Product Manager', icon: 'p', description: 'd' }

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

const render = (
  room: string | undefined,
  entries: readonly TranscriptEntry[],
  speaker?: string,
  cast: readonly string[] = [mary.id, john.id],
  extra: { topic?: string; openedAt?: number; turns?: number; rows?: readonly RailRow[] } = {}
): string =>
  renderToStaticMarkup(
    <PartyView
      agents={[mary, john]}
      room={room}
      roomCast={cast}
      speaker={speaker}
      entries={entries}
      topic={extra.topic}
      openedAt={extra.openedAt ?? Date.parse('2026-10-08T14:31:00')}
      turns={extra.turns ?? 0}
      rows={extra.rows ?? []}
      onOpen={() => {}}
      onSend={() => {}}
    />
  )

describe('PartyView', () => {
  it('is the chooser while there is no live room, whatever the transcript holds', () => {
    const markup = render(undefined, [...OTHERS, ROOM_LINE])

    expect(markup).toContain('cast-chooser')
    expect(markup).not.toContain('party-thread')
    expect(markup).not.toContain('cast-strip')
    expect(markup).not.toContain('room opened by you')
  })

  it('is the header, the strip, the party thread, the composer and the Room panel once a room is live', () => {
    const markup = render('s1', [ROOM_LINE])

    expect(markup).toContain('party-head')
    expect(markup).toContain('party-side')
    expect(markup.indexOf('party-head')).toBeLessThan(markup.indexOf('cast-strip'))
    expect(markup.indexOf('party-main')).toBeLessThan(markup.indexOf('party-side'))
  })

  it('draws neither header nor panel while there is no live room', () => {
    const markup = render(undefined, [ROOM_LINE])

    expect(markup).not.toContain('party-head')
    expect(markup).not.toContain('party-side')
  })

  it('counts the participants from the cast and reads the topic into header and panel', () => {
    const markup = render('s1', [ROOM_LINE], undefined, [mary.id, john.id], {
      topic: 'Payouts —',
      turns: 3,
      rows: [
        { path: '_bmad/PRD.md', state: 'saved', savedAt: 1 },
        { path: '_bmad/party/x.md', state: 'saved', savedAt: 1, room: true }
      ]
    })

    expect(markup).toContain('2 participants')
    expect(markup).toContain('14:31 by you')
    expect(markup).toContain('_bmad/PRD.md')
    expect(markup).not.toContain('_bmad/party/x.md')
    expect(markup).toContain('turn 3 · ')
    expect(markup.match(/>Payouts —</g)).toHaveLength(2)
    expect(markup).toContain('_bmad/party/2026-10-08-payouts.md')
    expect(markup).not.toContain('no topic yet')
  })

  it('is the strip, the party thread and the composer once a room is live, replacing the chooser', () => {
    const markup = render('s1', [ROOM_LINE])

    expect(markup).toContain('party-thread')
    expect(markup).toContain('cast-strip')
    expect(markup).toContain('message the room')
    expect(markup).not.toContain('cast-chooser')
    expect(markup).toContain('<div class="sysline"><span class="sysline-text">room opened by you · present · Mary</span></div>')
  })

  it('draws only the room’s entries: no 1:1 turn, persona line or other sysline', () => {
    const markup = render('s1', [...OTHERS, ROOM_LINE])

    expect(markup.match(/class="sysline"/g)).toHaveLength(1)
    expect(markup).not.toContain('hello there')
    expect(markup).not.toContain('good morning')
    expect(markup).not.toContain('handed off')
    expect(markup).not.toMatch(/class="turn/)
  })

  it('draws the room’s lines in time order', () => {
    const later: TranscriptEntry = { ...ROOM_LINE, id: 'm-2', at: 9, text: 'session ended · the process exited' }
    const markup = render('s1', [later, ROOM_LINE])

    expect(markup.indexOf('room opened by you')).toBeLessThan(markup.indexOf('session ended'))
  })

  it('draws a party turn for each room persona entry and the user’s room message, in time order, never queued', () => {
    const turns: TranscriptEntry[] = [
      { kind: 'persona', id: 'p2', at: 20, agent: john, text: 'No.', room: true },
      { kind: 'user', id: 'u2', at: 10, text: 'what do you think', room: true },
      { kind: 'persona', id: 'p3', at: 15, agent: mary, text: 'Hi.', room: true },
      ...OTHERS
    ]
    const markup = render('s1', turns)

    expect(markup.indexOf('what do you think')).toBeLessThan(markup.indexOf('Hi.'))
    expect(markup.indexOf('Hi.')).toBeLessThan(markup.indexOf('No.'))
    expect(markup).not.toContain('good morning')
    expect(markup).not.toContain('hello there')
    expect(markup).not.toContain('turn--queued')
    expect(markup).not.toContain('queued')
    expect(markup).toContain('turn-name">Mary<')
    expect(markup).toContain('turn-role">Analyst<')
    expect(markup).not.toMatch(/disagrees|evidence|unresolved|turn-tag|decision/)
  })

  it('puts the accent edge on the latest turn of the speaker only, and on nobody when no one speaks', () => {
    const turns: TranscriptEntry[] = [
      { kind: 'persona', id: 'p1', at: 1, agent: mary, text: 'one', room: true },
      { kind: 'persona', id: 'p2', at: 2, agent: john, text: 'two', room: true },
      { kind: 'persona', id: 'p3', at: 3, agent: mary, text: 'three', room: true }
    ]

    expect(render('s1', turns, mary.id).match(/turn--party-live/g)).toHaveLength(1)
    expect(render('s1', turns, mary.id)).toMatch(/turn--party-live[^]*three/)
    expect(render('s1', turns, john.id)).not.toContain('turn--party-live')
    expect(render('s1', turns, undefined)).not.toContain('turn--party-live')
  })
})

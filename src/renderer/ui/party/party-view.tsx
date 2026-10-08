import { useEffect, useRef } from 'react'
import type { JSX } from 'react'

import './party-view.css'
import type { AgentView } from '../../../shared/install'
import type { RailRow } from '../../../shared/rail'
import { Composer } from '../chat/composer'
import { Sysline } from '../chat/sysline'
import { orderEntries } from '../chat/transcript'
import type { TranscriptEntry } from '../chat/transcript-entry'
import { UserTurn } from '../chat/turn'
import { FollowScroller } from '../follow/follow-scroller'
import { CastChooser } from './cast-chooser'
import { CastStrip } from './cast-strip'
import { PartyHeader } from './party-header'
import { PartyTurn } from './party-turn'
import { RoomPanel } from './room-panel'

/** The entries the party thread draws: what the room said, what the user said into it, and the harness's lines about it. */
function isRoomEntry(entry: TranscriptEntry): boolean {
  return entry.kind !== 'run' && entry.room === true
}

/**
 * The party view: the cast chooser while the window has no live room (Story 4.1), and while it
 * has one the party header above a row of the cast strip, the party thread and the composer (Story 4.2)
 * and the Room side panel (Story 4.3). The thread draws only the
 * room's entries, in time order: a persona's turn as a party turn, the user's own words as the user
 * turn (never queued: the room has no gate), and the harness's lines about the room as syslines.
 *
 * When the room goes (Story 4.5), its entries stay: with no live room and at least one room entry
 * the same thread is drawn read-only, none of it speaking, above the chooser in the one column, with
 * no header, strip, panel or composer. With none it is the chooser alone.
 *
 * When the room opens, or goes, the button the user pressed goes with the control, so the thread
 * takes focus (it is focusable by script only) if focus was inside this view and has
 * nowhere else to be; a room that was already live on first render takes none.
 *
 * Both views of the shell stay mounted, so this is rendered whether or not it is the one
 * showing; the switch hides it and nothing it holds is lost.
 */
export function PartyView({
  agents,
  room,
  roomCast,
  speaker,
  entries,
  topic,
  openedAt,
  turns,
  returned,
  rows,
  onOpen,
  onSend,
  onWriteSummary,
  onStop
}: {
  agents: readonly AgentView[]
  /** The window's live room session, or `undefined` while there is none. */
  room: string | undefined
  /** The agent ids chosen for the room, in roster order; the strip has a card for each. */
  roomCast: readonly string[]
  /** The agent id of the persona speaking now, or `undefined`. */
  speaker: string | undefined
  /** The whole transcript; only the room's entries are drawn. */
  entries: readonly TranscriptEntry[]
  /** What the room is about: the user's first message into it, shaped; `undefined` until then. */
  topic: string | undefined
  /** When the room opened, in epoch milliseconds. */
  openedAt: number | undefined
  /** How many turns the room has had. */
  turns: number
  /** The user's words the room refused as busy, handed back to the room's composer (Story 4.8). */
  returned?: { key: number; text: string }
  /** The rail's rows: the panel lists those a room did not write as the room's context. */
  rows: readonly RailRow[]
  /** Called with the ticked agent ids when *Open the room* is pressed. */
  onOpen: (cast: readonly string[]) => void
  /** Called with the user's message for the room; the composer is never gated. */
  onSend: (text: string) => void
  /** Called when *Write summary to `_bmad/`* is pressed; the header's button is disabled without it. */
  onWriteSummary?: () => void
  /** Called when `stop room` is pressed (Story 4.5); the header draws the control only with it. */
  onStop?: () => void
}): JSX.Element {
  const ordered = orderEntries(entries.filter(isRoomEntry))
  let lastSpoken = -1
  ordered.forEach((entry, index) => {
    if (entry.kind === 'persona') lastSpoken = index
  })
  const live = room !== undefined
  const focusInside = useRef(false)
  const wasLive = useRef(live)
  const thread = useRef<HTMLDivElement>(null)
  // The room's composer field, which the thread's `↓ latest` puts focus in (Story 5.3).
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const sends = ordered.filter((entry) => entry.kind === 'user').length
  /** The party thread, live or read-only; a stopped room has the same turns, none of them speaking. */
  const threadOf = (
    <div className="party-thread" ref={thread} tabIndex={-1}>
      {ordered.map((entry, index) => {
        if (entry.kind === 'persona') {
          return (
            <PartyTurn
              key={entry.id}
              agent={entry.agent}
              at={entry.at}
              text={entry.text}
              live={live && index === lastSpoken && speaker === entry.agent.id}
            />
          )
        }
        if (entry.kind === 'user') {
          return <UserTurn key={entry.id} at={entry.at} text={entry.text} user={entry.user} />
        }
        return entry.kind === 'sysline' ? <Sysline key={entry.id} text={entry.text} /> : null
      })}
    </div>
  )
  useEffect(() => {
    const changed = live !== wasLive.current
    wasLive.current = live
    const active = document.activeElement
    // The room opened or went: the button or control the user pressed went with it, so the thread takes focus.
    if (changed && focusInside.current && (active === null || active === document.body)) {
      thread.current?.focus()
    }
  }, [live])
  return (
    <div
      className="party-view"
      onFocusCapture={() => void (focusInside.current = true)}
      onBlurCapture={(event) => {
        // Focus that went to another element is the user's own move; one that went nowhere is a removal.
        if (event.relatedTarget !== null) focusInside.current = false
      }}
    >
      {room === undefined ? (
        <div className="party-scroll">
          <div className="party-column">
            {ordered.length > 0 && threadOf}
            <CastChooser agents={agents} onOpen={onOpen} />
          </div>
        </div>
      ) : (
        <>
          <PartyHeader
            topic={topic}
            participants={roomCast.length}
            openedAt={openedAt}
            turns={turns}
            onWriteSummary={onWriteSummary}
            onStop={onStop}
          />
          <div className="party-body">
            <div className="party-main">
              <CastStrip agents={agents} cast={roomCast} speaker={speaker} />
              <FollowScroller
                className="party-scroll"
                contentClassName="party-column"
                resetKey={room}
                sends={sends}
                fieldRef={fieldRef}
              >
                {threadOf}
              </FollowScroller>
              <Composer agentName="the room" onSend={onSend} returned={returned} fieldRef={fieldRef} />
            </div>
            <RoomPanel topic={topic} openedAt={openedAt} rows={rows} />
          </div>
        </>
      )}
    </div>
  )
}

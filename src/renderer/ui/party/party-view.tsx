import { useEffect, useRef } from 'react'
import type { JSX } from 'react'

import './party-view.css'
import type { AgentView } from '../../../shared/install'
import { Composer } from '../chat/composer'
import { Sysline } from '../chat/sysline'
import { orderEntries } from '../chat/transcript'
import type { TranscriptEntry } from '../chat/transcript-entry'
import { UserTurn } from '../chat/turn'
import { CastChooser } from './cast-chooser'
import { CastStrip } from './cast-strip'
import { PartyTurn } from './party-turn'

/** The entries the party thread draws: what the room said, what the user said into it, and the harness's lines about it. */
function isRoomEntry(entry: TranscriptEntry): boolean {
  return entry.kind !== 'run' && entry.room === true
}

/**
 * The party view: the cast chooser while the window has no live room (Story 4.1), and while it
 * has one the cast strip, the party thread and the composer (Story 4.2). The thread draws only the
 * room's entries, in time order: a persona's turn as a party turn, the user's own words as the user
 * turn (never queued: the room has no gate), and the harness's lines about the room as syslines.
 *
 * When the room opens, the button the user pressed goes with the chooser, so the thread
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
  onOpen,
  onSend
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
  /** Called with the ticked agent ids when *Open the room* is pressed. */
  onOpen: (cast: readonly string[]) => void
  /** Called with the user's message for the room; the composer is never gated. */
  onSend: (text: string) => void
}): JSX.Element {
  const turns = orderEntries(entries.filter(isRoomEntry))
  let lastSpoken = -1
  turns.forEach((entry, index) => {
    if (entry.kind === 'persona') lastSpoken = index
  })
  const live = room !== undefined
  const focusInside = useRef(false)
  const wasLive = useRef(live)
  const thread = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opened = live && !wasLive.current
    wasLive.current = live
    const active = document.activeElement
    if (opened && focusInside.current && (active === null || active === document.body)) {
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
            <CastChooser agents={agents} onOpen={onOpen} />
          </div>
        </div>
      ) : (
        <>
          <CastStrip agents={agents} cast={roomCast} speaker={speaker} />
          <div className="party-scroll">
            <div className="party-column">
              <div className="party-thread" ref={thread} tabIndex={-1}>
                {turns.map((entry, index) => {
                  if (entry.kind === 'persona') {
                    return (
                      <PartyTurn
                        key={entry.id}
                        agent={entry.agent}
                        at={entry.at}
                        text={entry.text}
                        live={index === lastSpoken && speaker === entry.agent.id}
                      />
                    )
                  }
                  if (entry.kind === 'user') {
                    return <UserTurn key={entry.id} at={entry.at} text={entry.text} user={entry.user} />
                  }
                  return entry.kind === 'sysline' ? <Sysline key={entry.id} text={entry.text} /> : null
                })}
              </div>
            </div>
          </div>
          <Composer agentName="the room" onSend={onSend} />
        </>
      )}
    </div>
  )
}

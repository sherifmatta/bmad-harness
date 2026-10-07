import { useEffect, useRef } from 'react'
import type { JSX } from 'react'

import './party-view.css'
import type { AgentView } from '../../../shared/install'
import { Sysline } from '../chat/sysline'
import { orderEntries } from '../chat/transcript'
import type { SyslineEntry, TranscriptEntry } from '../chat/transcript-entry'
import { CastChooser } from './cast-chooser'

/** A line the harness said about a room: the only entries the party thread draws. */
function isRoomLine(entry: TranscriptEntry): entry is SyslineEntry & { room: true } {
  return entry.kind === 'sysline' && entry.room === true
}

/**
 * The party view (Story 4.1): the cast chooser while the window has no live room, and
 * the party thread while it has one. The thread draws only the lines the harness wrote
 * about the room, in the one `Sysline` component, with no portrait, name or time: the
 * room's own words, its cast strip, header and composer are the stories after this one.
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
  entries,
  onOpen
}: {
  agents: readonly AgentView[]
  /** The window's live room session, or `undefined` while there is none. */
  room: string | undefined
  /** The whole transcript; only the room's sysline entries are drawn. */
  entries: readonly TranscriptEntry[]
  /** Called with the ticked agent ids when *Open the room* is pressed. */
  onOpen: (cast: readonly string[]) => void
}): JSX.Element {
  const lines = orderEntries(entries.filter(isRoomLine))
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
      <div className="party-column">
        {room === undefined ? (
          <CastChooser agents={agents} onOpen={onOpen} />
        ) : (
          <div className="party-thread" ref={thread} tabIndex={-1}>
            {lines.map((entry) => (
              <Sysline key={entry.id} text={entry.text} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

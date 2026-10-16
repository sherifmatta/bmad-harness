import { useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'

import type { AgentView, MenuEntryView } from '../../../shared/install'
import type { PersonaState } from '../status/persona-state'
import { stateOf } from '../status/persona-state'
import { skillKey } from '../status/skill-seat'
import type { SkillSeat } from '../status/skill-seat'
import { PersonaTile, SkillSeatTile } from './persona-tile'
import { displayOrder, groupAgents, showsHeadings } from './tile-groups'
import { tabStopId, tileMove } from './tile-nav'

/** No skill-first session: no `Skill sessions` group. */
const NO_SEATS: readonly SkillSeat[] = []

/**
 * The rail's Team half (FR18, FR22, UX-DR16): one tile per installed agent,
 * grouped by `module` and `team` in config order, as one roving-tabindex list.
 *
 * The list is one tab stop (NFR20). Exactly one tile holds `tabindex="0"` —
 * the one last moved to or activated, else the current one — and arrow travel
 * between tiles is `tileMove`'s. Activation is the native click; it makes that
 * tile current and takes the tab stop, and focus stays where it is. When the
 * current persona changes some other way, the tab stop follows it.
 *
 * A skill-first session's seat (Story 7.5) is a row of the same list, in a `Skill sessions` group below every
 * persona group, in start order, drawn only while one exists. The roving list covers them as it covers the tiles;
 * `currentSeatId` marks the one the chat is turned to, and then no persona tile is current.
 *
 * `states` is read and never written: a tile's state is `states.get(id)` or
 * `idle`, fed by what main reports of each persona's sessions. `since` is when
 * that state began, which a `work` tile counts its elapsed time from.
 */
export function Team({
  agents,
  menus,
  states,
  since,
  currentId,
  onSelect,
  skillSeats = NO_SEATS,
  currentSeatId = null,
  onSelectSeat
}: {
  agents: readonly AgentView[]
  menus: Readonly<Record<string, readonly MenuEntryView[]>>
  states: ReadonlyMap<string, PersonaState>
  since?: ReadonlyMap<string, number>
  currentId: string | null
  onSelect: (id: string) => void
  /** The skill-first sessions, in start order. */
  skillSeats?: readonly SkillSeat[]
  /** The session id of the seat the chat is turned to, if one is. */
  currentSeatId?: string | null
  /** Called with a seat's session id when it is chosen. */
  onSelectSeat?: (sessionId: string) => void
}): JSX.Element | null {
  const [movedToId, setMovedToId] = useState<string | null>(null)
  const currentKey = currentSeatId === null ? currentId : skillKey(currentSeatId)
  const [seenCurrentId, setSeenCurrentId] = useState(currentKey)
  const tiles = useRef(new Map<string, HTMLButtonElement>())

  // The current persona can change without a tile being touched (`@<name>` in
  // the composer): the tab stop and `aria-current` then follow it, so the two
  // never name different tiles. Arrow travel still moves the tab stop alone.
  if (seenCurrentId !== currentKey) {
    setSeenCurrentId(currentKey)
    setMovedToId(null)
  }

  const groups = groupAgents(agents)
  const order = displayOrder(groups)
  if (order.length === 0 && skillSeats.length === 0) {
    return null
  }
  const ids = [...order.map((agent) => agent.id), ...skillSeats.map(({ sessionId }) => skillKey(sessionId))]
  const tabStop = tabStopId(ids, movedToId, currentKey)
  const headed = showsHeadings(groups)

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    // A chord is the OS's or the app's, never a tile move.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    const to = tileMove(event.key, index, ids.length)
    const target = to === null ? undefined : ids[to]
    if (target === undefined) {
      return
    }
    // An arrow would otherwise scroll the rail; Enter and Space never reach here.
    event.preventDefault()
    setMovedToId(target)
    tiles.current.get(target)?.focus()
  }

  function select(id: string): void {
    setMovedToId(id)
    onSelect(id)
  }

  function selectSeat(sessionId: string): void {
    setMovedToId(skillKey(sessionId))
    onSelectSeat?.(sessionId)
  }

  /** A seat's start time shows only while another seat shares its name. */
  const timed = (seat: SkillSeat): boolean => skillSeats.some((other) => other !== seat && other.skill === seat.skill)

  return (
    <div className="team-list" role="group" aria-label="Team">
      {groups.map((group) => (
        <div key={group.key} className="team-group">
          {headed && <div className="rail-group">{group.heading}</div>}
          {group.agents.map((agent) => {
            const index = ids.indexOf(agent.id)
            return (
              <PersonaTile
                key={agent.id}
                agent={agent}
                codes={(Object.hasOwn(menus, agent.id) ? menus[agent.id] ?? [] : []).map(
                  (entry) => entry.code
                )}
                state={stateOf(agent.id, states)}
                since={since?.get(agent.id)}
                current={agent.id === currentId}
                tabStop={agent.id === tabStop}
                onSelect={select}
                onKeyDown={(event) => onKeyDown(event, index)}
                tileRef={(element) => {
                  if (element === null) {
                    tiles.current.delete(agent.id)
                  } else {
                    tiles.current.set(agent.id, element)
                  }
                }}
              />
            )
          })}
        </div>
      ))}
      {skillSeats.length > 0 && (
        <div className="team-group">
          <div className="rail-group">Skill sessions</div>
          {skillSeats.map((seat) => {
            const key = skillKey(seat.sessionId)
            const index = ids.indexOf(key)
            return (
              <SkillSeatTile
                key={key}
                seat={seat}
                timed={timed(seat)}
                current={seat.sessionId === currentSeatId}
                tabStop={key === tabStop}
                onSelect={selectSeat}
                onKeyDown={(event) => onKeyDown(event, index)}
                tileRef={(element) => {
                  if (element === null) {
                    tiles.current.delete(key)
                  } else {
                    tiles.current.set(key, element)
                  }
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

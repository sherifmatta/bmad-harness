import { useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'

import type { AgentView, MenuEntryView } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import { stateOf } from '../status/persona-state'
import { PersonaTile } from './persona-tile'
import { displayOrder, groupAgents, showsHeadings } from './tile-groups'
import { tabStopId, tileMove } from './tile-nav'

/**
 * The rail's Team half (FR18, FR22, UX-DR16): one tile per installed agent,
 * grouped by `module` and `team` in config order, as one roving-tabindex list.
 *
 * The list is one tab stop (NFR20). Exactly one tile holds `tabindex="0"` —
 * the one last moved to or activated, else the current one — and arrow travel
 * between tiles is `tileMove`'s. Activation is the native click; it makes that
 * tile current and takes the tab stop, and focus stays where it is.
 *
 * `states` is read and never written: a tile's state is `states.get(id)` or
 * `idle`, the seam Epic 2's sessions will feed.
 */
export function Team({
  agents,
  menus,
  states,
  currentId,
  onSelect
}: {
  agents: readonly AgentView[]
  menus: Readonly<Record<string, readonly MenuEntryView[]>>
  states: ReadonlyMap<string, PersonaState>
  currentId: string | null
  onSelect: (id: string) => void
}): JSX.Element | null {
  const [movedToId, setMovedToId] = useState<string | null>(null)
  const tiles = useRef(new Map<string, HTMLButtonElement>())

  const groups = groupAgents(agents)
  const order = displayOrder(groups)
  if (order.length === 0) {
    return null
  }
  const ids = order.map((agent) => agent.id)
  const tabStop = tabStopId(ids, movedToId, currentId)
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
    </div>
  )
}

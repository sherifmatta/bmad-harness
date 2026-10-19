import type { JSX } from 'react'

import './thread-intro.css'
import type { AgentView, MenuEntryView } from '../../../shared/install'
import { Initials } from '../persona/initials'

/**
 * What a thread holds before the first message: who the current persona is, what
 * the roster says they do, and the codes of their menu. A design audit found the
 * empty thread a blank pane with nothing to say what to do in it.
 *
 * It is read-only. The skill row above the composer is the one place a skill
 * runs from; on an empty chat a press starts the seat with that skill as its first
 * turn (Story 8.3), and this names what that row will offer and how a session starts, and
 * carries no button, handler or tab stop of its own.
 * Everything project-supplied is React text.
 */
export function ThreadIntro({ agent, items }: { agent: AgentView; items: readonly MenuEntryView[] }): JSX.Element {
  return (
    <section className="thread-intro" aria-label={`About ${agent.name}`}>
      <Initials {...agent} size={26} />
      <h3 className="thread-intro-name">{agent.name}</h3>
      <p className="thread-intro-title">{agent.title}</p>
      {agent.description !== '' && <p className="thread-intro-about">{agent.description}</p>}
      {items.length > 0 && (
        <>
          <p className="thread-intro-label">{`${agent.name} can`}</p>
          <ul className="thread-intro-skills">
            {items.map((item) => (
              <li key={item.code} className="thread-intro-skill">
                <span className="thread-intro-code">{item.code}</span>
                <span className="thread-intro-skill-text">{item.description}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="thread-intro-hint">{`send ${agent.name} a message to open a session, then run a skill from the row above the composer`}</p>
    </section>
  )
}

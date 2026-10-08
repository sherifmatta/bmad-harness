import { useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'

import { THEME_CHOICES } from '../../../shared/theme'
import type { ThemeChoice } from '../../../shared/theme'
import { rovingKey } from '../a11y/roving-tabindex'

/**
 * The theme line, along the Welcome's bottom edge: `theme · system · light ·
 * dark`. It is the only theme control a window has; once a project is open the
 * theme is reached from *View ▸ Theme* alone.
 *
 * The three words are buttons in one group and one tab stop (the current one,
 * until an arrow has moved it). Arrows move focus between them and choose
 * nothing; `Enter` or `Space` is the browser's own click on a button and
 * chooses, and a choice leaves focus exactly where it was. The current word
 * carries `aria-pressed="true"` and is drawn as text, not as a link; the
 * others are links in the accent.
 *
 * It holds no theme: the choice it is given is main's, pushed to the page, and
 * choosing hands the word back to main, which is the same choice the menu makes.
 * Nothing is announced and nothing moves when it changes.
 */
export function ThemeLine({
  choice,
  onChoose
}: {
  choice: ThemeChoice
  onChoose: (choice: ThemeChoice) => void
}): JSX.Element {
  // The stop an arrow or a click set, and the choice in force when it did: a
  // choice that changes since (in the menu, say) puts the stop back on the
  // current word, so the one tab stop is never left on a word that is not.
  const [moved, setMoved] = useState<{ index: number; choice: ThemeChoice } | null>(null)
  const buttons = useRef<Map<ThemeChoice, HTMLButtonElement>>(new Map())
  // Until an arrow has moved it, the one tab stop is the current choice.
  const held = moved !== null && moved.choice === choice ? moved.index : THEME_CHOICES.indexOf(choice)

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    const intent = rovingKey(event.key, {
      index,
      count: THEME_CHOICES.length,
      orientation: 'horizontal',
      activateOn: ['Enter', ' ']
    })
    if (intent.kind !== 'move') {
      return
    }
    // A move would otherwise scroll the window; Enter and Space never reach here.
    event.preventDefault()
    setMoved({ index: intent.index, choice })
    buttons.current.get(THEME_CHOICES[intent.index])?.focus()
  }

  return (
    <div className="welcome-theme" role="group" aria-labelledby="welcome-theme-label">
      <span className="welcome-theme-label" id="welcome-theme-label">
        theme
      </span>
      {THEME_CHOICES.map((word, index) => (
        <span className="welcome-theme-item" key={word}>
          <span className="welcome-theme-sep" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className="welcome-theme-word"
            aria-pressed={word === choice}
            tabIndex={index === held ? 0 : -1}
            ref={(element) => {
              if (element === null) {
                buttons.current.delete(word)
              } else {
                buttons.current.set(word, element)
              }
            }}
            onClick={() => {
              setMoved({ index, choice })
              onChoose(word)
            }}
            onKeyDown={(event) => onKey(event, index)}
          >
            {word}
          </button>
        </span>
      ))}
    </div>
  )
}

import { useLayoutEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'

import './composer.css'

/**
 * The composer — UX-DR25, EXPERIENCE.md's *Queued composer* and the
 * keyboard table. It is where the user speaks to a persona, and the one
 * control in the product that is never locked.
 *
 * **Nothing here is ever switched off.** The textarea and the send button
 * carry no `disabled`, `readOnly` or `aria-disabled` in any state, because a
 * composer that goes dead while a persona works reads as the product having
 * stopped listening. Whether a message waits its turn is the session's
 * business (Story 2.5), never the composer's.
 *
 * **Keys.** `Enter` sends and `Shift+Enter` is a newline. Any other chord with
 * `Enter` does nothing: it neither sends nor loses the draft. A key that
 * commits an input-method composition is the method's, never a send.
 *
 * **The draft is the user's.** It lives in state and is cleared only after a
 * handler has been given it, so a surface with no session loses nothing the
 * user typed, and a whitespace-only draft is kept, not discarded. The text
 * handed on is trimmed of surrounding whitespace and otherwise untouched.
 *
 * There is no focus rule in the stylesheet: the field and the button are tab
 * stops and take the shared `:focus-visible` ring. After a send the field
 * keeps or regains focus, so a message never costs the user their place.
 */
export function Composer({
  agentName,
  onSend
}: {
  agentName: string
  onSend?: (text: string) => void
}): JSX.Element {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)

  // Autogrow: collapse to content height, then take the content's. The CSS
  // min-height and max-height clamp the result, so no number is spelled here
  // and past the maximum the field scrolls instead of growing.
  useLayoutEffect(() => {
    const element = field.current
    if (element === null) {
      return
    }
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [text])

  function send(): void {
    if (onSend === undefined || text.trim() === '') {
      return
    }
    onSend(text.trim())
    setText('')
    field.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter') {
      return
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return
    }
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return
    }
    event.preventDefault()
    send()
  }

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="composer-field">
          <textarea
            ref={field}
            className="composer-input"
            rows={1}
            value={text}
            placeholder={`message ${agentName}`}
            aria-label={`Message ${agentName}`}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="composer-send" onClick={send}>
            Send
          </button>
        </div>
        <div className="composer-hint">
          <span>enter sends</span>
          <span aria-hidden="true">·</span>
          <span>shift+enter adds a line</span>
        </div>
      </div>
    </div>
  )
}

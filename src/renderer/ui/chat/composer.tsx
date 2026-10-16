import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, ReactNode, RefObject } from 'react'

import { useSlashList } from '../skills/use-slash-list'
import type { SlashEntry } from '../skills/slash-query'
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
 * **A send can be refused (Story 7.5).** A handler that answers with a promise is asked to say whether it took the
 * text: `false` leaves the draft where it was (the New session chat, whose first message may name no skill; a skill-first
 * session that has ended), and until it answers the field is as it was and a second send waits. A handler that answers
 * nothing is as it always was: the draft is cleared once it has been given.
 *
 * **The `/` list.** A composer handed `slashEntries` opens a list above the field when
 * its text begins with `/` (Story 7.3). It is the list's hook that reads the
 * text, takes the keys it answers to and draws the rows; this file only offers
 * it the key first, spreads the attributes it returns on the field, and sends
 * what is typed unchanged. A composer handed none is exactly as it was.
 *
 * There is no focus rule in the stylesheet: the field and the button are tab
 * stops and take the shared `:focus-visible` ring. After a send the field
 * keeps or regains focus, so a message never costs the user their place.
 */
export function Composer({
  agentName,
  onSend,
  initialText = '',
  onTextChange,
  focusOnMount = false,
  refocus = 0,
  head,
  returned,
  fieldRef,
  slashEntries
}: {
  /** Who the message is for: it names the field. Left out, as in the New session chat (Story 7.5), the field has no placeholder and is named `message`. */
  agentName?: string
  onSend?: (text: string) => void | Promise<boolean>
  /** The draft the field starts with: the New session chat keeps its half-typed text across a turn to another chat. */
  initialText?: string
  /** Told every change of the draft, so a surface that keeps it can. */
  onTextChange?: (text: string) => void
  /**
   * Take focus when this composer appears. Only a handoff the user made from the
   * keyboard sets it, so the user lands in the new persona's composer; choosing a
   * persona by tile never does, because that keeps focus on the tile.
   */
  focusOnMount?: boolean
  /**
   * Take focus whenever this number changes to a positive one, mounted or not. A
   * counter and not a flag so the same request can be made again: choosing a
   * decision option removes the button that held focus, and the user's place is
   * this composer.
   */
  refocus?: number
  /** What sits above the field inside the composer: the persona's skill row, when it has one. */
  head?: ReactNode
  /**
   * Words handed back to the user (Story 4.8): the room did not receive them. Each new `key` is taken
   * once, and only when the field is empty at that moment, so a draft is never touched and nothing is
   * sent. The one held when the composer appears is not taken.
   */
  returned?: { key: number; text: string }
  /**
   * Holds the field while this composer is mounted, for whoever has to put focus here: the thread's
   * `↓ latest` (Story 5.3). Nothing is read from it here.
   */
  fieldRef?: RefObject<HTMLTextAreaElement | null>
  /** The rows a leading `/` lists, as main gave them. Absent, the composer has no such list. */
  slashEntries?: readonly SlashEntry[]
}): JSX.Element {
  const [text, setText] = useState(initialText)
  const sending = useRef(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const returnedKey = useRef(returned?.key)
  const slash = useSlashList({ entries: slashEntries, text, setText, field })
  const holdField = useCallback(
    (element: HTMLTextAreaElement | null) => {
      field.current = element
      if (fieldRef !== undefined) {
        fieldRef.current = element
      }
    },
    [fieldRef]
  )

  useEffect(() => {
    onTextChange?.(text)
  }, [text, onTextChange])

  useEffect(() => {
    if (returned === undefined || returned.key === returnedKey.current) {
      return
    }
    returnedKey.current = returned.key
    setText((held) => (held === '' ? returned.text : held))
  }, [returned])

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

  useEffect(() => {
    if (focusOnMount) {
      field.current?.focus()
    }
  }, [focusOnMount])

  useEffect(() => {
    if (refocus > 0) {
      field.current?.focus()
    }
  }, [refocus])

  function send(): void {
    if (onSend === undefined || text.trim() === '' || sending.current) {
      return
    }
    const answer = onSend(text.trim())
    if (answer !== undefined) {
      // The handler says whether it took the text: a refusal leaves the draft as it was.
      sending.current = true
      // A handler that fails did not take the text: the draft stays, and later sends are not held for it.
      void answer
        .then((took) => {
          if (took) {
            setText('')
          }
        })
        .catch(() => {})
        .finally(() => {
          sending.current = false
        })
    } else {
      setText('')
    }
    field.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (slash.onKeyDown(event)) {
      return
    }
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
        {head}
        {slash.list}
        <div className="composer-field">
          <textarea
            ref={holdField}
            className="composer-input"
            rows={1}
            value={text}
            placeholder={agentName === undefined ? undefined : `message ${agentName}`}
            aria-label={agentName === undefined ? 'message' : `Message ${agentName}`}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            {...slash.fieldProps}
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

import { createElement, useId, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, KeyboardEvent, ReactNode, RefObject, SetStateAction } from 'react'

import { rovingKey } from '../a11y/roving-tabindex'
import { SkillList } from './skill-list'
import { slashMatches, slashText } from './slash-query'
import type { SlashEntry } from './slash-query'

/**
 * The `/` list's behaviour for one composer (Story 7.3): when it is open, which
 * row is current, and what the keys do. The composer hands over its text and
 * its field and gets back the attributes the field carries while the list is
 * open, a key handler that says whether it took the key, and the list to draw.
 *
 * Open follows from the text alone (`slash-query.ts`), except that `Esc` closes
 * it until the text changes again. The current row is the first whenever the
 * text changes and moves one at a time, clamped, by the shared roving code.
 * `Enter` or `Tab` put `/<name> ` in the field with the caret after it and send
 * nothing; focus stays in the field. A composer given no rows is never open.
 */
export type SlashList = {
  /**
   * Spread on the textarea: empty while closed, so the closed markup is unchanged. While open it
   * carries the attributes and an `onBlur` that closes the list as `Esc` does.
   */
  fieldProps: Record<string, string | boolean | (() => void)>
  /** Offer a key to the list first. `true` means it was taken and the composer does nothing more. */
  onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean
  /** The list when open, else nothing. */
  list: ReactNode
}

export function useSlashList({
  entries,
  text,
  setText,
  field
}: {
  entries: readonly SlashEntry[] | undefined
  text: string
  setText: Dispatch<SetStateAction<string>>
  field: RefObject<HTMLTextAreaElement | null>
}): SlashList {
  const id = useId()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [picked, setPicked] = useState({ text: '', index: 0 })
  const caret = useRef<number | null>(null)

  // `Esc` holds only until the text changes, and a new text starts at its first row.
  if (dismissed !== null && dismissed !== text) {
    setDismissed(null)
  }
  if (picked.text !== text) {
    setPicked({ text, index: 0 })
  }

  const rows = entries === undefined ? [] : slashMatches(text, entries)
  const open = rows.length > 0 && dismissed !== text
  const current = Math.min(picked.text === text ? picked.index : 0, Math.max(rows.length - 1, 0))
  const rowId = (index: number): string => `${id}-row-${index}`

  // The caret goes after the placed text once the field holds it.
  useLayoutEffect(() => {
    if (caret.current === null || field.current === null) {
      return
    }
    field.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  }, [text, field])

  function choose(row: SlashEntry): void {
    const next = slashText(row.name)
    caret.current = next.length
    setText(next)
    field.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open) {
      return false
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return false
    }
    // A key that commits an input-method composition is the method's.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return false
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setDismissed(text)
      return true
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      choose(rows[current])
      return true
    }
    const intent = rovingKey(event.key, {
      index: current,
      count: rows.length,
      orientation: 'vertical',
      activateOn: ['Enter']
    })
    if (intent.kind === 'move') {
      event.preventDefault()
      setPicked({ text, index: intent.index })
      return true
    }
    if (intent.kind === 'activate') {
      event.preventDefault()
      choose(rows[current])
      return true
    }
    return false
  }

  return {
    fieldProps: open
      ? {
          'aria-controls': id,
          'aria-expanded': true,
          'aria-activedescendant': rowId(current),
          // Focus leaving the field leaves nothing for the list to be named by.
          onBlur: () => setDismissed(text)
        }
      : {},
    onKeyDown,
    list: open ? createElement(SkillList, { id, rowId, entries: rows, current }) : null
  }
}

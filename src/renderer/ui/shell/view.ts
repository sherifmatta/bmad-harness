/**
 * The three top-level views, and the only place that names them (FR11).
 *
 * Exactly three, in switch order: the conversation, Party Mode and the Board
 * (Story 6.3 added the third). A fourth, a Help surface or a launcher is not a
 * later addition to this list: EXPERIENCE.md reserves Help without rendering
 * it, and nothing here may carry a slot for it.
 */
export const VIEWS = [
  { id: 'conversation', label: '1:1 Conversation' },
  { id: 'party', label: 'Party Mode' },
  { id: 'board', label: 'Board' }
] as const

export type ViewId = (typeof VIEWS)[number]['id']

/** What the window opens on. The current view is stored nowhere, so every launch opens here. */
export const DEFAULT_VIEW: ViewId = 'conversation'

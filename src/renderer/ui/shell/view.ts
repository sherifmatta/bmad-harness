/**
 * The two top-level views, and the only place that names them (FR11).
 *
 * Exactly two, in switch order. A third view, a Help surface or a launcher is
 * not a later addition to this list: EXPERIENCE.md reserves Help without
 * rendering it, and nothing here may carry a slot for it.
 */
export const VIEWS = [
  { id: 'conversation', label: '1:1 Conversation' },
  { id: 'party', label: 'Party Mode' }
] as const

export type ViewId = (typeof VIEWS)[number]['id']

/** What the window opens on. */
export const DEFAULT_VIEW: ViewId = 'conversation'

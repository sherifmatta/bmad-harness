/**
 * The install contract — what main resolves from a project's own BMad install
 * and what crosses the bridge to the renderer. Types only: Bridge is the one
 * layer every side may import, and it stays free of behaviour so that no side
 * can end up depending on another through it.
 */

/**
 * Every failure that crosses the bridge (FR91, UX-DR31). `message` is what
 * renders; `detail` renders only behind a disclosure and is built by the
 * harness from a closed vocabulary — never subprocess stderr, a stack trace or
 * a file path.
 */
export type HarnessError = { code: string; message: string; detail?: string }

/** One colleague, exactly as the roster names them, plus the id that keys them. */
export type AgentView = {
  id: string
  module: string
  team?: string
  name: string
  title: string
  icon: string
  description: string
}

/**
 * One menu entry as the renderer sees it. Whether an entry runs a skill or a
 * prompt is decided in main and never leaves it (AD-3, AD-9).
 */
export type MenuEntryView = { code: string; description: string }

/**
 * One skill the install declares, by name and description, in the manifest's
 * own order. The renderer prefix-filters these rows and nothing more: none are
 * hidden, ranked or grouped, and the name is all a chosen row ever puts back.
 */
export type SkillView = { name: string; description: string }

/**
 * One refresh, one snapshot. Every agent id has a `menus` key, possibly empty.
 * `revision` only ever increases, so a late push can be told from a fresh one.
 */
export type InstallSnapshot = {
  revision: number
  agents: AgentView[]
  menus: Record<string, MenuEntryView[]>
  errors: HarnessError[]
  /**
   * The named prerequisites that are not met, in the order claude, uv,
   * no-agents. Empty means every one passed and the room may open. It rides
   * the install snapshot because the verdict is a function of the roster plus
   * two facts about tools, and one frame keeps them from disagreeing.
   */
  preflight: HarnessError[]
  /**
   * Every skill the install's manifest declares (Story 7.3), read in main with
   * the install and watched with it. Empty when the manifest is absent or
   * cannot be read, and never an error.
   */
  skills: SkillView[]
}

/** The reply to `install:get`: a snapshot, or the envelope saying why not. */
export type InstallReply =
  | { ok: true; snapshot: InstallSnapshot }
  | { ok: false; error: HarnessError }

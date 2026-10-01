---
title: 'The turn and the composer'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: 'dd494208c225e6baad75db94bda9c653959119da'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A composer draft survives a change of agentName and would be sent to the next persona if the mount site does not key the Composer.
    evidence: |-
      Draft is component state; nothing is mounted yet. Whether drafts are per persona is a handoff decision for Story 2.9, which must key the Composer by agent id or clear it.
    location: >-
      src/renderer/ui/chat/composer.tsx
    severity: low
  - summary: >-
      Autogrow height is recomputed only when the text changes, so a window resize that re-wraps the text leaves the height stale.
    evidence: |-
      The layout effect depends on `text` alone; a ResizeObserver would settle it once the composer is mounted in the real column (Story 2.4).
    location: >-
      src/renderer/ui/chat/composer.tsx
    severity: low
  - summary: >-
      With no onSend handler Enter is swallowed and the hint still says `enter sends`.
    evidence: |-
      Unreachable today (nothing mounts the composer); Story 2.4 always passes a handler.
    location: >-
      src/renderer/ui/chat/composer.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 2.3 (epics.md "The turn and the composer", UX-DR25, NFR20). The conversation's two most-repeated elements, a turn in the thread and the composer under it, exist nowhere: DESIGN.md names the conversation turn once, in the radius table, and EXPERIENCE.md never lists it as a component. Stories 2.4 to 2.7 would each invent them.

**Approach:** Build the persona turn, the user turn, a time-ordered transcript, and the composer as renderer components with their own stylesheets, tokens for every value, and tests that pin the acceptance criteria. Amend DESIGN.md to carry the conversation turn as a named component. Mounting them in the shell and wiring them to a session is Story 2.4's.

## Boundaries & Constraints

**Always:**
- Persona turn: `card`-radius container, 32px portrait (`portrait(…, 32, …)`), name at `name` (12.5px/600), role at `ident` (11px, sans, `faint`), timestamp in mono at `meta` (10px, `meta` colour) right-aligned, words in sans at `body-ui`. User turn: same container, `accent-wash` ground, `inset 2px 0 0 accent-edge`, the 32px `Initials` avatar.
- The turn renders `text` exactly as given, split only on blank lines into paragraphs with `white-space: pre-wrap`: no prefix, frame, label, summary or classification of the words. Everything project- or persona-supplied is React text.
- Composer: `panel` ground, 1px `line`, `card` radius, border `#3c4a60` on `:focus-within`, placeholder `#5c646f`, textarea autogrows from `--composer-min` to `--composer-max` (CSS clamp plus a height set from `scrollHeight`), send button with its own ground/border/glyph/hover (`#2c3a52`/`#3b4d6b`/`#cfe0f8`/`#334463`, `control` radius), hint line at `label` in `meta`. Every new literal becomes a token in `design/tokens.css`; stylesheets reach values through `var()` only (NFR23).
- The composer is never disabled: no `disabled`, `readOnly` or `aria-disabled` on the textarea or the send button, in any state. `Enter` sends, `Shift+Enter` inserts a newline, `⌘↵`/`Ctrl+↵`/`Alt+↵` do not send and the glyph `↵` appears in no source. IME composition never sends. Whitespace-only text sends nothing and is kept.
- Textarea and send button are tab stops taking the shared `:focus-visible` ring (no local focus rule, no `outline: none`). After a send the textarea keeps or regains focus.
- `.thread` and `.composer-inner` cap at `--thread-max`; the chat header's second line already caps at `--chat-sub-max`.
- Timestamps arrive as epoch ms and are formatted in the renderer only. Harness microcopy is lower case, mono, `·`-separated, no terminal punctuation; the hint states only what is true today.

**Never:**
- No mounting in `shell.tsx` or `app.tsx`, no session, IPC, queued state, `@` handoff, skill row, sysline, decision block, markdown rendering, or persistence (Stories 2.4 to 2.9). No `@` hint: the syntax ships in 2.9.
- No new dependency; no change to `src/shared/`, `src/main/`, `src/preload/`. No hover lift, spinner, entrance animation, or typewriter effect.
- No config-path or cut-string copy (`skills read from…`). No weakening of any negative-surface sweep beyond the two named exemptions below.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter | text `hi`, no modifiers | `onSend('hi')`, field cleared, focus stays | none |
| Shift+Enter | text `hi` | newline inserted, no send | none |
| ⌘/Ctrl/Alt+Enter | any text | no send, draft kept | none |
| IME composing | Enter while `isComposing` | no send | none |
| Blank | `''` or whitespace, Enter or click | no send, draft kept, not disabled | none |
| No handler | `onSend` absent | draft kept, nothing cleared | none |
| Send click | text present | sends, textarea regains focus | none |
| Growth | content taller than 120px | height clamps at `--composer-max`, scrolls | none |
| Out-of-order entries | entries with decreasing `at` | rendered ascending by `at`, ties keep input order | none |
| Hostile text | `<img onerror>` as persona name or words | rendered as text | none |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/chat-header.tsx`, `chat-header.css`, `chat-header.test.tsx` -- sibling style to copy: React text only, `portrait(artParamsFor(agent.id), size, state, agent)`, all values via `var()`, `renderToStaticMarkup` tests.
- `src/renderer/ui/persona/initials.tsx` -- `Initials` at `size={32}` is the user avatar; `src/renderer/ui/persona/portrait.tsx` -- `PortraitSize` already includes 32.
- `src/renderer/design/tokens.css` -- the one file entitled to literals; add composer, send, turn tokens beside the Story 1.10 chat-header block. `tests/tokens.test.ts` reads it at run time; new tokens must not break it (`--portrait*` stays absent).
- `src/renderer/ui/shell/shell.css:177-197` -- `.chat`, `.scroll`, `.thread` (940px already). Not edited except to add nothing; the composer is not mounted yet.
- `src/renderer/ui/a11y/live-region.test.tsx`, `src/renderer/ui/testing/render-hook.ts` -- jsdom pattern (`// @vitest-environment jsdom`, `mount`, `inAct`).
- `tests/negative-surface.test.ts:160` (no `<textarea>`), `:131-148` (`KEY_SURFACES`, no key handling outside team/outputs/a11y), `src/renderer/ui/shell/negative-surface.test.tsx:89` (shell markup has no textarea; stays true because nothing is mounted) -- the two exemptions: the textarea is allowed in `chat/composer.tsx` only, and key handling in `chat/composer.tsx` only.
- `_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html:168-195,244-266` -- source of every turn and composer value (read-only).
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md:276-285` (frontmatter `composer`), `:666-668` (Composer prose), `:513` (radius table) -- where the conversation turn component is added.

## Tasks & Acceptance

**Execution:**
- `src/renderer/design/tokens.css` -- add turn and composer tokens (padding, gap, send padding, focus/placeholder/send colours, hint gap) with provenance comments -- NFR23.
- `src/renderer/ui/chat/turn.tsx`, `turn.css`, `format-turn-time.ts` -- `PersonaTurn`, `UserTurn`, shared header/body, `formatTurnTime(at, timeZone?)` -- AC 1-3.
- `src/renderer/ui/chat/transcript.tsx` -- `orderEntries`, `Transcript` rendering persona and user entries in time order -- AC 1.
- `src/renderer/ui/chat/composer.tsx`, `composer.css` -- `Composer({ agentName, onSend })` -- AC 4-7.
- `src/renderer/ui/chat/turn.test.tsx`, `composer.test.tsx`, `composer.dom.test.tsx`, `format-turn-time.test.ts` -- matrix rows, structure, never-disabled, key handling, focus, autogrow.
- `tests/negative-surface.test.ts` -- exempt `chat/composer.tsx` from the textarea sweep and the key sweep, and assert the textarea lives in exactly that file -- keeps the sweeps honest.
- `tests/conversation-contract.test.ts` -- CSS-level assertions: radius, ground, inset rule, 940px caps, no focus override, no `⌘`/`↵` in sources.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md` -- add `conversation-turn` to the frontmatter components and a *Conversation turn* section.

**Acceptance Criteria:**
- Given a persona turn, when rendered, then it is a `card`-radius container with a 32px labelled portrait, the name, role and a timestamp, and the words in sans at `body-ui`; and entries are in time order.
- Given a user turn, when rendered, then it has the `accent-wash` ground, an `inset 2px 0 0 accent-edge` rule and the 32px initials avatar.
- Given either turn, when its markup is read, then the text is exactly what was passed, with nothing prepended, wrapped or classified.
- Given the composer, when rendered, then its structure and token-bound styling match the spec, no element is disabled, and Enter, Shift+Enter, modifier-Enter and blank sends behave per the matrix.
- Given keyboard reach, when tabbing, then the textarea and the send button are each a tab stop with no local focus override.
- Given DESIGN.md, when read, then the conversation turn is a named component with its values.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 39 findings (blind 14, edge 22, verification-gap 2, intent-alignment 1 descriptive) — high 0, medium 0, low 8, false 1, maybe-false 0, rejected low or not-real 30
- findings:
  - `[low]` `patch` rendered time only matched by regex, `Head` could ignore `at` (verification-gap) — test added comparing to `formatTurnTime(at)` for two values, both turn kinds
  - `[low]` `patch` `Transcript` forwarding of `user`/`agent` unobserved (verification-gap) — test added with a user identity and persona name
  - `[low]` `patch` whitespace-only text renders an empty `<p>` (blind, edge) — filter on `trim()`, test extended
  - `[low]` `patch` textarea content-box makes `height = scrollHeight` 4px too tall (blind) — `box-sizing: border-box` added and asserted
  - `[low]` `defer` draft survives agentName change (edge) — see frontmatter
  - `[low]` `defer` autogrow stale after resize without text change (blind, edge) — see frontmatter
  - `[low]` `defer` hint says `enter sends` with no handler, Enter swallowed (blind, edge) — see frontmatter
  - `[low]` `reject` duplicate screen-reader announcement of portrait label plus name (blind) — the chat header ships the same pattern; Story 1.6 fixed the label
  - `[low]` `reject` no live region on the transcript (blind) — one polite region per window is Story 2.6's
  - `[low]` `reject` timestamp has no `<time>` element or date (blind) — the mockup and spec show `HH:MM`; a date is a persistence-story decision
  - `[low]` `reject` `formatTurnTime` allocates a formatter per call and throws on an invalid `timeZone` (blind) — the zone argument is for tests only; cost is negligible per turn
  - `[low]` `reject` `onSend(text.trim())` strips leading indentation (blind, edge) — the spec states the text is trimmed
  - `[low]` `reject` send failure or async rejection loses the draft (blind, edge) — `onSend` has no result contract; none exists to honour
  - `[low]` `reject` Send on a blank draft does not return focus (blind) — nothing was sent and focus is where the user left it
  - `[low]` `reject` placeholder and `meta` contrast unchecked (blind) — values are DESIGN.md's; the text-ramp sweep classifies them
  - `[low]` `reject` DESIGN.md omits wrapper padding and `chrome` ground; references `{spacing.*}` (blind) — `{spacing.thread-max}` and `composer-min` exist in the frontmatter (lines 168 to 177); padding is not on a scale by design
  - `[low]` `reject` key-sweep exemption covers the whole composer file (blind) — one small file reviewed here; narrowing would be a regex per key
  - `[low]` `reject` `key={index}` paragraphs, duplicate entry ids, unknown `kind`, NaN `at`, quadratic insertion (blind, edge) — `kind` is a closed union, ids and times come from main, streaming is Story 2.4's
  - `[low]` `reject` CSS rules for stack gap, avatar top and head alignment untested (blind) — values are tokens, a repeat of the CSS source in a test adds nothing
  - `[low]` `reject` turn.css comment says the initials disc takes the shared ring (blind) — Story 1.6 made the disc focusable on purpose
  - `[low]` `reject` each user turn adds an initials tab stop (verification-gap other) — Story 1.6's decision, not this change
  - `[low]` `reject` empty name, title or agentName, long name overflow, CR-only line endings (edge) — roster values are validated upstream; flex items wrap rather than overflow
  - `[low]` `reject` `onSend` throws, held Enter repeat, no `maxLength` (edge) — no demonstrated path; the draft is kept on a throw
  - `[false]` `reject` `useLayoutEffect` on the server warns (edge) — React 19 does not warn, and the suite runs clean
  - `[low]` `reject` Send button is capitalised, not lower case (edge claim) — a control label from the mockup, not harness microcopy
  - `[low]` `reject` claim that text is not exactly as given (edge claim) — the spec defines paragraph splitting on blank lines as the only change
  - `[note]` `reject` intent-alignment layer reports reading A (components, not mounted) against reading B (visible in the app) — descriptive; the spec's `Never` clause and the epic make mounting Story 2.4's, and a composer mounted without a session would be inert

## Design Notes

The composer holds its draft in state and calls `onSend(text.trim())` only when a handler exists, so a surface without a session loses nothing the user typed. Autogrow resets `height` to `auto` then sets it to `scrollHeight`; CSS `min-height`/`max-height` do the clamping so the only numbers live in tokens.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary:** Built the conversation turn (persona and user), a time-ordered `Transcript`, and the `Composer` as renderer components with tokenised styles, and amended DESIGN.md to name the conversation turn as a component. Nothing is mounted in the shell yet: Story 2.4 does that with a session.

**Files changed:**
- `src/renderer/ui/chat/turn.tsx`, `turn.css`, `format-turn-time.ts` -- `PersonaTurn`, `UserTurn`, `HH:MM` formatter.
- `src/renderer/ui/chat/transcript.tsx` -- stable time ordering and the thread.
- `src/renderer/ui/chat/composer.tsx`, `composer.css` -- never-disabled composer, Enter/Shift+Enter, autogrow, hint.
- `src/renderer/design/tokens.css` -- turn, composer and send tokens.
- `src/renderer/ui/chat/*.test.tsx`, `format-turn-time.test.ts`, `tests/conversation-contract.test.ts` -- matrix, structure and CSS contract.
- `tests/negative-surface.test.ts` -- textarea and key-handling exemptions for `chat/composer.tsx` only; textarea asserted to live there alone.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md` -- `conversation-turn` component and section.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2.3 done.

**Review:** 39 findings across four layers. Patches applied: 4 (all low). Deferred: 3 (see frontmatter). Rejected: 32, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high, no medium patched).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (1580 unit, 55 watcher) and `npm run build` exit 0. Not run in the Electron app: Enter, focus and autogrow are covered by jsdom only.

**Residual risks:** the composer and turns are not yet on screen; real-browser autogrow and the focus ring are unverified; the hint copy and the `message <Name>` placeholder are unspecified by the UX docs.

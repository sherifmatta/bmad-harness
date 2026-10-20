---
title: 'Story 9.1: Open the skill row only when you want it'
type: 'feature'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_revision: 'ec409e3b952f7a8c9fb2c617939cad4218d99934'
baseline_commit: 'ec409e3b952f7a8c9fb2c617939cad4218d99934'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-9-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The skill row above every persona's composer always draws its buttons. Once someone knows what a persona can do, it is a strip of chips they no longer need (UX-DR57).

**Approach:** The row's `<Name> can` label becomes a native disclosure button, collapsed by default to `▸ <Name> can · <N> skills`. Whether it is open is one app-wide boolean, `skillRowOpen`, kept in `layout.json` beside the widths, read through `layout:get` and written through one new request channel, `layout:set-skill-row`.

## Boundaries & Constraints

**Always:** Collapsed when nothing is stored, the file is unreadable, or the file predates this story. The empty chat is collapsed too. `<N>` counts every menu entry, and a single entry reads `1 skill`. While collapsed, no skill button and no `+N more` exist in the DOM. Open reads `▾ <Name> can` with the buttons and `+N more`/`fewer` exactly as today. The in-row `+N more` expansion starts closed every time the row opens. The chevron is `aria-hidden`, and the accessible name is `<Name> can, <N> skills`. The toggle is never disabled; only the skill buttons are, while a turn is in flight. Toggling writes no transcript entry, sends no `session`/`conversation` command, announces nothing and leaves focus on the toggle. Choice and state live in the app, so every persona's chat shares them. Main ignores any non-boolean, writes atomically and reports a failed write as `layout/unwritten · <errno>`, and the choice still applies in the window. Width and folded writes keep `skillRowOpen`, and the new write keeps widths and folded. `LAYOUT_VERSION` stays 1. The `Layout` field is additive and optional. The new channel constant is tied to its preload literal the way the other layout channels are. CSS uses existing tokens through `var()` only (DESIGN.md *Skill row toggle*): label type in `meta`, hover to `text`, padding `--space-xs --space-sm`, the shared focus ring, no ground or border, no motion.

**Never:** Opening or closing by itself (on a persona switch, first message, turn start or end, roster change, error or mount). A per-persona choice. A pushed event. A hint, badge or highlight on the toggle. Any change to what a skill button sends, to the `/` list, or to where a row is drawn (New session chat, room, skill-first session, empty menu, stored thread with no session). Any change to the conversation contract (`CONTRACT_VERSION`, 17 events, 8 commands). A new colour, size, radius or token. Deleting a test to make the change pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First look | no `skillRowOpen` stored, Mary has 7 entries | `▸ MARY CAN · 7 skills`, `aria-expanded="false"`, no `.skill-button`/`.skill-more` | n/a |
| One entry | 1 entry | `· 1 skill` | n/a |
| Open | toggle clicked / `Enter` / `Space` | `▾`, `aria-expanded="true"`, 5 buttons + `+2 more`; `setSkillRowOpen(true)` once; focus on toggle | n/a |
| Re-open after `+N more` | open, `+2 more`, close, open | 5 buttons + `+2 more` again | n/a |
| In flight | live session, turn running | buttons disabled, toggle enabled and toggles | n/a |
| Shared | opened in Mary's chat, switch to John | John's row open | n/a |
| Stored | `layout.json` `{…, skillRowOpen: true}` | `layout:get` → `skillRowOpen: true` | missing/non-boolean/unreadable → `false` |
| Bad write | `layout:set-skill-row` with `'yes'`, `1`, `undefined` | `{ ok: true, ignored: true }`, file untouched | n/a |
| Write fails | rename throws `EACCES` | diagnostic `layout/unwritten · EACCES`; window keeps the choice | reported, never thrown |
| Keep across writes | `skillRowOpen: true`, then `set-width`/`set-folded` | file still has `skillRowOpen: true` | n/a |

**Decisions (owner, 2026-10-20):**
- All four of the story's defaults are accepted. The choice lives in `layout.json` beside the widths. The in-row `+N more` expansion is not kept. The count covers every entry. The thread's follow state is left as it is (the existing scroller `ResizeObserver` covers it).
- The full spec is kept despite being about 3,000 tokens, because one goal spans main, bridge, renderer and the open-row tests.

</frozen-after-approval>

## Code Map

- `src/renderer/ui/chat/skill-row.tsx` -- the row. Add `open: boolean` and `onOpenChange(open)` props. The label `<span>` becomes `<button type="button" className="skill-row-toggle" aria-expanded={open} aria-label=…>` with `<span aria-hidden>▸/▾</span>` and the label and count spans. Render buttons and `+N more` only when `open`. Reset `expanded` to `false` whenever the row closes. `items.length === 0` → `null` stays. Rewrite the doc comment for the new behaviour.
- `src/renderer/ui/chat/skill-row.css` -- `.skill-row-label` becomes the toggle's text style, plus a `.skill-row-toggle` rule (reset button: `background: none; border: 0; padding: var(--space-xs) var(--space-sm); color: var(--meta); font: inherit-from-label; cursor: pointer`) with `:hover` → `--text`, the chevron gap `--space-sm`, and the collapsed row keeping `margin-bottom: var(--space-md)`. Take the focus ring from the shared rule; check `tokens.css`/`focus` for how other native buttons get it.
- `src/renderer/ui/app.tsx:102,528-547` -- pass `open={layout.skillRowOpen}` and `onOpenChange={layout.saveSkillRowOpen}` to `<SkillRow>`. Nothing else in the head condition changes.
- `src/renderer/ui/layout/layout-context.ts` -- add `skillRowOpen: boolean` and `saveSkillRowOpen(open)` to `LayoutContextValue`. `INERT_LAYOUT` gets `false` and a no-op.
- `src/renderer/ui/layout/use-layout.ts` -- in `readInitial`, `skillRowOpen: record['skillRowOpen'] === true`. Add `useState` for it, and `saveSkillRowOpen` sets the state, then calls bridge `setSkillRowOpen` if present. Add it to the `LayoutBridge` slice and the memo.
- `src/shared/layout.ts` -- `Layout` gets `skillRowOpen?: boolean`. `NO_LAYOUT` gets `skillRowOpen: false`.
- `src/shared/channels.ts:86-93` -- `LAYOUT_SET_SKILL_ROW_CHANNEL = 'layout:set-skill-row'`, with the comment changed from "three" to "four".
- `src/main/fold/layout.ts` -- `StoredLayout` gets `skillRowOpen: boolean`. Add `skillRowOpenOf(raw)`, which is `recordOf(raw)?.skillRowOpen === true`. `withWidth`/`withFolded` carry it, and a new `withSkillRowOpen(raw, open)` keeps widths and folded.
- `src/main/sources/persistence/layout-file.ts` -- `LayoutToWrite` and the JSON written gain `skillRowOpen`. The doc comment names the field.
- `src/main/layout-bridge.ts` -- `layout:get` answers `skillRowOpen: skillRowOpenOf(raw)`, and the catch default gets `false`. Add `ipcMain.handle(LAYOUT_SET_SKILL_ROW_CHANNEL, (_e, open) => typeof open !== 'boolean' ? ignored : store(withSkillRowOpen(...)))`, which needs no project. Export the constant.
- `src/preload/index.ts:158-170`, `src/preload/harness-api.d.ts:50-65` -- `setSkillRowOpen(open: boolean): void` → `void ipcRenderer.invoke(LAYOUT_SET_SKILL_ROW_CHANNEL, open)`, with a doc comment.
- Tests to amend on purpose (none deleted):
  - Bridge and channel pins: `tests/bridge-contract.test.ts:144-158,264-289,568-593` (the 4th channel, the `setSkillRowOpen` key and an invoke case), `tests/preflight-contract.test.ts:149-176` (24 to 25 `HarnessApi` methods, including the test name) and `tests/negative-surface.test.ts:978-986` (24 to 25).
  - Exact layout shapes, which gain `skillRowOpen`: `src/main/layout-bridge.test.ts` (`read()` results, stored-file shapes, the handler list at 262-264), `layout-file.test.ts:18-31`, `fold/layout.test.ts:63-106`, plus new hook cases in `use-layout.dom.test.tsx`.
  - Tests that assume an open row: `skill-row.test.tsx` and `skill-row.dom.test.tsx` mount with `open: true` where the open row is the subject, and add collapsed cases. `run-card.dom.test.tsx:360-376` passes `open`. In `app.test.tsx`, the tests at 1605-1785 (3.1, 3.2) and 3932/4015 (8.2) store `skillRowOpen: true` in the stubbed `getLayout` or click the toggle; 3435/3671 (no row) are unchanged. `tests/epic-7-audit.dom.test.tsx:564-572` opens the row first.
  - `tests/negative-surface.test.ts:1719-1800,3138-3143,777,1273` pins source text. It now allows 3 `<button` and `aria-expanded={open}` on the toggle, keeps the `+N more` pin, and keeps "no `window.harness` / effect / announce / send in the row", since state comes in by props. The CSS audit names `.skill-row-toggle`.
  - `tests/tokens.test.ts:1533-1540` keeps or extends the `.skill-row-label` and `.skill-more` rules.
  - `tests/conversation-contract.test.ts:241-250` requires one `disabled={` in the row; the toggle has none.
  - `tests/epic-8-audit.dom.test.tsx:210-223` checks that a mount calls no write. The row never writes on mount.
  - The shared fake `src/renderer/ui/testing/fake-bridge.ts` has no `getLayout`, which is fine (collapsed).
- `_bmad/planning-artifacts/epics.md` (Stories 8.2, 8.3, 8.7) -- add a dated note that the row is drawn collapsed. `EXPERIENCE.md`/`DESIGN.md` are only checked against the build. Another session has uncommitted edits in `epics.md` and `ARCHITECTURE-SPINE.md` (AD-31, for 9.3): edit only the three story sections, and stage hunks so those edits are not committed.

## Tasks & Acceptance

**Execution:**
- [x] `src/main/fold/layout.ts`, `src/main/fold/layout.test.ts` -- red tests for `skillRowOpenOf` (missing, non-boolean, `true`) and for each `with*` keeping the other fields, then implement -- AC storage
- [x] `src/main/sources/persistence/layout-file.ts` (+ test) -- write the field -- survives restart
- [x] `src/shared/channels.ts`, `src/main/layout-bridge.ts` (+ `layout-bridge.test.ts`) -- the get field and the validated set channel, including the ignored inputs, the failed-write diagnostic and the keep-across-writes cases -- matrix rows Stored to Keep
- [x] `src/preload/index.ts`, `src/preload/harness-api.d.ts`, `tests/bridge-contract.test.ts` -- the bridge method, with the channel tied to its literal -- contract AC
- [x] `src/shared/layout.ts`, `src/renderer/ui/layout/layout-context.ts`, `use-layout.ts` -- the app-wide state and save
- [x] `src/renderer/ui/chat/skill-row.tsx`, `skill-row.css` (+ `skill-row.dom.test.tsx`, `skill-row.test.tsx`) -- the toggle. Tests cover the count wording, `aria-expanded`, the absence of buttons while collapsed, focus staying put, the toggle enabled while disabled, and the expansion reset -- matrix rows First look to In flight
- [x] `src/renderer/ui/app.tsx` (+ `app.test.tsx`) -- wire it up. Tests cover the default being collapsed, one choice shared by two personas' chats, no `session`/`conversation` call on toggle, and the row not reacting to a first message or turn end. Amend the open-row tests by storing `skillRowOpen: true` in the fake `getLayout`.
- [x] `tests/negative-surface.test.ts`, `tests/epic-7-audit.dom.test.tsx` and the other surveyed tests -- amend the pins (`aria-expanded`, the token audit carrying `.skill-row-toggle`)
- [x] `_bmad/planning-artifacts/epics.md` -- dated notes on 8.2, 8.3 and 8.7

**Acceptance Criteria:**
- Given the full suite, when run, then every test passes and the only removed assertions are ones replaced by their collapsed-default equivalents.
- Given a running app, when the toggle is opened and the app restarts, then the row is open in every persona's chat.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter, edge-case-hunter, verification-gap; verification-gap filed no gaps).

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | blind | The `Enter`/`Space` test asserts `onkeydown === null`, which holds under React's delegation whatever the code does | low | React attaches its listeners at the root, so the property is always null. The fix is a one-line source pin | patch |
| 2 | blind | The toggle uses `align-items: center`; DESIGN asks for "one baseline" | low | `components.skill-row-toggle.form` says "on one baseline" | patch |
| 3 | blind, edge | `.skill-row-label`'s trail margin sits inside the toggle and widens the label-to-count gap and the open toggle's trailing space | low | The flex `gap` plus the 2px trail apply inside the button, so the 2px belongs to the toggle | patch |
| 4 | blind | Toggle padding means the open row isn't "exactly as today" | false | DESIGN `skill-row-toggle.padding` prescribes `{spacing.xs} {spacing.sm}`, so the padding is by design | reject |
| 5 | blind | No token pin for `.skill-row-toggle` | false | `tests/negative-surface.test.ts:777` audits `ui/chat/skill-row.css: .skill-row-toggle` by name, which is what the AC requires | reject |
| 6 | blind | The preload layout comment still says "Main validates both" | low | `src/preload/index.ts` comment above `getLayout` | patch |
| 7 | blind, edge | A second open window shows a stale choice until it reloads | false | The frozen intent says "no event is pushed: another open window reads the choice when it next asks". Its next toggle stores that user's own new choice | reject |
| 8 | blind | Roster change, error and mount aren't tested as non-triggers | low | `skillRowOpen` state is written only by `saveSkillRowOpen`, which only the toggle's click calls (`use-layout.ts`, `skill-row.tsx`), so none of those paths can reach it. Covering them adds tests for code paths that don't exist | reject |
| 9 | blind | Thread follow state on toggle is untested | low | Owner decision (d) relies on the existing scroller `ResizeObserver` in `use-follow.ts:120-130`, which has its own tests; this story changes no code there | reject |
| 10 | blind, edge | The failed-write test uses `ENOTDIR` from `mkdir`, not a rename `EACCES` | false | `writeLayoutFile` wraps mkdir, write and rename in one catch, so the bridge path and diagnostic are identical. The window keeping the choice is proven by the hook setting state before the fire-and-forget send | reject |
| 11 | blind | The `.skill-row-count` exemption in the epic-8 audit is a loophole | false | The audit bans unread or attention counts. This is the static menu size DESIGN calls "count", so renaming it to dodge the audit would be the worse dodge | reject |
| 12 | blind | The `(?!-row')` regex exempts any `skill-row'` literal | low | `tests/negative-surface.test.ts:~984`; exempting the exact literal is a direct correction | patch |
| 13 | blind | `live()` may read the wrong `.visually-hidden` | false | Only `a11y/live-region.tsx` renders `.visually-hidden` in `src/renderer` | reject |
| 14 | blind | `initial.skillRowOpen === true` is redundant | false | `Layout.skillRowOpen` is optional by AC, so the narrowing to `boolean` is required | reject |
| 15 | blind | sprint-status still `in-progress` while the spec is `in-review` | false | The workflow syncs sprint status at presentation | reject |
| 16 | blind | `epics.md` notes are missing from the diff | false | Left out of the review diff on purpose, because another session's AD-31 edits share the file. The notes were verified at lines ~4182, 4228 and 4367 | reject |

Pass 2 (bmad-review after commit, 2026-10-20: adversarial, edge-case-hunter, verification-gap; verification-gap filed no gaps). The user asked for every finding to be applied; findings that would change the frozen intent are held for the owner.

| # | Finding | Verdict | Route |
|---|---------|---------|-------|
| 1 | A read failure other than a missing file made any layout write replace the file with empty widths and folds | real | patch: `readLayoutToChange` tells ENOENT/ENOTDIR from other errnos; the bridge skips the write and reports `layout/unread · <errno>` |
| 2 | A non-boolean skill row value was ignored silently | real | patch: `layout/ignored · skill-row · <type>` |
| 3 | The toggle had no `aria-controls` | real | patch: an always-drawn `.skill-row-entries` region (`display: contents`) named by `useId` |
| 4 | The expansion reset relied on a closed render (`setState` during render) | real | patch: the open entries are their own component, drawn only while open |
| 5 | Button UA styles (weight, line-height, alignment, appearance) leaked into the toggle; `.skill-row-label` restated the toggle's type | real | patch |
| 6 | The toggle's padding moved the label off the composer edge | real | patch: a negative start margin of `--space-sm` keeps the padding as the click target |
| 7 | The doc comment said the word "skill" never appears in the row | real | patch: the comment now says the count's word is the spec's |
| 8 | No test of a failed rename or of temp-file cleanup; no app-level test of roster change, error or composer remount; no key test | real | patch: tests added. jsdom does not activate a button on a key, so the app test pins that nothing cancels `Enter`/`Space` |
| 9 | Windows already open do not see a new choice | held | contradicts the frozen Never "A pushed event" (and pass-1 #7); for the owner |
| 10 | "N skills" also counts prompt entries | held | the frozen Always fixes the wording; for the owner |
| 11 | A first-run empty chat hides the skills Story 8.3 relies on | held | contradicts the frozen Always "The empty chat is collapsed too"; for the owner |

## Verification

**Commands:**
- `npx vitest run --project unit <path>` while iterating, then `npm test` -- expected: all green
- `npm run typecheck` and `npm run lint` -- expected: no errors, no warnings

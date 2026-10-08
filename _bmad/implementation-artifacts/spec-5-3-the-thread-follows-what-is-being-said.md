---
title: 'Story 5.3: The thread follows what is being said'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'cb9312913870d5c49df58320ed5d6e96e52d6e84'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad/planning-artifacts/epics.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The persona thread (`.scroll`) and the room's (`.party-scroll`) are `overflow-y: auto` with nothing that moves them: every new line lengthens the content and leaves the viewport where it was, so the newest line falls below the edge and the user scrolls by hand all through a run. The renderer's only scroll call is the card reveal in `chat/use-reveal.ts`.

**Approach:** One shared scroller component, `FollowScroller`, wraps each thread. It follows the bottom while the thread is within one line (24px) of it, pauses when the user scrolls farther up (or a reveal takes them to a card), and draws one `↓ latest` button, only while paused, that returns to the bottom and puts focus in the composer. The state is a fact about the scroller's metrics and the last user scroll: pure functions plus one hook, with nothing stored and no setting. The authoritative acceptance text is Story 5.3 in `_bmad/planning-artifacts/epics.md` (`### Story 5.3`); `DESIGN.md` → Follow control and `EXPERIENCE.md` → Following the thread give the appearance and the rules.

## Boundaries & Constraints

**Always:** Growth while following moves the scroll position in the same frame and instantly (a `ResizeObserver` on the content and on the scroller, plus a layout effect on every render); growth while paused changes no scroll position; `↓ latest` is one literal string, one tab stop between the thread and the composer, drawn only while paused. A send (a rise in the user-turn count the thread holds), a persona change, a view switch becoming visible and a room opening each put the thread at its bottom and following. A scroll event whose `scrollTop` is the value the harness itself just set is not a user scroll. The reveal pauses following (a context the scroller provides and `useReveal` calls), and only the user resumes it. All colours, dimensions and fonts reach the control through tokens (`var()`); the only new tokens are two dimensions in the promoted `:root` block.

**Never:** No `behavior: 'smooth'`, no animation, no easing, no transition; no count, dot, badge, toast, sound, pulse, shadow or *new* text on or around the control, no divider in the thread, no setting, no stored or remembered position; no new command, event, channel or preload method; no live region, no role, no tab stop other than the control; no change to the document card's own tailing, to the pinned card, or to any copy; no page scroll at ≤1000px; the following of the stopped room's read-only thread (no composer) is not added.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Growth at bottom | within 24px of bottom, content or scroller grows | `scrollTop` set to the bottom in the same frame | — |
| Growth while paused | farther than 24px up, anything grows | `scrollTop` untouched; `↓ latest` stays | — |
| User scrolls up | scroll event, distance > 24px, not our own value | paused; control drawn | — |
| User returns | scroll event, distance ≤ 24px | following; control gone | — |
| Press `↓ latest` | paused | bottom, following, control gone, composer focused | no composer mounted: nothing to focus |
| Send / persona change / view shown / room opens | any | bottom, following | — |
| Reveal | `useReveal` fires inside the scroller | paused after the scroll; our own scroll event is ignored; only the user resumes | no provider (pinned slot): no-op |
| Window resize | following / paused | stays at bottom / does not move | — |
| No `ResizeObserver` or no layout | jsdom | per-render layout effect still follows | — |

</intent-contract>

## Code Map

- `src/renderer/ui/shell/shell.tsx:190` -- `.scroll > .thread` becomes `FollowScroller` (`className="scroll"`, content `thread`, `resetKey` the current persona id, `sends` a new optional prop, `fieldRef` a Shell-owned ref); `composer` gets the ref as a third argument. `shell.css` `.scroll`/`.thread` stay as they are.
- `src/renderer/ui/party/party-view.tsx:149-156` -- the live room's `.party-scroll > .party-column` becomes `FollowScroller`; `sends` from the room's user entries; `Composer` gets `fieldRef`. The stopped-room chooser column (`:135`) is untouched.
- `src/renderer/ui/chat/composer.tsx` -- add optional `fieldRef` prop (callback ref merged with the internal `field`). `chat/use-reveal.ts` -- call `useFollowPause()` after `scrollIntoView`. `app.tsx` -- count non-room user entries into `sends`, pass `fieldRef` to the composer.
- `src/renderer/ui/follow/` (new) -- `follow-state.ts` (pure: `FOLLOW_TOLERANCE = 24`, `atBottom`, `bottomTop`), `follow-context.ts` (`FollowContext`, `useFollowPause`), `use-follow.ts` (the hook), `follow-scroller.tsx` (frame, scroller, content, control), `follow.css` (frame, control).
- `src/renderer/design/tokens.css` -- two tokens at the end of the promoted block (`--follow-offset:12px`, `--follow-padding:3px 11px`, from DESIGN.md's follow-control); `tests/tokens.test.ts` -- the promoted-block digest and its comment updated.
- Pins that name the reveal as the only scroll code and must be widened to include `follow/use-follow.ts`: `tests/negative-surface.test.ts:618-637`, `:1580-1590`, `:2178-2190`. `tests/accessibility.test.ts:673`, `shell.test.tsx` `class="scroll"` lookups keep working: the scroller keeps `class="scroll"` exactly.
- Read-only: `ui/testing/render-hook.ts` (`mount`), `chat/run-card.tsx` (`useReveal` caller), `shell.css` ≤1000px rules (the thread has no scroller of its own there, so nothing scrolls and the control never shows).

## Tasks & Acceptance

**Execution:**
- `follow/follow-state.ts` (+test) -- pure metrics functions -- the state as a fact about the scroller
- `follow/use-follow.ts`, `follow-context.ts`, `follow-scroller.tsx`, `follow.css` (+jsdom tests with a fake scroller and a fake `ResizeObserver`) -- hook, provider, control -- growth, pause, resume, send, reset, reveal pause, button and focus
- `shell.tsx`, `party-view.tsx`, `composer.tsx`, `use-reveal.ts`, `app.tsx` (+tests) -- wire both threads; sends, focus ref, reveal pause
- `tokens.css`, `tests/tokens.test.ts` -- two dimension tokens and the digest
- `tests/negative-surface.test.ts`, shell and party audit tests -- widen the scroll-code pins to the follow hook, add: no `smooth`, control text exactly `↓ latest`, paused thread mounted in each view with no count, dot, badge, live region or extra tab stop

**Acceptance Criteria:**
- Given a thread within 24px of its bottom, when content grows or the window resizes, then its bottom stays in view in the same frame, instantly, in a persona's thread and in the room.
- Given a user scroll farther than 24px up, then following is paused, nothing moves the thread on growth, a card arriving or leaving or a run ending, and `↓ latest` is drawn with no count or sign; given a return to within 24px, then following resumes and the control goes.
- Given `↓ latest` activated by pointer or keyboard, then the thread is at its bottom and following, the control is gone, and focus is in the composer; the control is one tab stop between the thread and the composer, present only while paused.
- Given a send in a persona's thread or the room, a window open, a persona selected, a switch between 1:1 and Party, or the room opened, then the thread is at its bottom and following with no remembered position.
- Given a run's reveal (Story 3.10), then the thread scrolls to the card, is paused with `↓ latest` shown, and only the user resumes it; given the pinned card returning to the thread, then a following thread keeps its bottom and a paused one does not move.
- Given the renderer, then no `behavior: 'smooth'`, animation or transition exists, the control's only text is `↓ latest`, no live region or role is added, and `typecheck`, `lint`, `test` and `build` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 26 findings — high 0, medium 0, low 13, false 13, maybe-false 0 (blind 12, edge-case 14, verification-gap 0; the intent-alignment audit is descriptive and filed no findings)
- findings:
  - `[low]` `reject` blind: `pause()` runs when the reveal's ref is null — a reveal is only requested for a card the thread holds and mounted, so the ref is set; no real path.
  - `[false]` `reject` blind: a reveal can leave the user at the bottom, paused — Story 5.3 says the reveal "is paused, with `↓ latest` shown. Nothing resumes it but the user", and a test pins it.
  - `[false]` `reject` blind: showing a view discards the reading position — the story requires a thread shown after a 1:1/Party switch to be at its bottom with no remembered position.
  - `[low]` `reject` blind: focus falls to the body when the control goes while it holds focus — the control must go in the same frame the thread resumes; moving focus elsewhere for a rare tab-then-scroll path adds behaviour the story does not ask for.
  - `[low]` `reject` blind: the send count is defined two ways and not per persona — each counts the user turns its own thread draws (the persona thread draws every persona's non-room turns); a rise that is not a send needs a hydration after mount, which lands at the bottom anyway.
  - `[low]` `reject` blind: the fake scroller gives both threads shared metrics — a test-double weakness only; each view's tests mount one scroller at a time.
  - `[low]` `reject` blind: a layout read and a `scrollTop` write on every render, and the observer pins again — the spec asks for a layout effect on every render; a write of an unchanged value is a no-op and the prose store already paints at most once a frame.
  - `[false]` `reject` blind: the 24px tolerance can fight a small upward nudge — 24px (one line) is the story's stated tolerance.
  - `[low]` `reject` blind: the control's target size and focus ring are checked only structurally — its padding is DESIGN.md's `3px 11px`, and the shared `:focus-visible` ring in `design/focus.css` covers every button.
  - `[false]` `reject` blind: the stopped room's thread is not followed — the spec's Never list excludes it (no composer to focus, no control position).
  - `[low]` `reject` blind: no app-level test pushes streamed text while following — the hook tests grow a fake scroller under a following state and the app tests cover pause, reveal, send and persona change; the verification-gap layer found no gap.
  - `[low]` `reject` blind: brittle digest, banned-word regexes and a duplicated `scrollIntoView` stub — developer-only; a failure names its cause.
  - `[low]` `reject` edge: a reveal in the same commit as a persona change or send is undone by the parent's layout effect — the two arrive as separate events, so the same commit is not a path the app has.
  - `[false]` `reject` edge: a reveal that moved nothing leaves the thread paused at the bottom — the story pauses on every reveal.
  - `[false]` `reject` edge: `placed` stays set after a pin or pause — a scroll event only fires when `scrollTop` changes, so the first event after a stale value is a different position and clears it; matching it again needs a move away first.
  - `[false]` `reject` edge: a scroller reaching zero height while paused jumps to the bottom on return — zero height is a hidden view, and the story puts a shown view at its bottom.
  - `[false]` `reject` edge: without `ResizeObserver` the shown path never runs — every Chromium renderer has it; the per-render effect covers jsdom.
  - `[low]` `reject` edge: a rise in the user-turn count that is not a send snaps a paused thread — as above, no such path exists after mount.
  - `[false]` `reject` edge: the count includes other personas' turns — the one thread draws them all.
  - `[false]` `reject` edge: a fall then a rise in the count is misread — a rise from the previous render's count is the definition of a new turn.
  - `[low]` `reject` edge: `↓ latest` with no mounted composer drops focus to the body — the thread is drawn only with a current persona, whose composer is mounted; a test covers the no-composer case.
  - `[low]` `reject` edge: `fieldRef` identity changing leaves a stale textarea — the Shell holds one ref for its life and the room holds its own.
  - `[false]` `reject` edge: the one Shell ref is shared with the Party view — the room has its own ref.
  - `[false]` `reject` edge: setting `scrollTop` at ≤1000px does nothing — that is the specified result (the page scrolls; nothing is specified).
  - `[low]` `reject` edge (claim): a reveal pause is cleared by `latest()` on a persona switch, a send or a shown view — each is a user act the story says resumes following.
  - `[false]` `reject` edge (claim): `placed` is never expired and can swallow a user scroll — see the earlier `placed` row: the user's scroll changes `scrollTop` first and clears it.
  - Intent-alignment audit (descriptive): reads the intent as build, commit and close in tracking; `sprint-status.yaml` and the commit are the surfaces still to do at finalize, handled below. It notes the follow behaviour is exercised against a fake scroller, not real layout; the manual `npm run dev` check was not run.

## Design Notes

The race the "own value" rule closes: following, a burst grows the content, the observer pins; a second burst lands before the browser delivers the pin's scroll event, so measured at delivery the thread is far from the bottom and would read as paused. The harness records the `scrollTop` it set, and an event carrying exactly that value is its own. The same record serves the reveal: `scrollIntoView`'s event carries the position `pause()` reads right after it, so it does not resume anything. A hidden view (`display: none`) reports a zero-height scroller; when the observer next sees it laid out, it is shown, and the thread goes to its bottom.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no warnings
- `npm test` -- expected: all pass
- `npm run build` -- expected: three preload bundles and three page entries emitted

**Manual checks (if no CLI):**
- `npm run dev`: run a skill, scroll up while it writes (the view holds, `↓ latest` appears), press it (bottom, focus in the composer); the room behaves the same.

## Auto Run Result

Status: done

**Summary.** Both threads now follow what is being said. A new `FollowScroller` wraps the persona thread and the live room's thread: within 24px of the bottom it keeps the bottom in view in the same frame (a `ResizeObserver` on the scroller and its content, plus a layout effect on every render), and when the user scrolls farther up it pauses, so nothing moves the thread and `↓ latest` appears. The control is one literal string and one tab stop between the thread and the composer. Pressing it goes to the bottom, resumes following and puts focus in the composer. A send, a persona change, a view shown and the room opening put the thread at its bottom; the card reveal pauses following and only the user resumes it.

**Files changed.**
- `src/renderer/ui/follow/` (new) -- `follow-state.ts` (24px tolerance, bottom arithmetic), `use-follow.ts` (the hook; records the `scrollTop` it set so its own scroll event is not read as the user), `follow-context.ts` (the reveal's pause), `follow-scroller.tsx` (frame, scroller, content, control), `follow.css`.
- `src/renderer/ui/shell/shell.tsx`, `party/party-view.tsx`, `chat/composer.tsx`, `chat/use-reveal.ts`, `app.tsx` -- wiring: the scroller in both threads, `fieldRef` on the composer, `sends`, the reveal's pause.
- `src/renderer/design/tokens.css` -- `--follow-offset` and `--follow-padding` in the promoted block.
- Tests: new `follow-state.test.ts`, `follow-scroller.dom.test.tsx`, `testing/fake-scroll.ts`; additions to `app.test.tsx`, `use-reveal.test.ts`, `composer.dom.test.tsx`, `testing/audit-patterns.ts`; `tests/negative-surface.test.ts` (scroll-code pins widened, a static audit) and `tests/tokens.test.ts` (promoted-block digest).
- `_bmad/implementation-artifacts/sprint-status.yaml` -- story 5.3 marked done; `epic-5-context.md` recompiled (it was stale against the planning files).

**Review.** 26 findings: low 13, false 13, high 0, medium 0. Patches applied: 0. Deferred: 0. Rejected: 26, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no patches).

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` (189 files, 4465 tests, plus 55 watcher tests) and `npm run build` pass.

**Residual risks.** The follow logic is tested against a fake scroller and a fake `ResizeObserver`, since jsdom has no layout; `npm run dev` (scroll up while a skill writes, press `↓ latest`) was not run. If content grows outside React before the observer fires, a user scroll in the same frame could briefly read as paused. `.bmadshow/paths.json` was modified and then deleted in the working tree by something outside this run; it was left alone and is not in the commit.

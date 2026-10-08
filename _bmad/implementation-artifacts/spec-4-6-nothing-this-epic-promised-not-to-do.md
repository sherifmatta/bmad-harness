---
title: 'Nothing this epic promised not to do'
type: 'chore'
created: '2026-10-08'
baseline_revision: '3d72bbbbefcf0ce7228d43194dca888219c5850f'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 4 built the surface where a builder is most tempted to add what the mockup showed and the product has no data for (*Open disagreements*, *Decisions so far*, `disagrees`/`evidence`/`unresolved` tags, quote-back, a speaker queue, *Pause room*, a 288px panel) and the reassurance every chat box adds (spinner, badge, sound, "start another room"). Stories 4.1 to 4.5 pinned their own bans, but no test mounts the party view in every state and reads what it draws. Story 4.6 (UX-DR21, UX-DR36, UX-DR38) is the audit.

**Approach:** Add one rendered audit that mounts the real `PartyView` (and so the real header, strip, thread, panel, composer and chooser) in every room state and asserts each prohibition on what is drawn, and one static block in `tests/negative-surface.test.ts` for what a mount cannot see (stylesheets, tokens, words, main's room lines). Product code changes only if an assertion finds a real defect; a failing assertion is fixed in the product, never loosened.

## Boundaries & Constraints

**Always:** States mounted: chooser alone; a live room just opened (no topic, no turn); a live room mid-turn with a speaker and the latest turn live; a live room idle after turns, a user turn, an `@name` user turn and the summary ask; the room with context rows on the rail; a persona in the cast the roster no longer names; a stopped room (thread above chooser); a stopped room opened again. Every mount goes through the real `PartyView`; the clock is held by the test. The static half reads sources through the existing `code` map and helpers in `tests/negative-surface.test.ts`.

**Never:** No loosened or deleted existing guard. No new command, event, channel or bridge method (still 7, 15, 22, 17). No product behaviour added to satisfy a test beyond the minimal fix of a real defect. No new string, control or state in party code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Side panel | live room, every state | one `aside.party-side`, one heading `Room`, exactly four rows (topic, opened, context, writes to); no `Open disagreements` or `Decisions so far` text, heading, empty state or reserved element, in markup or stylesheets | No error expected |
| Transcript | persona, user and sysline entries | a persona turn is portrait, name, role, time, words and nothing else: no tag, chip, `blockquote`, quote-back or reply control; no `disagrees`, `evidence`, `unresolved` word drawn by any party or turn code | No error expected |
| Room controls | each live state | the only buttons: `Write summary to _bmad/`, `stop room`, and the composer's own send; no `Pause room`, no gate (composer never `disabled`, even mid-turn), no queue or speaker list | No error expected |
| Panel width | tokens and stylesheets | `--party-side` is `240px`; `288` appears in no source; the panel hides only at the shell's one `max-width: 1180px` rule | No error expected |
| Harness words | every state | the room's harness words are the opened and stopped syslines and fixed header and panel facts; none is attributed to a persona, none classifies or ranks; no spinner, skeleton, progress, badge, count of unread, `aria-live`, audio or guidance (`start another`, `try`, `next`, `you can`) | No error expected |
| Dimming | speaker present, absent, changing, room stopped and reopened | every cast member keeps a card in cast order; only the speaker's carries `--speaking`; `.cast-card` is `opacity: var(--opacity-idle)` (token between 0 and the hover and speaking values) with no `display`, `visibility` or `hidden` rule | No error expected |

</intent-contract>

## Code Map

- `src/renderer/ui/party/party-view.tsx`, `party-header.tsx`, `party-turn.tsx`, `cast-strip.tsx`, `room-panel.tsx`, `cast-chooser.tsx` -- everything the room draws; read-only unless an assertion finds a defect. `PartyView` is mounted as in `party-view.dom.test.tsx` (`mount`/`update`, props `agents room roomCast speaker entries topic openedAt turns rows onOpen onSend onWriteSummary onStop`).
- `src/renderer/ui/party/cast-strip.css:19-45` -- idle `opacity: var(--opacity-idle)`, `:hover` `--opacity-hover`, `--speaking` `--opacity-speaking`; `src/renderer/design/tokens.css:189,283-286` -- `--party-side:240px`, `.42/.72/1`; `src/renderer/ui/shell/shell.css` -- the one `max-width: 1180px` rule hiding `.party-side`.
- `src/main/session-voice.ts` -- `LINES.roomOpened`, `LINES.roomStopped` (the room's only harness lines); `src/main/session-bridge.ts:179-215,442-460` -- the two `registry.say` calls for a room; `src/shared/room-summary.ts` -- the summary ask (a prompt to the runtime, shown as the user's own entry; not a persona's words).
- `src/renderer/ui/chat/conversation-state.ts:322-415,560-720` and `src/main/fold/transcript.ts:57` -- the only places a `kind: 'persona'` entry is made, from the session's own text.
- `src/renderer/ui/chat/epic-3-audit.dom.test.tsx` -- the mount-and-assert pattern to copy; `src/renderer/ui/party/party-view.dom.test.tsx` -- `PartyView` mount helpers; `tests/negative-surface.test.ts:2169-2317` -- the 3.11 block, helpers `code`, `offenders`, `sources`, `ruleBody`, `WORDS`, `RENDERER_CODE`, `RENDERER_ALL`; `tests/party-contract.test.ts` -- existing party pins and the four counts (do not duplicate; leave as they are).
- Read-only evidence: `epics.md` Story 4.6; `epic-4-context.md` banned list and layout; a read of every party source found no defect (no `disagree`, `evidence`, `unresolved`, `Pause` or `288` in code outside tokens' own `--disagree` colour and comments).

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/party/epic-4-audit.dom.test.tsx` -- mount every state above through `PartyView`; assert the panel, transcript, controls, dimming and no-chrome rows of the matrix on the markup (no `progress`, `meter`, `[role]`, `[aria-live]`, `[aria-busy]`, `[hidden]`, `blockquote`, `audio`, badge/count class, stand-in word), then advance the clock ten minutes on a live room and re-read -- the audit reads what is drawn
- `tests/negative-surface.test.ts` -- add a Story 4.6 block: the panel's sources name no deferred section and reserve no slot; the party and turn sources draw no tag or quote; `--party-side` `240px`, no `288`, one 1180px rule; cast card opacity from the idle token, token ordering, no hiding rule on the card or strip; no `Pause`, queue, gate or `disabled` on the composer in party code; party-view words carry no guidance or loading word; main's room `say` calls are the two `LINES` and no persona entry is made outside the session's text; no `AudioContext`, `Audio`, badge or toast in party code -- the static half
- `_bmad/implementation-artifacts/sprint-status.yaml`, `epic-4-context.md` -- mark 4.6 done at the end

**Acceptance Criteria:**
- Given the side panel in any state, then neither *Open disagreements* nor *Decisions so far* renders in any form, empty or reserved.
- Given the transcript, then no `disagrees`, `evidence`, `unresolved` or quoted-turn reference renders.
- Given the room, then no turn gate, speaker queue, *Pause room* or 288px panel exists.
- Given any persona in the room, then no words are authored, summarised, classified or attributed by the harness, and no disagreement is staged, ranked or amplified.
- Given any state in this epic, then no spinner, skeleton, badge, unread count, sound or next-step guidance appears.
- Given a persona not speaking, then their face is dimmed and never removed.
- Given the full suite, lint, typecheck and build, then all pass, and the four counts stay 7, 15, 22, 17.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 13 findings grouped from the layers (blind 12, edge 11, verification-gap 1, intent-alignment descriptive; the rejected rows below group several) — high 0, medium 0, low 13, false 0, maybe-false 0; no bad_spec, no intent_gap; 6 patched (all tests), the rest rejected
- findings:
  - `[low]` `patch` the reopened room is mounted only in the dimming test, so the other sweeps never see it (edge, claim) — added to the audit's states
  - `[low]` `patch` the presence check passes if any one of header, strip, panel is drawn (blind) — each asserted for live and stopped
  - `[low]` `patch` a stopped room with `speaker` still set is not exercised (edge) — asserts no lit card, equaliser, strip or live turn
  - `[low]` `patch` `ruleBody(...) ?? ''` makes the panel no-display check vacuous if renamed (edge) — rule asserted present
  - `[low]` `patch` the sanity list omits some files the block reads (edge) — extended
  - `[low]` `patch` `\bcontent\s*:` matches `justify-content` (blind) — lookbehind added
  - `[low]` `reject` stylesheet rules are read as text, not as computed style in a real browser (verification-gap, intent-alignment) — no browser harness exists in the repo and building one is not an audit's job; the text checks catch the direct regressions; recorded as a residual risk
  - `[low]` `reject` no Electron run, no interaction through real handlers (intent-alignment, blind) — handlers are pinned by `party-header.dom.test.tsx`, `party-view.dom.test.tsx` and `app.test.tsx`; the audit is of what is drawn
  - `[low]` `reject` harness-word sweep includes user topic text (blind) — fixtures use plain topics; the sweep is of what the harness draws and a topic is the user's, drawn as data
  - `[low]` `reject` persona-words fixtures are benign, timezone, long-elapsed, destination edge cases (blind) — each is pinned by an earlier story's test (`room-destination`, `format-elapsed`, `turn`); not an Epic 4 promise
  - `[low]` `reject` live regions and roles are banned wholesale, with no rationale recorded (blind) — the epic's one polite live region is the window's and UX-DR35 says the room announces nothing; the rationale is in `epic-4-context.md`
  - `[low]` `reject` brittle exact-string pins, scattered banned-word lists, regex gaps for other hiding techniques, `@container`, keyframe name, `-288`, one-match-per-file `offenders`, fake-timer scope (blind, edge) — the same conventions run through the 3.11 block; each hypothetical needs a new rule the epic did not add, and a wider regex is complexity for no reachable defect
  - `[low]` `reject` `epic-4-context.md` unchanged, spec untracked in the diff, retro unscheduled (blind, edge) — the context file carries no per-story status; the spec is committed at finalization; the retrospective is `optional` and not this story's

## Design Notes

A mount cannot see a stylesheet, so dimming is pinned twice: the markup keeps every card and marks only the speaker's, and the CSS is read for the idle opacity and the absence of any hiding rule. The summary ask asks the runtime for what was decided and what is open, in prose the user sees as their own entry; it is a prompt and no persona's words, and the room's *Decisions so far* panel is a different thing (a surface, not an ask), so this audit leaves it. The existing party pins stay; this block adds what they do not already say.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Open a room in the Electron app against a real `claude` and look at the panel, transcript and strip. Not verified in an unattended run.

## Auto Run Result

**Summary:** Epic 4's negative surface is now audited. One rendered audit mounts the real `PartyView` in every room state and asserts each prohibition on what is drawn; one static block pins what a mount cannot see. No product code changed: no assertion found a defect.

**Files changed:**
- `src/renderer/ui/party/epic-4-audit.dom.test.tsx` -- new; the rendered audit (panel, transcript, controls, harness words, no chrome, dimming, clock advanced ten minutes).
- `tests/negative-surface.test.ts` -- Story 4.6 block (panel sources, tag and quote ban, 240px and no 288, one 1180px rule, dimming CSS, no pause/gate/queue, room harness lines, persona entry origins, silence, counts).
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 4.6 done.

**Review:** four layers. Patches applied: 6 (all low, all tests: reopened room in every sweep, presence of all three live parts, stopped room with a stale speaker, non-vacuous panel rule, wider sanity list, `content` regex). Deferred: 0. Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false -- only tests were patched, none high or medium.

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (168 unit files, 3989 tests; 3 watcher files, 55 tests) and `npm run build` exit 0. The implementer also made two guards fail on purpose (`--party-side` 288px; card `display: none`) and restored them.

**Residual risks:** no Electron launch and no real `claude`; the panel's hide at 1180px, its 240px width and the card dimming are checked from stylesheet text, since jsdom applies no CSS and the repo has no browser harness. The summary ask, which the user sees as their own entry, names decisions and open items; it is a prompt to the runtime and no persona's words.

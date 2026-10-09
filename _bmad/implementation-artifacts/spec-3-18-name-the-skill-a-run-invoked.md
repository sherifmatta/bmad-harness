---
title: 'Name the skill a run invoked'
type: 'feature'
created: '2026-10-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
baseline_revision: '086dcdeed5b3b6c020c85125525b36ad9e4a532e'
warnings: ['oversized']
deferred:
  - summary: >-
      A document run in dead air has an empty head path, so the skill name is not drawn for a templated skill until its first write.
    evidence: |-
      `writesDocument` is true for any run with a plan, so the head shows `path`, which is '' before the first write (since Story 3.17). EXPERIENCE.md's quiet-state row reads "path (or skill name) + elapsed only", which would fill it. The 3.18 intent contract keeps a document card's head unchanged, so this was not changed here.
    location: >-
      src/renderer/ui/chat/run-card.tsx (head path slot)
    severity: low
---

<intent-contract>

## Intent

**Problem:** A run card's head can only say `run`; main knows which skill a dispatched menu entry invoked but never tells the window, so `bmad-build run` would be a guess (FR126, FR27 amended, AD-24).

**Approach:** `run:started` gains an optional `skill`, set by main only for a `skill` entry whose name is a plain bounded name. The card (main's snapshot, the window's entry, the stored file) keeps it, a carry-on run inherits it through `StoppedRun`, and the run-list head draws `<skill> run`. Spec of record: epics.md Story 3.18; AD-24; `DESIGN.md` → Run card → Head.

## Boundaries & Constraints

**Always:**
- The name is a record, never an input: main reads it from `ResolvedMenuEntry.action.skill` at dispatch; no command takes it, nothing re-resolves it, nothing dispatches by it. `menu.dispatch` still takes a session and a code and nothing else; `MenuEntryView` is unchanged.
- Plain bounded name: one shared predicate in `src/shared` (`/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/`). A name failing it is left off (no `skill` key), at dispatch, on the carry-on, and on a stored card read back. A `prompt` entry carries none.
- Additive: `CONTRACT_VERSION` and `TRANSCRIPT_VERSION` unchanged; a stored card without `skill` loads and draws as before; the key is absent, never `undefined`-valued, when there is none.
- `RunCardSnapshot.skill?`, `RunCardEntry.skill?`: set from `run:started` by both folds (`tests/run-card-parity.test.ts` stays green with `skill` compared), hydrated by `runEntryOf`, persisted in the stored card as is. Only `run:started` carries it; no other event.
- Carry-on: `ActiveRun` holds `skill` for the run's life; a user-stopped run puts it in `StoppedRun` with `code` and plan (same lifetime: cleared wherever `afterStop` is); the continuation's `startRun` passes it on.
- Head: a card that writes no document draws `<skill> run`: the name in `mono` `ident` `text-strong` weight 600, then `run` in `dim`, one space apart in the path slot; with no skill the head is `run` alone, exactly as 3.17 draws it. A document card's head (its path) is unchanged. The collapsed `RunCardLine` field set is unchanged.
- Tokens only in CSS; no literal colour, size or weight that the design system has a token for.

**Never:**
- No tooltip, `title`, `data-*`, `aria-*` description or preview from the name; no skill list, launcher, palette or menu built from it; no skill name in the handoff sysline, the sysline, the rail, a notification or any event but `run:started`; no `skill` input to any command; the buttons draw nothing from it.
- No change to `menu.dispatch`, `MenuEntryView`, `ResolvedMenuEntry`, the rail, or the composer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Skill entry | entry `{skill:'bmad-build'}` dispatched | `run:started.skill === 'bmad-build'`; head `bmad-build run` (no document) | N/A |
| Prompt entry | entry resolves to a prompt | no `skill` key; head `run` | N/A |
| Unplain name | skill `'a b'`, `''`, 65 chars, `'-x'` | no `skill` key; run starts and turn is written as before | left off silently |
| Carry-on | stop a skill run, a turn nobody sent begins | continuation `run:started` carries the stopped run's `skill`; a stop of a prompt run carries none | N/A |
| Carry-on spent | user sends or dispatches after a stop | `afterStop` cleared with its `skill`; a later nobody-sent turn starts no run | N/A |
| Reload mid-run | `conversation:get` | card from main's snapshot holds `skill`; head reads the same | N/A |
| Relaunch | stored card with `skill`; install changed or entry vanished | head reads the same; nothing re-resolves | stored `skill` failing the predicate or not a string is dropped, card kept |
| Old stored card | no `skill` field | loads; head `run` | N/A |
| Document run | plan or path present | head shows the path as today, `skill` held but not drawn in the head | N/A |
| Handoff | tile click or `@name` | sysline stays `handed to <Name>` | N/A |

</intent-contract>

## Code Map

- `src/shared/events.ts:95` `RunStarted` -- add `skill?: string`, with the AD-24 comment. `src/shared/conversation.ts:154` `RunCardSnapshot` -- add `skill?: string`. New `src/shared/run-skill.ts` -- `isPlainSkillName` and `skillOf(name)` (returns the name or `undefined`), shared by main, the stored read and tests.
- `src/main/sources/install/schema.ts:14` `ResolvedMenuEntry` -- read-only; the skill name is `action.skill` when `kind === 'skill'`. `src/main/session-bridge.ts:421-453` `dispatchMenu` -- derive `skill` from `resolved.action`, pass to `ctx.registry.startRun(..., plan, skill)`. Do not touch `menuEntryFor`, `turnOf`.
- `src/main/session-registry.ts:196, :584` (`startRun` signature and wiring), `:289-292` (carry-on `startRun` call with `held.skill`), `:78` `afterStop`. `src/main/session-run.ts:60-87` `ActiveRun`/`StoppedRun` add `skill`, `:196-220` `startRun` sets `entry.run.skill` and puts `skill` in the `run:started` payload when defined, `:232` `endRun` copies it into `afterStop` on a stop.
- `src/main/fold/run-card.ts:31` `startCard` -- copy `skill`. `src/renderer/ui/chat/conversation-state.ts:919-937` (`run:started` makes the entry) and `:595-612` `runEntryOf` -- carry `skill`. `src/renderer/ui/chat/transcript-entry.ts:68` `RunCardEntry` -- add `skill?`.
- `src/main/sources/persistence/transcript-file.ts:122-167` -- `isStoredRun` stays; add `skill` sanitising beside `withSteps` (drop a bad `skill`, keep the card), applied where `withSteps` is (`:220`).
- `src/renderer/ui/chat/run-card.tsx:125-135` -- the head's path slot: `writes ? path : <RunHeadName skill={entry.skill} />`; `run-card.css` `.run-card-path` (`:37`) is the base style; add the name/`run` spans beside it.
- Tests to extend: `src/main/session-run.test.ts`, `session-stop.test.ts`, `session-bridge.test.ts` (dispatch, carry-on), `fold/run-card.test.ts`, `conversation-state.test.ts`, `sources/persistence` transcript-file test, `run-card.dom.test.tsx`, `tests/run-card-parity.test.ts` (its `Card` omits only `code`; compare `skill`), `tests/continuation-replay.test.tsx`, `tests/relaunch-dead-card.test.ts`, `tests/run-list-replay.test.tsx`.
- `tests/negative-surface.test.ts:1200-1211, :1321` -- sweeps `chat/` and the turn/transcript/sysline files for `\bskills?\b`; the field now appears in run-card files. Narrow the exemption to the run card's own files and the one recorded-field spelling, and add checks that the name feeds no `title`, `data-*`, `aria-*`, list or dispatch (`runSkill`/`dispatchMenu` never receive it). Never loosen the sweeps for any other file. `epic-3-audit.dom.test.tsx` -- a card with a skill draws no tooltip/list from it.
- `src/renderer/ui/chat/transcript-entry`/`handoff` sysline code -- read-only; no skill half is built.
- `_bmad/implementation-artifacts/{sprint-status.yaml,epic-3-context.md}` -- 3.18 `done`; a line on the head form.

## Tasks & Acceptance

**Execution:**
- `src/shared/{run-skill.ts,events.ts,conversation.ts}` (+ test) -- predicate, `RunStarted.skill`, `RunCardSnapshot.skill` -- the contract
- `src/main/{session-bridge,session-registry,session-run}.ts` (+ tests) -- set at dispatch, hold on `ActiveRun`, carry through `StoppedRun`, cleared with it
- `src/main/fold/run-card.ts`, `src/renderer/ui/chat/{conversation-state,transcript-entry}.ts` (+ tests, parity) -- both folds and the hydrated entry carry `skill`
- `src/main/sources/persistence/transcript-file.ts` (+ test) -- stored `skill` validated on read
- `src/renderer/ui/chat/run-card.tsx`, `run-card.css` (+ dom test) -- the head `<skill> run` / `run`
- `tests/negative-surface.test.ts`, `src/renderer/ui/chat/epic-3-audit.dom.test.tsx` -- the audit still finds no list, launcher, palette, tooltip or dispatch from the field
- A replayed run through the real bridge: dispatch with a skill entry, stop, carry-on, then reload and relaunch, head reads the same throughout (`tests/continuation-replay.test.tsx` precedent)
- `_bmad/implementation-artifacts/{sprint-status.yaml,epic-3-context.md}` -- 3.18 `done`
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given a menu entry that resolves to a skill with a plain name, when dispatched, then `run:started` carries `skill`; for a prompt entry or an unplain name it carries none and the run is otherwise unchanged.
- Given the run's card, when the window reloads or the app relaunches (install changed or entry gone), then the card holds the same `skill` and the head reads the same.
- Given a card that writes no document, then the head reads `<skill> run` (name `ident`, `text-strong`, 600; `run` `dim`), or `run` alone with no skill; a document card's head and the collapsed line are unchanged.
- Given a run started as the carry-on of a stopped run, then it carries the stopped run's `skill` with `code` and plan, and `StoppedRun` holds it only as long as it holds them.
- Given FR27, then the skill buttons show no tooltip or preview from a skill name, the renderer sends only a `code`, nothing re-resolves or dispatches by `skill`, and a handoff sysline stays `handed to <Name>`.
- Given the negative-surface audit, then it finds no skills list, launcher, palette or tooltip built from the field; lint, typecheck, tests and build pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 31 findings — high 0, medium 0, low 22, false 8, maybe-false 0 (1 patched, 1 deferred, 29 rejected)
- findings:
  - `[low]` `[patch]` Blind, Edge-of-verification: `expect(next.snapshot().runs).toEqual(next.snapshot().runs)` compares a call with itself — line removed from `tests/relaunch-dead-card.test.ts`; the assertions around it carry the check; the file passes and lints.
  - `[low]` `[defer]` Edge, Intent: a templated skill's head stays blank until its first write, so the name never shows for document runs — pre-existing since 3.17 (empty path), and the intent contract fixes a document card's head; recorded in `deferred`.
  - `[false]` `[reject]` Blind: spec `in-review` while tracking says `done` — status is set at finalize, after triage.
  - `[false]` `[reject]` Blind: residual risk not recorded — it is recorded under `## Auto Run Result`.
  - `[low]` `[reject]` Blind: "invoked" means "dispatched" — AD-24 and the story define the field as the name main invoked.
  - `[low]` `[reject]` Blind: an unplain name is dropped silently but the turn is still written — the spec says so (the run starts and the turn is written as before); `turnOf` is unchanged.
  - `[low]` `[reject]` Blind: `skillOf` applied at the bridge and again in `startRun`, rest-args wrapper — defence in depth; the wrapper is needed for the 150-line cap in `channels-contract.test.ts`.
  - `[low]` `[reject]` Blind: brittle source-text sweeps in `negative-surface.test.ts` — the repo's audits are source-text by design; the exemption is narrow.
  - `[low]` `[reject]` Blind: no layout test for a 64-char name — the path slot already truncates with an ellipsis and `min-width: 0`.
  - `[false]` `[reject]` Blind: mono/ident not set on the name — the spans sit inside `.run-card-path`, which sets both.
  - `[low]` `[reject]` Blind: handoff sysline and revising/quiet/dead audit states have no new test — that code is untouched and the sweeps already cover it.
  - `[false]` `[reject]` Blind: trailing-newline case — a JS `$` without the `m` flag matches only at the very end.
  - `[low]` `[reject]` Blind: Code Map line numbers will go stale — a map, not a contract.
  - `[low]` `[reject]` Blind: `epic-3-context.md` mixes a rule with build detail — matches the file's existing style.
  - `[false]` `[reject]` Blind: possible unmount leak in `continuation-replay.test.tsx` — `draw` unmounts the previous mount first.
  - `[false]` `[reject]` Edge: overlapping `startRun` overwrites a run — a dispatch is refused while a turn is in flight, and this is unchanged.
  - `[false]` `[reject]` Edge: no predicate in the window's `run:started` fold — the event comes from main, which gates it; stored cards are gated on read.
  - `[low]` `[reject]` Edge: a hand-edited file can show any plain-looking name — it is the user's own file and the name is a bounded plain string.
  - `[low]` `[reject]` Edge (claim): `session-bridge.test.ts` named in the Code Map but not changed — dispatch is covered through the real bridge in `session-run.test.ts` and `tests/continuation-replay.test.tsx`.
  - `[low]` `[reject]` Verification gap: none found beyond the self-compare line (patched above).
  - `[low]` `[reject]` Intent: the name is drawn only in a no-document head, not for document runs or the collapsed line — as the intent contract and the story ask; same root as the deferred item.
  - `[low]` `[reject]` Intent: audit sweep rewrites and a `not.toMatch(/\brun$/)` change in `run-list-replay` — needed because the head now reads `<skill> run`.
  - `[low]` `[reject]` Intent: tracking files say `done` while the diff has no commit yet — the commit is the finalize step.
  - `[low]` `[reject]` Intent: no run against a real `claude` — an unattended run cannot; recorded as a residual risk.

## Design Notes

- **Where the name lives in the renderer:** the window's entry holds `skill` only to draw the head; it is never passed to `runSkill`/`dispatchMenu`, which take a code. The audit's `\bskills?\b` sweep of `chat/` is narrowed to the one recorded-field spelling in the run card's own files rather than dropped.
- **Why a shared predicate:** main applies it at dispatch (a hostile or odd `customize.toml` value never reaches the window), and again on a stored card read back (a hand-edited file cannot put free text in the head).
- **Boundary kept:** `StoppedRun.skill` is set and cleared exactly where `code` is, so it cannot outlive the stop it belongs to.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- With a real `claude`, dispatch a skill with no plan and read the head; an unattended run cannot check this, so record it as a residual risk.

## Auto Run Result

**Summary.** `run:started` carries an optional `skill`, the name main invoked for a menu entry that resolved to a skill, left off for a prompt entry and for any name that is not a plain bounded one. Main's card, the window's entry and the stored card hold it, a stopped run's carry-on inherits it through `StoppedRun`, and a card that writes no document draws its head as `<skill> run` (the name in `ident` `text-strong` 600, `run` in `dim`), or `run` alone. The renderer still sends only a `code`; nothing dispatches or resolves by the name.

**Files changed.** `src/shared/{run-skill.ts,events.ts,conversation.ts}` (predicate, `RunStarted.skill`, `RunCardSnapshot.skill`); `src/main/{session-bridge,session-registry,session-run}.ts`, `src/main/fold/run-card.ts`, `src/main/sources/persistence/transcript-file.ts` (set at dispatch, carry-on, fold, stored read); `src/renderer/ui/chat/{conversation-state.ts,transcript-entry.ts,run-card.tsx,run-card.css}` (entry field and head); tests beside each, `tests/{continuation-replay,relaunch-dead-card,run-card-parity,negative-surface,run-list-replay}`, and the audit; `sprint-status.yaml` and `epic-3-context.md` (3.18 done).

**Review.** 31 findings: patches applied 1; deferred 1; rejected 29 with reasons in the log. By verdict: high 0, medium 0, low 22, false 8, maybe-false 0.

**Follow-up review recommended: false.** The one patch was a low test-only line.

**Verification.** `npm run lint` clean; `npm run typecheck` no errors; `npm test` unit 213 files, 5,234 tests passed, watchers 3 files, 64 tests passed; `npm run build` ok. After the patch the touched test file passes and lints. Matrix audit: every I/O row has a test that ran and passed (`session-run.test.ts`, `session-stop.test.ts`, `fold/run-card.test.ts`, `transcript-file.test.ts`, `run-card.dom.test.tsx`, `tests/continuation-replay.test.tsx`, `tests/relaunch-dead-card.test.ts`, `tests/run-card-parity.test.ts`).

**Residual risks.**
- Not seen in a real window or with a real `claude`; the head is checked in jsdom and through the real bridge over a fake session.
- A skill with a template plan is a document run, so its head shows the path (empty until the first write) and the name is held but not drawn; deferred above.
- `startRun` in `createSessionRegistry` passes its trailing arguments through as a rest list to stay inside the 150-line cap.

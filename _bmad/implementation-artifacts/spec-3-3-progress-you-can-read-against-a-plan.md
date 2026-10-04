---
title: 'Progress you can read against a plan'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: '7a014a6a41f25d62862953be4189b1f1dd66b7cb'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/sprint-change-proposal-2026-10-03-beat-judgement.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The card head carries no stop control, although this story's head AC lists it.
    evidence: |-
      `run.stop`, the in-band interrupt, its fallback and the control itself are Story 3.7, whose ACs already name the card head and the collapsed line; a control rendered here would do nothing, and no `run.stop` handler exists in main.
    location: >-
      src/renderer/ui/chat/run-card.tsx (head)
    severity: low
---

<intent-contract>

## Intent

**Problem:** The run card says only `writing`: someone watching a multi-minute run cannot tell which section is being written or what is still to come (FR32, FR34, FR36, FR37, FR44, UX-DR19). Main emits no section signal, and no plan exists anywhere.

**Approach:** Main reads the dispatched skill's own template once, at dispatch, and tells the window the predicted section names on `run:started`; a memlog concern-scan note that names Adapt-In sections adds them as `run:note.pulled`. The card reads the section being written from the streamed text, names the sections not yet committed in its foot, and drops every section a `doc:committed` names in one render. No denominator, no bar.

## Boundaries & Constraints

**Always:**
- Plan names are section names with leading numbering stripped (`1. Vision` is `Vision`); matching is case-insensitive. A plan section is *written* once a confirmed (`ok`) commit of the subject names it. The foot is every plan name not yet written, in plan order, then headings seen in the subject's text and absent from the plan (the plan grows). The foot is made from entry state, so one `doc:committed` removes every name it lists in one render: no stagger, transition or tick-through.
- Template parser: if any fenced code block holds a level-2 heading, the document sections are the level-2 headings inside fenced blocks and every one outside is scaffolding; else every level-2 heading. Emphasis is stripped; a heading that is a `{placeholder}` is no section. Applied to `.claude/skills/bmad-prd/assets/prd-template.md` it yields exactly the ten `0.`-`9.` sections (`Document Purpose` ... `Assumptions Index`), never `PRD Template`, `Essential Spine`, `Adapt-In Menu` or `PRD: {Product Name}`. The template is the single `*template*.md` file under `.claude/skills/<skill>/assets/`; none or several means no plan (the head then runs on observed headings alone).
- Adapt-In names are the bold names of the bullets under the template's `Adapt-In Menu` heading. A memlog entry that matches `concern scan` (any case, space or hyphen) pulls every menu name it contains (case-insensitive substring), in menu order, not already in the plan.
- Head: `writing · §N <Name>`. N is the 1-based position of the name in the subject's `seen` list, which only appends (a name enters it when first seen in the subject's text, in text order), so a seen section is never renumbered. Before any heading the head reads `writing`. After an applied `Edit` and until the next `Write` piece the head reads `revising · §N <Name>`, N and Name those of the section holding the first changed character; no seen section there reads `revising`. An `Edit` never makes the head name a later section than the edit.
- Prose stays out of React state: progress is read from the prose store, which recomputes at most once a frame and only when its text changed; the head re-renders only when its words change.
- Every dimension in CSS comes from `src/renderer/design/tokens.css`.

**Never:**
- No `of M`, `/ M`, denominator, bar, spinner, stagger or per-section tick-through anywhere (head, foot, collapsed line, annotation, announcement).
- No stop control, collapsed line, run-note body logic or `run.stop`: 3.7 owns the stop control and its protocol (its ACs already name the card head); the head keeps its field order and renders nothing that does not work.
- No change to `.memlog.md` handling beyond `pulled`, to `doc:section-opened` (stays declared, unemitted), to the watcher, the rail, persona state or the pinned slot. A template that cannot be read is no run failure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plan read | `bmad-prd` dispatched | `run:started.plan` is the ten spine names; foot lists all ten | N/A |
| No template | skill with none or several `*template*.md`, unreadable file, unsafe skill name | `run:started` carries no plan; head and foot run on observed headings | Swallowed, no event |
| Concern scan | note `concern scan surfaced: Labour Relations Posture` with that name in the menu | `run:note.pulled = ['Labour Relations Posture']`; card plan gains it before prose | Names not in the menu add nothing |
| Streaming | subject text reaches `## 3. Glossary` | head `writing · §4 Glossary` (fourth seen) | N/A |
| Observed differs | text has `## Risks`, absent from plan | `Risks` seen, appended to the foot; plan names never renumber | N/A |
| Revision | applied `Edit` changes text under `## 1. Vision` | head `revising · §2 Vision`; no later section named | N/A |
| Atomic commit | one `doc:committed` naming fifteen sections | all fifteen leave the foot in one render | A rejected commit changes nothing |
| Hydrate | window reloads mid-run | plan from the snapshot, `seen` from the seeded subject text | N/A |
| Terminal card | run finished | head `saved · age · N sections` as before; foot lists nothing it has no use for | N/A |

</intent-contract>

## Code Map

- `src/shared/events.ts:81-91,98-105` -- `RunStarted` and `RunNote`: add optional `plan?: string[]` and `pulled?: string[]` (additive: no version change). `src/shared/conversation.ts:96-120` -- `RunCardSnapshot`: add optional `plan?: string[]`.
- `src/main/fold/section-headings.ts` -- the heading scanner; move it to `src/shared/section-headings.ts` with a `scanHeadings(text): {name, offset}[]` core and keep `sectionHeadings` as its names, leaving `main/fold/section-headings.ts` a re-export so imports and tests stand (the renderer may not import `main`).
- `src/shared/section-plan.ts` (new, pure) -- `sectionName`, `templatePlan(text): {spine, menu}`, `pulledSections(menu, note)`, `sectionAt(text, offset)`, `pendingSections(plan, written, seen)`.
- `src/main/sources/skill/read-plan.ts` (new, I/O) -- reads the skill's template; layering: `sources` only.
- `src/main/session-bridge.ts:226-250` -- `dispatchMenu` reads the plan for a `skill` action before the turn is written, passes it to `registry.startRun`; `SessionBridgeDeps` gains an injectable `readPlan`. `src/main/session-registry.ts` `startRun` and `src/main/session-run.ts:130-160,200-240` -- `startRun` puts `plan` on `run:started` and `menu` on `ActiveRun`; `observeMemlog` adds `pulled` to each `run:note`.
- `src/main/fold/run-card.ts:21-70` -- `startCard` sets `plan`; `run:note` appends `pulled` names to it (deduped). `src/renderer/ui/chat/conversation-state.ts:230-300` and `transcript-entry.ts:46-62` -- the same on `RunCardEntry.plan`; `hydrate` carries `card.plan`. `tests/run-card-parity.test.ts` holds both equal.
- `src/renderer/ui/chat/prose-store.ts` -- add `progress(runId)` and `seen(runId)`: stable cached values for the subject, recomputed lazily when the subject's text or path changed; `commit` with text marks `revising` (position by common prefix of old and new text), the next `append` clears it; `seed` rebuilds `seen` from the text.
- `src/renderer/ui/chat/run-status.ts:25-50`, `run-card.tsx:40-90`, `run-card.css` -- `runStatusText` takes progress; the head status and a foot line `<count> to write` plus the names (beside the existing `also written`). `src/renderer/ui/chat/run-card.dom.test.tsx` (jsdom) is the test pattern; `fixtures/runs/multi-file-sonnet.jsonl` and `tests/run-replay-multi-file.test.ts` replay a real run.
- Read-only evidence: `.claude/skills/bmad-prd/assets/prd-template.md` (spine inside the ```markdown fence at lines 5-122; scaffolding outside it; `## Adapt-In Menu` bullets from line 126), `fixtures/runs/fast-path-opus.jsonl` (memlog note `concern scan surfaced: Labour Relations Posture and Business Case/Pricing Posture`), `_bmad/scripts/memlog.py` (entries are one `- (kind by author) text` line).

## Tasks & Acceptance

**Execution:**
- `src/shared/section-headings.ts`, `src/shared/section-plan.ts`, `src/main/fold/section-headings.ts` -- move the scanner with offsets, add the plan helpers -- the one place both processes read headings
- `src/shared/events.ts`, `src/shared/conversation.ts` -- `plan?` and `pulled?` fields -- the contract
- `src/main/sources/skill/read-plan.ts` -- template read for a skill name (single segment, no `..`) -- main's I/O
- `src/main/session-bridge.ts`, `session-registry.ts`, `session-run.ts` -- read the plan at dispatch, `plan` on `run:started`, `menu` held on the run, `pulled` on `run:note` -- the plan reaches the window
- `src/main/fold/run-card.ts`, `src/renderer/ui/chat/conversation-state.ts`, `transcript-entry.ts` -- both folds grow `plan` -- one card in both places
- `src/renderer/ui/chat/prose-store.ts`, `run-status.ts`, `run-card.tsx`, `run-card.css`, `src/renderer/design/tokens.css` -- progress, head words, foot list -- what the person sees
- Tests: `src/shared/section-plan.test.ts` (parser on the real `prd-template.md`, emphasis, placeholder, no-fence template, `pulledSections`, `sectionAt`), `section-headings` offsets, `read-plan.test.ts`, `session-run`/bridge tests (plan on `run:started`, no plan on failure, `pulled`), `run-card.test.ts` and `tests/run-card-parity.test.ts`, `prose-store` tests (seen append-only, revising, seed), `run-card.dom.test.tsx` (head words, foot, fifteen names in one render, no `of`), `tests/negative-surface.test.ts` (no denominator, no stagger, no new animation), a replay of `multi-file-sonnet` showing the head and foot at each step -- one test per matrix row
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given the card's head, then it carries the state dot, the mono path, `writing · §N <Name>`, the elapsed time and nothing that would not work (the stop control is 3.7's, already in its ACs).
- Given the card's foot, then it lists the not-yet-written sections by name with a count, and no denominator or bar exists anywhere in the card.
- Given `bmad-prd`'s template, then the parser yields the ten numbered sections, no scaffolding heading, and no emphasis text in a name.
- Given a concern-scan note naming Adapt-In sections, then they join the plan before prose begins.
- Given observed headings that differ from the plan, then they win, the plan grows and no seen section is renumbered.
- Given an applied `Edit`, then the head reads `revising · §N <Name>` and the section counter does not advance.
- Given `doc:committed` naming sections, then all leave the foot in one render.
- Given the full suite, lint, typecheck and build, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass
- verdicts: 33 findings — high 0, medium 1, low 30, false 2, maybe-false 0 (three patched: one `medium`, two `low` test gaps; one `low` deferred; twenty-nine rejected)
- findings:
  - `[medium]` `[patch]` Blind and Edge: a frame can land while the streamed text ends mid-heading (`## 3. Glo`), and the partial name enters the append-only `seen`, leaving a ghost section and a wrong §N — verified in `settle` (the scanner matches a heading at the end of text with no newline); fix: the last line's heading counts only once its line is terminated, and the test whose title and assertion disagreed is corrected. Patched: `settle` admits a last-line heading only when the text ends with a newline; the test now agrees with its title and a `## 3. Glo` then `ssary` case was added.
  - `[low]` `[patch]` Blind: the atomic-commit DOM test builds a `MutationObserver` it never reads — real dead scaffolding; fix: assert on it or delete it. Patched: the test now reads the records and asserts the foot is removed in one removal with no record on an individual name.
  - `[low]` `[patch]` Gap: nothing exercises the production default `readPlan: deps.readPlan ?? readPlan` — a regression there would pass the whole suite; fix: one bridge test without the override against a real temp project. Patched: a `session-run.test.ts` case writes a real template and asserts `run:started.plan`.
  - `[low]` `[defer]` Intent: the story's head AC lists the stop control and the diff has none — 3.7 owns `run.stop` and the control, and its ACs already name the card head; recorded as deferred, no change here.
  - `[low]` `[reject]` Blind: `§N` counts sections seen, not the document's own numbers — the AC fixes `§N <Name>` and the spec fixes N as the seen position so a seen section is never renumbered.
  - `[low]` `[reject]` Blind: an `Edit` that renames a heading appends the new name to `seen` — a renamed section is a new name to the reader; rare, and a fix needs rename tracking the spec does not ask for.
  - `[low]` `[reject]` Blind: `sectionAt` is exported and tested but `settle` repeats its loop — the loop in `settle` also needs the headings for `seen`; unifying them is refactoring, with no named divergence.
  - `[low]` `[reject]` Blind: fence tracking is copied into `menuOf` — two small loops over one grammar; the scanner returns headings, the menu needs bullets, so sharing it would add structure.
  - `[low]` `[reject]` Blind: the foot says `to write` for sections streamed but not yet committed, and for every section when there is no plan — this is the designed rule (Design Notes: the foot follows commits and the head follows the stream), without which an atomic commit moves nothing.
  - `[low]` `[reject]` Blind: concern-scan matching is a bare substring — the spec fixes it; a false match needs a menu name inside a longer word of a concern note, which none of the menus in this repo can produce.
  - `[low]` `[reject]` Blind: `readPlan` swallows every failure and reads only the project's own skills, with no size cap — the spec says a template that cannot be read is no failure; user-level skills are outside the install the product reads, and the file is a local template.
  - `[low]` `[reject]` Blind: a matrix row (rejected commit changes nothing, hydrate with plan and no text) has no card-level test — the fold's rejected-commit rule is covered by the existing fold tests and the hydrate row by the DOM reload test.
  - `[low]` `[reject]` Blind: the foot's count and names are bare spans with no list semantics — the card has no list pattern anywhere and the spec does not ask for announcements of the foot.
  - `[low]` `[reject]` Blind: `settle` rescans the whole text each frame — a 70 KB document scans in well under a millisecond and runs at most once a frame, so no named cost.
  - `[low]` `[reject]` Blind: two copies of the plan in main (`ActiveRun.plan` and the card's) and an unrelated type import in `run-status.ts` — the first is held equal by the parity test and the second is the same type, moved to keep the node typecheck clean.
  - `[low]` `[reject]` Blind: `tokens.css` is listed in the spec's tasks and not changed — no new dimension was needed, and the literal guard passes.
  - `[low]` `[carried]` `[reject]` Edge: the partial-heading case — same cause and fix as the first row.
  - `[false]` `[reject]` Edge: an `Edit` that deletes the last lines of a section makes the head name the next section — the first changed offset is the first differing character, which lies in the section being edited, and not at the next heading's offset.
  - `[low]` `[reject]` Edge: `settle` runs on read, so more than once a frame — it runs only when the text version changed, so a second read in a frame costs nothing.
  - `[low]` `[reject]` Edge: `1.5 Year Plan` loses its `1.5` — a heading that opens with a dotted number is read as numbering; the case is rare and the numbering rule is the AC's.
  - `[low]` `[carried]` `[reject]` Edge: concern-scan substring matching with no word boundary — same as the Blind row.
  - `[low]` `[reject]` Edge: a numbered or fenced `Adapt-In Menu` heading yields no menu — the repo's template has a plain unfenced one; the spec states the unnumbered form.
  - `[low]` `[reject]` Edge: a plan name spelled differently from what the skill writes (`Non-Goals (Explicit)` and `Non-Goals`) stays in the foot until the run ends — real, and the plan is a prediction; a fuzzier match risks clearing a section that was not written. Residual risk.
  - `[low]` `[reject]` Edge: after a reload `seen` is rebuilt from the current text, so a number can change — the spec states `seen` is rebuilt from the seeded text; main does not hold it.
  - `[low]` `[carried]` `[reject]` Edge: `readPlan` has no timeout or size cap — same as the Blind row, a local template read.
  - `[low]` `[reject]` Intent: the intent is a story id and its head AC lists a stop control — see the deferred row; the spec and the epic context place it in 3.7.
  - `[low]` `[reject]` Intent: the diff does not touch `sprint-status.yaml` or set the spec to `done` — finalize steps of this run, done after triage.
  - `[low]` `[reject]` Intent: the diff shows uncommitted work — the commit is this run's finalize.
  - `[low]` `[reject]` Intent: the head and foot are verified in jsdom, not in the real window — recorded as a residual risk.
  - `[low]` `[reject]` Intent: whether a real concern-scan note arrives before prose in a live run is untested — the `fast-path-opus` note shows it is written during discovery; residual risk.
  - `[low]` `[reject]` Intent: the contract fields, the template reader and the dispatch re-check are additions beyond the intent's words — each is in the spec and needed to carry the plan.
  - `[false]` `[reject]` Intent: only the subject's commits clear the foot, so a name written to another file does not — the spec states this; the intent's AC speaks of one document.
  - `[low]` `[reject]` Intent: the single-frame check counts renders, not painted frames — one React commit is one frame in this app; no paint can be asserted in jsdom.

## Design Notes

- **Why the foot follows commits and the head follows the stream.** A fifteen-section `Write` streams all its headings before its `tool_result`; if the foot followed the stream it would tick down while the call is still unconfirmed, and a commit would move nothing. Committed names are the only truthful "written", and they arrive in one event.
- **`seen` is the numbering.** The plan is a prediction and can be wrong or reordered; `seen` is what the person has watched. Appending to it only is what makes "never renumbered" hold across an `Edit` that inserts a section ahead of others.
- **`pulled` is computed in main.** Main reads the template and knows the format, so the events carry names and neither fold parses a memlog or a template.
- **The stop control.** 3.3's head AC lists it, but `run.stop`, the interrupt and the fallback are 3.7's; a control that does nothing would break "a working stop". The head keeps the dot, path, status, elapsed order so 3.7 adds one field.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Run a PRD skill from John in the real app: the head names the section being written, the foot lists the rest by name, and a commit clears them at once. An unattended run cannot do this; record it as a residual risk.

## Auto Run Result

**Summary.** The run card now reads against a plan. At dispatch main reads the skill's own template (`.claude/skills/<skill>/assets/*template*.md`) and puts the predicted section names on `run:started.plan`; a memlog concern-scan note that names Adapt-In sections adds them as `run:note.pulled`. The head reads `writing · §N <Name>` from the streamed text (`revising · §N <Name>` after an applied `Edit`, the counter not advancing), numbered by an append-only `seen` list so a seen section is never renumbered. The foot lists the sections not yet committed by name with a count (`N to write`), and one `doc:committed` clears every name it lists in one render. No denominator, bar, spinner or stagger exists. The template parser takes only document sections: on `prd-template.md` it yields the ten `0.`-`9.` sections and none of `PRD Template`, `Essential Spine` or `Adapt-In Menu`.

**Files changed.** `src/shared/section-headings.ts` (scanner moved here with offsets; `src/main/fold/section-headings.ts` re-exports it) and `src/shared/section-plan.ts` (pure plan helpers); `src/shared/events.ts`, `src/shared/conversation.ts` (`plan`, `pulled`); `src/main/sources/skill/read-plan.ts` (template read); `src/main/session-bridge.ts`, `session-registry.ts`, `session-run.ts` (plan read at dispatch, `plan` on `run:started`, `pulled` on notes); `src/main/fold/run-card.ts`, `src/renderer/ui/chat/conversation-state.ts`, `transcript-entry.ts` (both folds carry `plan`); `src/renderer/ui/chat/prose-store.ts`, `run-status.ts`, `run-card.tsx`, `run-card.css` (progress, head, foot); tests beside each plus `tests/contract.test.ts`, `negative-surface.test.ts`, `run-card-parity.test.ts`, `run-replay-multi-file.test.ts`; `sprint-status.yaml` (3.3 `done`) and `epic-3-context.md` (3.3 marked done).

**Review.** 33 findings: patches applied 3 (one medium, a half-streamed heading entering `seen`; two low test gaps: an unread `MutationObserver`, the untested production `readPlan` wiring); deferred 1 (the stop control, Story 3.7's); rejected 29 with reasons in the log (false 2, low 27). Patched by verdict: high 0, medium 1, low 2.

**Follow-up review recommended: false.**

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` unit 135 files, 2925 tests passed, watchers 3 files, 55 tests passed; `npm run build` exit 0. Run before review and again after the patches. Matrix audit: every I/O row has a covering test that ran (`section-plan.test.ts`, `read-plan.test.ts`, `session-run.test.ts`, `prose-store.test.ts`, `run-card.dom.test.tsx`, `tests/run-replay-multi-file.test.ts`, `tests/run-card-parity.test.ts`).

**Residual risks.**
- Not seen in a real window: no live `bmad-prd` run from John was made, so how head and foot read to a person watching is untested.
- A plan name spelled differently from the heading the skill writes (`Non-Goals (Explicit)` and `Non-Goals`) stays in the foot until the run ends; in the `multi-file-sonnet` replay the run's real headings differ from the template's ten, so the foot lists unwritten template names beside the grown ones.
- The stop control named in this story's head AC is not built (deferred above to 3.7).
- After a window reload `seen` is rebuilt from the current text, so a number can differ from before if an earlier edit removed a heading.
- A concern-scan note is matched to menu names by substring; a short name inside a longer word would match.

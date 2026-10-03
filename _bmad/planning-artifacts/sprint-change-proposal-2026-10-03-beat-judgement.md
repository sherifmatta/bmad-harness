# Sprint Change Proposal — the beat did not land (Story 3.1 live judgement)

**Date:** 2026-10-03 · **Author:** Developer (bmad-correct-course) · **For:** Sherif · **Mode:** Batch · **Status:** APPROVED by Sherif 2026-10-03; applied to `epics.md` and `sprint-status.yaml`

Decisions already made by Sherif for this proposal: the card is **pinned while its run is in flight**; the card's subject is **the file with the largest `Write` so far**; the change is **Direct Adjustment** (three new stories, two amended).

## 1. Issue Summary

**Trigger.** Story 3.1 (`done`, `d258a17`). Its final acceptance criterion required a recorded judgement on whether the beat lands before 3.2 onward. A live run (`bmad-prd`, real `claude`, default model, 57 min 39 s, plus a 16 s smoke) was judged on 2026-10-03; `_bmad/implementation-artifacts/judgement-3-1-the-beat.md` (`856052f`).

**Core problem.** Failed approach in the plan, not a defect in 3.1: the plan treats a run as *one document*. A real run writes many files, and the planned card has no rule for which one it shows. The mechanism worked (card born on press, prose streamed, notes arrived, `saved` reached; the smoke run landed in full). The claim did not: the user cannot follow *the document* being authored.

**Evidence** (judgement findings 8 to 14):
- The head path and body followed whichever file was last written: `addendum.md`, then `prd.md`, then back. The PRD was the card's subject for under 8 of 57 minutes.
- Head said `prd.md · 25 sections`; `prd.md` has 19 level-2 headings. The count was the union across every file the run committed.
- 32 of 33 writes in the recorded Fast-path run are revision `Edit`s; each replaced the visible text. The saved card ended on a 314-character fragment.
- The tile read `file changed` (`note`) after the run, not `live`: the persona's own write outranks `live` (Epic 2 deferral, `deferred-work.md` line 59, now confirmed).
- The persona narrates in chat for the whole run; its turns land below the card, so the card is scrolled away while it is the thing to watch.
- Dead air was 1 min 40 s to the first note (not 11 min 45 s), but 24 to 34 notes arrived 1 to 5 minutes apart across a 20-minute middle.

## 2. Impact Analysis

| Area | Impact |
|---|---|
| **Epic 3** | Still completable. Three stories added before 3.2; 3.3 loses one acceptance criterion; the rest unchanged. The cut line (3.9, 3.10) is unaffected. |
| **Stories** | New 3.12, 3.13, 3.14, to land before 3.2. 3.3: its revision-`Edit` AC splits (head wording stays, buffer patching moves to 3.12). 3.4 unchanged and confirmed as planned (change 5). |
| **PRD** | None (`prd` is not the source of these requirements; epics.md carries the FRs). |
| **epics.md FRs** | Amend FR31, FR32, FR37, FR47, FR103 text. No new FR numbers; the coverage map is unchanged. |
| **Architecture** | AD-5 (a `Write` replaces *the* buffer) becomes one buffer per path; AD-11/AD-3 unaffected. Handoff to `bmad-architecture`. |
| **UX** | EXPERIENCE.md card section: pinned card while running, subject rule, per-document `N sections`. DESIGN.md: a pinned-card position. Handoff to `bmad-ux`. |
| **Code** | `fold/route-frame.ts` (per-path buffers, decode `old_string` for patching), `fold/run-card.ts` and the renderer's mirror, `fold/persona-state.ts` (`note` rule), chat column layout. A re-recorded multi-file fixture. |
| **Sprint** | `sprint-status.yaml` gains three `backlog` rows after 3.1. No re-estimate of existing rows. |

## 3. Recommended Approach

**Direct Adjustment.** Add three stories ahead of 3.2 and keep the remaining plan. Rollback of 3.1 is not warranted: its mechanism is what the judgement verified.

- **Effort.** 3.12 is the largest (per-path buffers, patch by `old_string`, subject rule, a new fixture); 3.13 and 3.14 are small to medium.
- **Risk.** Medium. The subject rule (largest `Write` so far) can switch subject mid-run; the story pins that behaviour with a fixture. Edits applied by `old_string` fail when a run patches through Bash (opus uses Python patches); the story names the fallback.
- **Timeline.** 3.2 onward waits for these three; the judgement gates it already.
- **Why not "leave it".** Change 5 (keep dead air as planned) is the only change that needs nothing: 3.4 stays as written.

## 4. Detailed Change Proposals (epics.md, sprint-status.yaml)

### 4.1 FR31 (CAP-5)

OLD: `run:started` births a run-scoped document card inline in the conversation, in time order. The card dies with the run's terminal event. A plain chat turn raises no card.

NEW: `run:started` births a run-scoped document card inline in the conversation, in time order. **While its run is in flight and its persona is the one being viewed, the card is pinned at the top of the chat column; when the run's terminal event arrives it returns to its place in the thread, in one frame.** The card dies with the run's terminal event. A plain chat turn raises no card.

*Rationale:* finding 11; the chosen answer to change 4.

### 4.2 FR32

OLD: …**head:** state dot, file path, current section, elapsed run time, stop control; **body:** the prose streaming in; **foot:** …

NEW: …**head:** state dot, **the subject document's** file path, … **body:** the subject document's prose streaming in; **foot:** the subject's not-yet-written sections by name, plus counts, **and the other files this run has written, named and never shown in the body**.

*Rationale:* finding 8. The **subject** of a card is the file with the most characters written by a `Write` in the run so far; ties go to the earlier file; it changes only when another file's `Write` passes it.

### 4.3 FR37

OLD: A revision `Edit` sets the head to `revising · §N <Name>`; it re-parses sections but never advances the section counter. A `Write` replaces the document buffer and may open new sections.

NEW: A revision `Edit` of the subject sets the head to `revising · §N <Name>`, **patches that document's buffer (its `old_string` replaced by its `new_string`)**, re-parses sections and never advances the counter. A `Write` replaces **that path's** buffer and may open new sections. **Each path has its own buffer; an `Edit` or `Write` of another path never changes the subject's body.** An `Edit` whose `old_string` is not in the buffer leaves the buffer as it was.

*Rationale:* finding 13.

### 4.4 FR47

OLD: `run:finished` sets the head to `saved · just now · N sections`, moves the dot `work` -> `live`, and removes the caret.

NEW: `run:finished` sets the head to `saved · just now · N sections`, where **N is the number of sections of the subject document**, moves the dot `work` -> `live`, and removes the caret.

*Rationale:* finding 9.

### 4.5 FR103

OLD: …`note` (the watcher saw a change to a file this persona owns)…

NEW: …`note` (the watcher saw a change to a file this persona owns **that its own run did not make: a change observed while one of its runs is in flight, or within the watcher's settle window after that run's terminal event, is the run's own and raises no `note`**)…

*Rationale:* finding 10; closes the Epic 2 deferral.

### 4.6 Story 3.3 — revision acceptance criterion

OLD:
> **Given** a revision `Edit` rather than a `Write` **Then** the head reads `revising · §N <Name>`, the document buffer is patched rather than replaced, and the section counter does not advance **And** this is verified against the corpus fixture in which twenty of twenty-one writes were revision edits.

NEW:
> **Given** a revision `Edit` rather than a `Write` **Then** the head reads `revising · §N <Name>` and the section counter does not advance **And** the buffer patch itself is Story 3.12's, verified there.

*Rationale:* the patch moves forward; 3.3 keeps the head wording.

### 4.7 New stories (placed after 3.1; sequencing: **3.12, 3.13 and 3.14 land before 3.2**)

**Story 3.12: A card follows one document**

As someone watching a run that writes several files, I want the card to follow one document from first word to saved, so that what I am watching is the document and not whichever file was touched last.

**Implements:** FR32, FR35, FR37, FR47 · UX-DR19

**Acceptance Criteria:**

**Given** a run in which `Write` calls to more than one path stream **Then** the card holds a document buffer per path and shows exactly one of them, its subject, in the head path and the body **And** the subject is the file with the most characters written by a `Write` in this run so far (ties to the earlier), changing only when another file's `Write` passes it.

**Given** other files the run writes **Then** they are named in the foot as written files and never take over the body or the head path.

**Given** a revision `Edit` of the subject **Then** its buffer is patched by replacing `old_string` with `new_string`, and the body ends the run as the whole document, not as the last edit **And** an `Edit` whose `old_string` is absent leaves the buffer unchanged, and an `Edit` of another path does not touch the body.

**Given** `run:finished` **Then** the head reads `saved · just now · N sections` with N the sections of the subject document.

**Given** a multi-file run recorded with `scripts/record-run.mjs` (a `bmad-prd` run that writes an addendum, a pre-review copy and the PRD, and revises by `Edit`) **When** it is replayed through the card **Then** the subject is the PRD, the final body is the PRD's text, and N equals the PRD's section count.

**Story 3.13: A finished run leaves its persona live**

As someone whose persona has just finished a run, I want its dot to read `live`, so that finishing reads as finishing and not as something being changed behind my back.

**Implements:** FR47, FR103

**Acceptance Criteria:**

**Given** a persona's run in flight or within the watcher's settle window after its terminal event **When** the rail sees a change to a file that persona owns **Then** no `note` is raised **And** a change outside that window, or to a file the persona does not own, still raises one.

**Given** a run that writes files through `Write`, `Edit` and Bash **Then** the persona's dot reads `work` to `live` after the run in each case, never `note`, verified against a live run as well as the corpus.

**Given** the next turn or run **Then** `live` clears as it does today.

**Story 3.14: The running card stays in view**

As someone watching a run while the persona talks, I want the running card to stay where I can see it, so that the document being written is not scrolled away by the conversation about it.

**Implements:** FR31 · UX-DR19

**Acceptance Criteria:**

**Given** the viewed persona has a run in flight **Then** its card is pinned at the top of the chat column, head and body, with the persona's turns scrolling beneath it **And** the body keeps its existing height cap.

**Given** the run's terminal event **Then** the card returns to its time-ordered place in the thread in a single frame, with no animation, and the thread does not jump.

**Given** a card of a persona that is not the one viewed **Then** it is not pinned (it is the collapsed line of Story 3.5).

**Given** keyboard and assistive-technology use **Then** the pinned card is first in the chat column's tab order, takes no focus when it pins or unpins, is not a live region, and under reduced motion changes nothing visible but position.

**Given** the negative surface **Then** no "jump to card" control, badge or toast exists.

### 4.8 Epic 3 implementation note (epics.md, Epic 3 list)

Add one bullet: "**Follow-ups from the Story 3.1 live judgement land before 3.2:** Stories 3.12 (one document per card), 3.13 (`live` after a run) and 3.14 (pinned card). Story 3.4 stands as planned; the live run's dead air was 1 min 40 s to the first note, with a 20-minute middle in which the body must not freeze on a stale buffer, which 3.12 prevents."

### 4.9 sprint-status.yaml

After `3-1-…: done` add, as `backlog`: `3-12-a-card-follows-one-document`, `3-13-a-finished-run-leaves-its-persona-live`, `3-14-the-running-card-stays-in-view`.

## 5. Implementation Handoff

**Scope: Moderate** (backlog reorganisation plus planning-text amendments; no PRD change).

- **Developer (Amelia) via `bmad-build`:** stories 3.12 to 3.14, in that order of dependency (3.12 first; 3.13 and 3.14 are independent of each other).
- **`bmad-ux`:** amend EXPERIENCE.md (card section: pinned while running, subject rule, per-document `N sections`, the `note` rule) and DESIGN.md (pinned position). Not hand-edited here.
- **`bmad-architecture`:** amend AD-5's one-buffer rule to per-path buffers. Not hand-edited here.
- **Product owner (Sherif):** confirm or overrule the judgement's verdict; record it in `judgement-3-1-the-beat.md`.

**Success criteria:** a replayed multi-file run ends on the PRD's full text with the PRD's section count; the persona reads `live` after a live run; the card is visible throughout a run in the chat column; a repeat live `bmad-prd` run is judged and the beat lands.

## Appendix — checklist record

1.1 trigger: Story 3.1, done. 1.2 failed approach (the plan's one-document assumption). 1.3 evidence: judgement findings 8 to 14. 2.1 Epic 3 completable with additions. 2.2 modify scope (three stories). 2.3 Epic 4 independent, unaffected. 2.4 no new epic. 2.5 resequence: the three stories precede 3.2. PRD: n/a. Architecture: AD-5 amend. UX: card section amend. Direct Adjustment chosen; Rollback and MVP Review rejected (the mechanism is verified; scope is not at issue).

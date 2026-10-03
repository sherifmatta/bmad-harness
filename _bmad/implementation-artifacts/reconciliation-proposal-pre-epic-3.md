# Sprint change proposal: spec reconciliation before Epic 3

- **Date:** 2026-10-02
- **Status:** DRAFT. Nothing in `_bmad/planning-artifacts/` or any existing file has been edited. This file is the only artifact written.
- **Triggers:** Epic 2 retro action item 12 (sprint key `epic-2-retro-item-28-before-epic-3-finish-epic-1-item-6-fr83`) and Epic 1 retro item 6 (sprint key `epic-1-retro-item-6-correct-the-stop-mechanism-everywhere-st`). Sherif decided they run together as one pass (`epic-2-retro-2026-10-02.md`, "Pre-Epic 3 plan", point 2).
- **Mode:** Batch (the correct-course skill's non-interactive form; no checklist walk-through with the user was run).
- **Owners named by the retro:** PM + architect. Three single-writer files are touched, so a third owner (UX) is needed for `EXPERIENCE.md`.
- **Line numbers** are current as of HEAD `cffccb3` on branch `fix/pre-epic-3-remediation`. Several in the retro had drifted (noted per row).

---

## 1. Issue summary

Two groups of planning text disagree with what the build and its evidence now show.

**A. The stop mechanism (Epic 1 retro item 6).** Story 1.1 measured it (`spikes/spike-stop-semantics.md`, 8 interrupted turns, CLI 2.1.274). `SIGINT` ends the session (4/4, `result` about 16ms in, then exit `rc=0` at 217-390ms). An in-band `control_request` with `subtype: "interrupt"` written to the session's stdin halts one turn and keeps the session (4/4, `result` in 3-6ms, process alive, next turn answered in persona). `stop_reason` is `null` on every interrupted turn. `execution-model.md` ("Stop and failure") and `SPEC.md:129` were corrected, and `epic-2-context.md:50` already says earlier text is stale. The requirement text that Story 3.7 will implement (FR83, FR87, FR90, Story 3.7, Story 3.8) and the architecture and UX files still assert `SIGINT` or still carry the unresolved Branch A/B fork. Story 1.13's AC list was a closed list that named none of these (recorded in `deferred-work.md`, Story 1.1 entry), which is why the amendment never landed.

**B. Epic 2 leftovers (Epic 2 retro item 12).** Four planning statements are contradicted by what Epic 2 built or recorded:
- F1: the premise "a `result` row always belongs to the turn the harness is waiting on" (Story 2.5, FR98, AD-11, AD-18) is contradicted by the corpus Story 2.1 recorded.
- F18: "transcript, session state and install model ... are persisted" (Story 2.7, FR16, AD-7). Only the transcript is.
- F6: Story 2.9's "Given a handoff occurs, then a sysline lands" is under-specified against the conditions the sysline really has.
- F20: Story 2.11 deferred the orphan's document card and stop control to Epic 3 ("both belong to Epic 3"), but no Epic 3 AC carries them. This is Epic 1 process item 17 recurring. FR6 is mapped wholly to Epic 2 while two of its three clauses cannot be verified there.

## 2. Impact analysis

- **Epic 1 (done):** Story 1.1 gets an amendment note. Epic 1 narrative notes (`epics.md:212, 422`) are corrected in place.
- **Epic 2 (done):** Stories 2.1, 2.5, 2.7, 2.9, 2.11 get amendment notes. FR16, FR98, FR6's coverage row and the Epic 2 narrative note (`epics.md:440`) are corrected.
- **Epic 3 (not started):** Stories 3.5 (rationale wording), 3.7 (stop ACs rewritten, orphan and dead-card ACs added) and 3.8 (terminal-state ACs) change in place. Their ACs are not frozen. No story is added or removed, no FR moves epic, and the FR counts in the coverage table are unchanged.
- **Epic 4:** no impact.
- **Architecture (`ARCHITECTURE-SPINE.md`):** AD-7, AD-11, AD-18, the process diagram, the SDK deferral and the open-items list.
- **UX (`EXPERIENCE.md`):** the stop-cost fork section, one microcopy row, one focus-rationale row. `DESIGN.md` has no stale stop text.
- **Compiled caches:** `epic-1-context.md:62` is stale and `epic-2-context.md` should be re-synced. Both are regenerated, not hand-edited.
- **Technical impact:** none directly. Rows 13-16, 27 and 28 change what Story 3.7 and Story 3.8 build, which is the point.
- **Dependencies on parallel remediation** (retro items 1, 2, 5): the wording of the Story 2.5 and 2.9 amendments states observable behaviour and avoids prescribing the pending-turn model or the sysline fix. Where an item-5 design choice is still open it is bracketed and listed in section 7.

## 3. Recommended approach

**Direct Adjustment.** Documentation edits only, no rollback, no scope reduction. Classified Minor in effort but routed Major-class (PM and architect, plus UX) because the affected files are single-writer files owned by skills. Risk: low, with the one exception that the 2.5 and 2.9 amendments are only true once remediation items 1 and 5 land. The amendments are therefore worded to be correct either way (see rows 33 and 37).

### 3.1 How earlier amendments were treated, and the recommendation

What the repo shows:
- `epics.md` has two commits (`01be288`, `604e351`) and no change log or revision section. `604e351` (Epic 1 retro) is the only commit that amended already-planned stories. It did so by appending a labelled paragraph, "**Carried in from the Epic 1 retrospective** ... (action item 6)", plus two ACs under Story 2.1 (`epics.md:1060-1071`), and by an AC that names a done story's check and says it "is amended to assert ..." (`epics.md:1071`, Story 1.14 was done).
- Story 1.13 (`epics.md:956-980`) is the established vehicle for spec amendments: each edit cites the source that overrides it and "no amendment changes any capability's intent".
- Story spec files carry a `## Spec Change Log` that is written only on a `bad_spec` loopback (`spec-1-1` triage log); it is not a post-close amendment record. The `spec-*.md` files are the build record and are not touched here.
- The retros say "`epics.md` unamended" for stale done-story text (`epic-1-retro-2026-09-30.md:79, 81`; `epic-2-retro-2026-10-02.md` F18), i.e. an amendment to `epics.md` is the expected remedy.

**Recommendation:**
- **Done stories (1.1, 2.1, 2.5, 2.7, 2.9, 2.11): an amendment note** appended under the story's last AC, labelled "Amended after close", citing its source and quoting the criterion it supersedes. The original AC text stays untouched, so the frozen list remains the record of what was reviewed, and the note tells the next reader which criterion governs. No change-log entry: `epics.md` has no log to put it in, and inventing one for six notes adds a second place to look.
- **Not-started stories (3.5, 3.7, 3.8): edit in place.** Their ACs are not frozen.
- **Requirements, architecture and UX text (FRs, ADs, EXPERIENCE rows, epic narrative notes): edit in place.** They are not AC lists. Story 1.13's convention applies: each edit cites its source.

## 4. Detailed change proposals

Owning skills. `epics.md` is written only by `bmad-create-epics-and-stories`. Its FR lines are derived from `SPEC.md`, which is already correct (`SPEC.md:129`, `execution-model.md` "Stop and failure"), so no `bmad-prd` pass is needed for this reconciliation. `ARCHITECTURE-SPINE.md` is owned by `bmad-architecture`. `EXPERIENCE.md` is owned by `bmad-ux`. Context caches are regenerated, not edited.

Long proposed text is in section 5 (stop mechanism), 5.B / 6.B (orphan) and 6.C (reconciliations), keyed by row number. "Excerpt" quotes the current text, shortened with `...`.

### 4.A Stop mechanism

| # | File : current line | Current text (excerpt) | Proposed | Rationale | Owning skill |
|---|---|---|---|---|---|
| 1 | `epics.md:143` (FR83) | "...dispatches `run.stop(runId)`, which sends `SIGINT`." | Text in 5.1. `run.stop` writes one in-band `control_request` interrupt to the session's stdin; `SIGINT` ends a session and is never the stop mechanism. | Spike Finding 1 and 2; `execution-model.md` "Stop and failure". Story 3.7 implements this FR. | bmad-create-epics-and-stories |
| 2 | `epics.md:144` (FR84) | "Where stop ends the persona's session, the full-card control reads `stop · ends this conversation` and the collapsed line carries the cost in its accessible name." | Text in 5.2. Plain `stop` on both forms; the principle "cost on the control, never a modal" is kept for any future cost; fallback clause bracketed. | Spike "Consequences": FR84 ships plain `stop`. Not on the retro's list; found while sweeping. | bmad-create-epics-and-stories |
| 3 | `epics.md:150` (FR87) | "...terminates the turn the harness is waiting on. `subtype: "error_during_execution"` with `is_error: true` and a `stop_reason` marks a turn stopped or failed..." | Text in 5.3. Drop `stop_reason`; state `result` ends *a* turn. | `stop_reason` is `null` on 8/8 interrupted turns; a detector requiring it misses every stop. `execution-model.md:130-134` already corrected. Also removes the F1 premise (row 31). | bmad-create-epics-and-stories |
| 4 | `epics.md:153` (FR90) | "**Where stopping also ends the session (the Branch B outcome of the stop spike), there is no persona left...** A *failure* leaves the session alive, so FR90 holds as written for failures under either branch." | Text in 5.4. Strike the Branch B framing; narrow the carve-out to "the session itself ended with the run". Alternative (strike entirely) is question 1. | Spike: FR90 stands for stops; the carve-out is dead text as written. | bmad-create-epics-and-stories |
| 5 | `epics.md:212` (Additional Requirements, spike item 1) | "**Stop semantics** — whether `SIGINT` can halt a skill turn without ending the persona session. Named as the cheapest spike ... **scheduled at the front of Epic 1** ..." | Text in 5.5. Mark settled. | The open item is closed (`SPEC.md:129`). | bmad-create-epics-and-stories |
| 6 | `epics.md:265` (UX-DR30) | "...`stop · ends this conversation` not a confirm modal; ..." | Replace the pair with "`stop` not a confirm modal". | That string no longer ships. Mirrors row 21. | bmad-create-epics-and-stories (UX-DR text is derived from `EXPERIENCE.md`) |
| 7 | `epics.md:422` (Epic 1 note) | "**The SIGINT spike runs at the front of this epic** ... under Branch B there is no persona left to explain a stop." | Text in 5.6. Past tense, outcome stated. | Retro item 6 names `:422`. | bmad-create-epics-and-stories |
| 8 | `epics.md:440` (Epic 2 note) | "**The SIGINT spike has moved to the front of Epic 1** ... Branch B means a stop leaves no persona to explain itself, and the session lifecycle here must account for that." | Text in 5.7. | Retro item 6 names `:440`. Epic 2 needs no stop-ends-session case. | bmad-create-epics-and-stories |
| 9 | `epics.md:462` (Epic 3 note) | "Under Branch B, FR90's ... is unavailable for a stop, and FR89's deliberate conflation ... The failure stories must resolve both cases explicitly once the spike lands." | Text in 5.8. | The spike landed. Not on the retro's list; found while sweeping. | bmad-create-epics-and-stories |
| 10 | `epics.md:494-521` (Story 1.1, done: statement at 497, Branch A/B ACs at 505-518) | "I want to know whether `SIGINT` can halt one turn ... **Given** the observed outcome is Branch A ... Branch B ..." | **Amendment note**, appended after the last AC (line 521). Text in 5.9. ACs untouched. | Story is done; the ACs were all satisfied (the outcome was recorded), but they frame the answer as a property of `SIGINT`. The note says which branch fired and for which mechanism. | bmad-create-epics-and-stories |
| 11 | `epics.md:1043` (Story 2.1, done) | "...`fixtures/runs/` contains ... a `SIGINT` sent mid-write, and a failure inside the reviewer gate." | **Amendment note** under the story. Text in 5.10. | The corpus holds both `interrupt-sigint` (session ends) and `interrupt-inband` (session survives), per `fixtures/runs/README.md:14-15`. NFR6 carries the same phrase; see 4.D. | bmad-create-epics-and-stories |
| 12 | `epics.md:1603` (Story 3.5) | "focus lands on the card container, **never** on the stop control, whose cost may be the session." | "... **never** on the stop control, which interrupts a running turn when activated." | The rationale cited the Branch B cost. The rule itself stands (NFR21). | bmad-create-epics-and-stories |
| 13 | `epics.md:1643-1657` (Story 3.7) | AC1 "...which sends `SIGINT`"; AC2 "Given the branch settled by story 1.1 / When stopping is cheap ... And when stopping also ends the session ..."; AC3 cost wording; AC4 "Given a subprocess exits within roughly 250ms of `SIGINT`" | Replacement ACs in 5.11 (AC1, AC2, new fallback AC, AC3, AC4). AC5 (byte-for-byte) and AC6 (tab stop) unchanged. | Retro item 6 names "Story 3.7's ACs (including the ~250ms figure)". Current line is `:1656`, the earlier `:1643` has drifted. The 250ms figure is refuted (under 400ms, and not load-bearing for stop). | bmad-create-epics-and-stories |
| 14 | `epics.md:1676-1679` (Story 3.8) | "...`subtype: "error_during_execution"` with `is_error: true` and a `stop_reason` marks it stopped or failed..." | Text in 5.12. | Same as row 3. | bmad-create-epics-and-stories |
| 15 | `epics.md:1697-1698` (Story 3.8) | "**Given** stopping also ended the session **Then** no persona remains to deliver that explanation..." | Text in 5.13. Condition becomes "the session ended with the run". | Under the in-band interrupt a stop does not end the session. | bmad-create-epics-and-stories |
| 16 | `epics.md:1700` (Story 3.8) | "**Given** the corpus fixtures for a `SIGINT` mid-write and a reviewer-gate failure" | Text in 5.14. Name `interrupt-inband.jsonl` and `interrupt-sigint.jsonl`. | The fixtures exist under those names. | bmad-create-epics-and-stories |
| 17 | `ARCHITECTURE-SPINE.md:190` (AD-18 rule) | Three passages: "terminates the turn the harness is waiting on (AD-11 guarantees there is exactly one)"; "`subtype: "error_during_execution"` with `is_error: true` and a `stop_reason` marks stopped or failed"; "**Open risk:** `SIGINT` is known to exit a subprocess `rc=0` in ~250ms, but interrupting one turn without ending the session is unverified; ..." | Three splices, text in 5.15. | Retro names `:190`. Also carries the F1 premise (C) and the `stop_reason` error. | bmad-architecture |
| 18 | `ARCHITECTURE-SPINE.md:267` (process diagram) | `MAIN -->\|spawn, chat and skill turns, SIGINT\| CLI` | `MAIN -->\|spawn, chat and skill turns, stop interrupt on stdin\| CLI` | Retro names `:267`. Edge label must not name `SIGINT` as the stop path. Keep the label free of parentheses so the mermaid parses. | bmad-architecture |
| 19 | `ARCHITECTURE-SPINE.md:324` (Deferred, Agent SDK) | "...replace signals and flags, and AD-18's open stop risk may resolve itself." | "...replace the hand-written control messages, signals and flags." | AD-18's stop risk is closed. Not on the retro's list; found while sweeping. | bmad-architecture |
| 20 | `ARCHITECTURE-SPINE.md:345` (Open Items) | "**Stop semantics under AD-18** — whether `SIGINT` can halt a skill turn without ending the session. Unverified; the cheapest spike ..." | Delete the bullet (the answer is in AD-18, row 17). | Retro cited `:338`; it is `:345` now. The other two open items remain. | bmad-architecture |
| 21 | `EXPERIENCE.md:99` (microcopy table) | `\| \`stop · ends this conversation\` \| a modal asking \`Are you sure?\` \|` | `\| \`stop\` \| a modal asking \`Are you sure?\` \|` | The string no longer ships. | bmad-ux |
| 22 | `EXPERIENCE.md:366-379` ("The stop-cost fork — both branches", paragraph 370, table 372-377, paragraph 379) | "Whether `SIGINT` can halt a skill turn without ending the persona's session is **unverified** ..." and the Branch A / Branch B table | Replacement section in 5.16. | Retro names `:370`. The fork is resolved; keep the binding stance (state any cost, never in a modal). | bmad-ux |
| 23 | `EXPERIENCE.md:381` | "A subprocess exits with `rc=0` within **~250 ms** of `SIGINT`. **[ASSUMPTION]** — there is therefore no "stopping..." transitional state ..." | Replacement in 5.16 (second paragraph). | Retro names `:381`. The `[ASSUMPTION]` is now measured and the basis differs. | bmad-ux |
| 24 | `EXPERIENCE.md:497` (focus table, card expand) | "Focus must not land on a control whose cost may be the session" | "Focus must not land on a control that interrupts a running turn" | Same as row 12. | bmad-ux |
| 25 | `epic-1-context.md:62`; `epic-2-context.md` (whole) | `:62` "**1.1 (the SIGINT spike) runs first** ... Its outcome decides whether a later requirement ... is valid at all, and which copy the stop control ships." `epic-2-context.md:50` "Stop semantics (resolved in Epic 1) ... Earlier planning text asserting `SIGINT` as the stop mechanism is stale." | **Not hand-edited.** Regenerate both from the corrected planning docs (`compile-epic-context`, per the cache header) after rows 1-24, 26-37 are applied. | Compiled caches. Retro cited `epic-1-context.md:62`; it is `:62` (it was `:86` in the Story 1.1 triage). `epic-2-context.md:50` is already right but its "stale" remark becomes obsolete. | regenerate (compile-epic-context); no planning skill |

### 4.B Orphan card and stop controls (F20)

| # | File : current line | Current text (excerpt) | Proposed | Rationale | Owning skill |
|---|---|---|---|---|---|
| 26 | `epics.md:1639` (Story 3.7, Implements) | "**Implements:** FR83, FR84, FR85, FR86" | "**Implements:** FR83, FR84, FR85, FR86 · FR6 (card and stop clauses, carried from Story 2.11) · FR100 (dead-card clause, carried from Story 2.7)" | Makes the carry visible where a reader checks coverage. | bmad-create-epics-and-stories |
| 27 | `epics.md` after `:1664` (Story 3.7, new ACs) | (none) | Orphan ACs, text in 6.B. | F20. Why Story 3.7: see 6.A. | bmad-create-epics-and-stories |
| 28 | `epics.md` after the orphan ACs (Story 3.7, new AC) | (none) | Relaunch AC, text in 6.B (last block). | F18: the "dead card" clause of Story 2.7 cannot fail until a card exists. Story 3.7 owns the stop control whose absence the clause requires. | bmad-create-epics-and-stories |
| 29 | `epics.md:286` (FR Coverage Map, FR6) | "\| FR6 \| Epic 2 \| Orphaned live session keeps transcript, card, stop and close \|" | "\| FR6 \| Epic 2 \| Orphaned live session keeps transcript and working close (the card and stop clauses are verified in Epic 3, Story 3.7) \|" | FR6's status. Keeps "every FR maps to exactly one epic" (`epics.md:277`) by the same convention as FR5 (`:285`, "the live-session clause is verified in Epic 2"), FR40 (`:320`) and FR49 (`:329`). The FR6 requirement text at `:36` is unchanged. FR counts at `:387` unchanged. | bmad-create-epics-and-stories |
| 30 | `epics.md:1366-1368` (Story 2.11, done) | "**Given** an agent vanishes from the install while its session is running **Then** that session keeps its transcript, its document card, and **working stop and close controls** until the user closes it" | **Amendment note** under the story. Text in 6.C-note (below the orphan ACs). ACs untouched. | `spec-2-11` frontmatter `deferred` and Design Notes: no card or stop existed to keep or hide; the card and stop clauses were carried to Epic 3. | bmad-create-epics-and-stories |

### 4.C Reconciliations

| # | File : current line | Current text (excerpt) | Proposed | Rationale | Owning skill |
|---|---|---|---|---|---|
| 31 | `epics.md:164` (FR98) | "...strictly serialised — at most one turn in flight, chat or run — so a `result` row always belongs to the turn the harness is waiting on." | Text in 6.C. | F1. Same premise as Story 2.5. | bmad-create-epics-and-stories |
| 32 | `ARCHITECTURE-SPINE.md:148` (AD-11 rule) | "...queued and sent when that turn completes, so a `result` row always belongs to the turn the harness is waiting on." | Text in 6.C. Architect aligns with the pending-turn model chosen in retro item 1. | F1. | bmad-architecture |
| 33 | `epics.md:1200-1202` (Story 2.5, done) | "**Then** at most one turn — chat or run — is in flight at a time, so a `result` row always belongs to the turn the harness is waiting on" | **Amendment note.** Replacement criterion in 6.C. | F1. Contradicted by `fixtures/runs/README.md:21` and `fast-path-opus.jsonl` (14 main-thread `result` rows against 3 sends). | bmad-create-epics-and-stories |
| 34 | `epics.md:49` (FR16) | "The conversation transcript, session state and install model live in Electron main and are persisted per project under `userData`." | Text in 6.C. | F18. Source of the Story 2.7 wording. | bmad-create-epics-and-stories |
| 35 | `ARCHITECTURE-SPINE.md:124` (AD-7 rule) | "The conversation transcript, session state and install model live in main and are persisted per project under `userData`." | Text in 6.C. | F18. Not on the retro's list; same wording as FR16. | bmad-architecture |
| 36 | `epics.md:1260-1262` and `:1270` (Story 2.7, done) | "**Then** the conversation transcript, session state and install model live in Electron main and are persisted per project under `userData`, keyed by project path" and "every card renders in its dead terminal state with **no elapsed time ticking and no stop control**" | **Amendment note.** Replacement criterion in 6.C. | F18; `spec-2-7` Design Notes (FR100 and NFR2 narrow it). The dead-card clause is carried to Story 3.7 (row 28). | bmad-create-epics-and-stories |
| 37 | `epics.md:1318-1320` (Story 2.9, done) | "**Given** a handoff occurs **Then** a sysline lands in the transcript reading `handed off · <from> → <to> · picking up from <files>`, naming the artifacts the previous persona wrote during this conversation, in write order" | **Amendment note.** Replacement criteria in 6.C. | F6 (a, b, c and the reload gap). | bmad-create-epics-and-stories |

### 4.D Flagged overlap, deliberately not edited

- **NFR6 and AD-4 (retro item 8, Sherif's decision).** `epics.md:180` (NFR6) and `ARCHITECTURE-SPINE.md:106` (AD-4) both list the corpus scenario "a `SIGINT` mid-write". `epics.md:1043` and `:1700` list it as well (rows 11 and 16 handle those two). Whoever resolves item 8 should change that phrase in the same pass to "an interrupt mid-write (in-band and `SIGINT`)" so NFR6 is not reopened a second time. This draft does not touch the raw-log wording.
- **Story 2.12 ruling (F19, Sherif's decision).** Lines `SPEC.md:62`, `epics.md` 111, 428, 1024, 1299, 1308, `ARCHITECTURE-SPINE.md:124` (AD-7) and `EXPERIENCE.md:116, 567` are untouched. Row 35 edits only the persistence wording in AD-7, not the continuity sentences in it. The Story 2.9 amendment keeps the line "never claims that context continues" verbatim; its wording may change after the ruling.
- **Queue ownership (F5, Sherif's decision).** Story 2.7's "nothing is lost" AC and AD-7's "main owns all durable state" are untouched. Row 36 narrows only the first criterion (what is persisted).
- **Same-premise text outside `planning-artifacts/`:** `specs/spec-bmad-visual-harness/execution-model.md:127-128` ("terminates the turn the harness is waiting on") repeats the F1 premise. It is a `bmad-spec` file; flag it when rows 31-33 are applied.
- **Historical records, left as is:** `.memlog.md` files, `.working/extract-*.md`, `reviews/review-*.md` under the architecture and UX folders mention `SIGINT` as history. They are not authoritative.

---

## 5. Exact text: stop mechanism (rows 1-24)

**5.1 FR83 (`epics.md:143`)**

```
- **FR83:** A stop control is present on **both** the full card head (beside elapsed run time) and the collapsed line, and dispatches `run.stop(runId)`, which writes one in-band interrupt request to the run's session on stdin — `{"type":"control_request","request_id":"<id>","request":{"subtype":"interrupt"}}` — and so ends the turn, not the session. `SIGINT` ends a session and is never the stop mechanism. (`execution-model.md` *Stop and failure*; `_bmad/spikes/spike-stop-semantics.md`.)
```

**5.2 FR84 (`epics.md:144`)**

```
- **FR84:** Stopping costs the turn, not the conversation, so the control reads a plain `stop` on the full card head and on the collapsed line, with no confirmation. If stopping ever costs more than the turn, that cost is stated **on the control, before it is pressed**, never in a modal and never hidden. [If the interrupt is not acknowledged — no `control_response`, or one whose `subtype` is not `success` — the harness falls back to ending the session and states that in its own register.]
```

The bracketed sentence depends on question 1.

**5.3 FR87 (`epics.md:150`)**

```
- **FR87:** A `result` row arrives **per turn**, not once per process, and ends *a* turn — not necessarily the one the harness sent, because a session also takes turns nobody sent. `subtype: "error_during_execution"` with `is_error: true` marks a turn stopped or failed; its absence marks it finished. Those two fields are the whole discriminator: `stop_reason` is not tested, because it is `null` on every interrupted turn. Process exit code is not the signal.
```

Question 5 concerns `error_max_budget_usd`.

**5.4 FR90 (`epics.md:153`)**

```
- **FR90:** The persona picks up a stopped or failed run in the conversation, in its own voice: what got done, what broke, and an offer to resume. The harness never speaks in a persona's name. A stop leaves the session alive, so this holds for stops as well as failures. **Where the session itself has ended with the run** (the process exited, or the interrupt fell back to ending the session) there is no persona left to deliver it, and the harness states the outcome in its own register and does not fabricate a persona voice.
```

If Sherif answers question 1 with "strike", delete the last sentence and the fallback sentence in 5.2.

**5.5 Additional Requirements, spike item 1 (`epics.md:212`)**

```
  1. **Stop semantics** — *settled in Epic 1, Story 1.1.* `SIGINT` ends the persona session; an in-band interrupt written to the session's stdin halts one turn and keeps the session, so FR90 stands for stops (`_bmad/spikes/spike-stop-semantics.md`).
```

**5.6 Epic 1 note (`epics.md:422`)**

```
- **The stop-semantics spike ran at the front of this epic, ahead of the scaffold.** It was one subprocess, one turn and a stop attempted two ways, and it decided whether FR90 is a valid requirement at all. *Settled (Story 1.1):* `SIGINT` ends the session; an in-band interrupt on the session's stdin halts the turn and keeps it, so FR90 stands for stops. It had no dependency on anything the harness builds, so nothing was gained by holding it until Epic 2.
```

**5.7 Epic 2 note (`epics.md:440`)**

```
- **The stop-semantics spike moved to the front of Epic 1 and is settled.** This epic consumes its answer: a stop (the in-band interrupt) ends the turn and leaves the session, so the session lifecycle here has no stop-ends-the-session case. A session ends only through `session.close`, `conversation.end` or process exit.
```

**5.8 Epic 3 note (`epics.md:462`)**

```
- **The stop spike's outcome reaches further than the control's copy.** Settled in Epic 1: a stop keeps the session, so FR90's "the persona explains it in conversation" holds for stops as well as failures, and FR89's deliberate conflation of `stopped` and `failed` on the tile covers two outcomes with the same recoverability whenever the session survives. The failure stories must still resolve the case where the session ends with the run (process exit, or the interrupt's `SIGINT` fallback), where no persona remains.
```

**5.9 Story 1.1 amendment note (insert after `epics.md:521`)**

```
*Amended after close (Story 1.1 outcome, `_bmad/spikes/spike-stop-semantics.md`, 2026-09-25; recorded by the pre-Epic 3 reconciliation).* The branches above were framed as a property of `SIGINT`. Measured: `SIGINT` is Branch B (4 of 4: a `result` row about 16ms after the signal, then exit `rc=0` at 217-390ms, no next turn possible). An in-band `control_request` with `subtype: "interrupt"` on the session's stdin is Branch A (4 of 4: `result` in 3-6ms, process alive, next turn answered in persona). So `run.stop` uses the in-band interrupt, FR84 ships a plain `stop`, and FR90 stands as written for stops. `SIGINT` is reserved for ending a session. The ~250ms figure is corrected to under 400ms and no longer bears on stop. The criteria above are left as written; this note records which one fired.
```

**5.10 Story 2.1 amendment note (insert after `epics.md:1058`, before "Carried in from the Epic 1 retrospective")**

```
*Amended after close (Story 1.1 outcome; `fixtures/runs/README.md`).* The "`SIGINT` sent mid-write" scenario is recorded as two files: `interrupt-sigint` (the session ends) and `interrupt-inband` (the session survives). The in-band recording is the corpus for the stop mechanism FR83 now names; the `SIGINT` one is the session-ending path.
```

**5.11 Story 3.7 ACs (`epics.md:1643-1657`). Replace those four blocks with the following. The blocks at `:1659-1664` (byte-for-byte; tab stop) stay as they are.**

```
**Given** a run in flight
**Then** a stop control is present on **both** the full card head, beside the elapsed time, and the collapsed line
**And** activating it dispatches `run.stop(runId)`, which writes one in-band interrupt request (`{"type":"control_request","request_id":"<id>","request":{"subtype":"interrupt"}}`) to that session's stdin — never `SIGINT`, which ends the session (`execution-model.md` *Stop and failure*; `_bmad/spikes/spike-stop-semantics.md`).

**Given** the branch settled by story 1.1 — the in-band interrupt halts the turn and keeps the session
**Then** the control reads `stop` with no confirmation and no cost copy, on the full card head and on the collapsed line alike, because stopping costs the turn and not the conversation
**And** the session stays open, the next turn is accepted, and the persona answers it in its own voice.

**Given** the interrupt is not acknowledged — no `control_response`, or one whose `subtype` is not `success`
**Then** the harness falls back to ending the session, and states that in the transcript in its own register, never in a persona's name
**And** that cost is surfaced to the user rather than hidden. [copy for bmad-ux; pending question 1]

**Given** stopping costs only the turn
**Then** no confirmation dialog is shown and no cost is printed on the control
**And** if a later change makes a stop cost more than the turn, the cost sits **on the control, before it is pressed** — never in a modal, which would be the harness arbitrating and would hide the cost until the user had already committed to looking.

**Given** the interrupt is acknowledged
**Then** the turn's `result` row arrives within milliseconds (3-6ms measured, n=4) and the card reaches its terminal state on that row, not on the `control_response`
**And** there is no "stopping…" transitional state.
```

**5.12 Story 3.8, first AC (`epics.md:1676-1679`)**

```
**Given** a turn ends
**Then** its terminal state is read from the `result` row that arrives **per turn**, not once per process, and a `result` row ends *a* turn, not necessarily the one the harness sent
**And** `subtype: "error_during_execution"` with `is_error: true` marks it stopped or failed, its absence marks it finished, and `stop_reason` is never tested because it is `null` on every interrupted turn
**And** the process exit code is never used as the signal, because a session outlives every turn in it.
```

**5.13 Story 3.8, session-ended AC (`epics.md:1697-1698`)**

```
**Given** the session ended with the run — the process exited, or the stop fell back to ending the session
**Then** no persona remains to deliver that explanation, so the harness states the outcome in its own register and never fabricates a persona voice.
```

The preceding AC at `:1694-1695` ("Given the session survives the failure") should read "Given the session survives the stop or the failure". That is a four-word insertion.

**5.14 Story 3.8, corpus AC (`epics.md:1700-1702`)**

```
**Given** the corpus fixtures `interrupt-inband.jsonl` (the stop path; the session survives), `interrupt-sigint.jsonl` (the session-ending path) and a reviewer-gate failure
**When** they are replayed
**Then** each terminal path renders correctly without a live run.
```

The reviewer-gate fixture in the corpus is `reviewer-gate-failure-induced.jsonl` and is induced, not natural (F22, `fixtures/runs/README.md:16`). The AC does not claim otherwise.

**5.15 `ARCHITECTURE-SPINE.md:190` (AD-18). Three splices within the one line.**

1. Replace "terminates the turn the harness is waiting on (AD-11 guarantees there is exactly one)" with:
   `ends *a* turn — not necessarily the one the harness sent, since a session also takes turns nobody sent (AD-11)`
2. Replace "`subtype: "error_during_execution"` with `is_error: true` and a `stop_reason` marks stopped or failed, its absence marks finished" with:
   `subtype: "error_during_execution"` with `is_error: true` marks stopped or failed, its absence marks finished; do not test `stop_reason`, which is `null` on every interrupted turn`
3. Replace the **Open risk** sentence ("**Open risk:** `SIGINT` is known to exit a subprocess `rc=0` in ~250ms ... never hidden.") with:

```
**Stop (settled, Story 1.1):** `run.stop` writes one in-band `control_request` with `subtype: "interrupt"` to the session's stdin; the CLI answers `control_response` `success` and ends the turn with a `result` row within milliseconds (3-6ms, n=4), the process stays alive and the next turn is accepted. `SIGINT` exits the subprocess `rc=0` in under 400ms (217-390ms, n=4) and ends the session, so it is reserved for ending a session and never used to stop a run. If the interrupt is not acknowledged, falling back to `SIGINT` costs the session, and that cost is surfaced to the user, never hidden. The control protocol is not documented in `claude --help`; a future CLI release could change it (`_bmad/spikes/spike-stop-semantics.md`, caveat 2).
```

Also bump the front-matter `updated:` date when applied.

**5.16 `EXPERIENCE.md:366-381`. Replace the section from the heading through the `~250 ms` paragraph with:**

```
### Stopping costs the turn, not the conversation

Settled by Story 1.1 (`_bmad/spikes/spike-stop-semantics.md`; `execution-model.md` *Stop and failure*): an in-band interrupt written to the session's stdin halts the turn and keeps the session, while `SIGINT` ends it and is reserved for ending a session. The binding stance holds regardless: **if stopping ever costs more than the turn, the trade is stated to the user, never hidden.**

| | Stop (interrupt acknowledged) | Interrupt not acknowledged [pending question 1] |
|---|---|---|
| condition | the run ends, the persona stays to explain | the harness falls back to ending the session |
| full card head | a plain control reading `stop`. **No confirmation.** | the same `stop`; the outcome is stated after the fact in the harness's own register |
| collapsed line | `stop` | `stop` |
| after pressing | run terminates; the persona delivers what got done and what broke | the session ends; the transcript remains; no persona voice |

**In neither case is the cost in a modal.** A modal is the harness arbitrating, which AD-12 forbids as a posture, and it hides the cost until the user has already committed to looking. A cost, where one exists, sits **on the control, before it is pressed** — the only placement where it can change the decision.

The turn's `result` row arrives within milliseconds of the interrupt (3-6ms measured, n=4), so there is no "stopping…" transitional state; the card reaches its terminal state directly on that row. A transitional state at that duration would be a spinner with a 6ms life.
```

---

## 6. Exact text: orphan ACs (B) and reconciliations (C)

### 6.A Why Story 3.7

Candidates: 3.1 (card is born), 3.5 (collapsed card), 3.7 (stop), 3.8 (terminal states).
- **Story 3.7 is chosen.** The orphan clause that cannot be verified today is "working stop controls", and 3.7 is the only story that builds `run.stop` end to end. It is also the last of the card-and-stop stories that depends on the card (3.1), the collapsed form (3.5) and the rail annotation (3.6), so the orphan case can be exercised against finished parts. Its `Implements` line already lists FR83, and the orphan's stop is FR83's third place to appear.
- 3.5 was the runner-up, since an orphan can never be the current persona and so its card is always collapsed. It is rejected as the home because it owns the form of the card, not the stop's behaviour, and putting the whole carry there would leave the stop control unverified for orphans. Row 28 and the AC below cross-reference the collapsed form instead.
- 3.1 is a deliberately thin slice and should not take a lifecycle edge case. 3.8 is about how a run ends, not about which session it belongs to.

### 6.B Story 3.7 new ACs (rows 27 and 28). Insert after the "Given the stop control / Then it is its own tab stop" block at `epics.md:1663-1664`.

```
**Given** a run is in flight in a session whose agent then vanishes from the install (Story 2.11's orphan)
**When** re-resolution runs
**Then** the run is untouched: it keeps streaming, its card stays in the conversation in time order, and no tile is created or restored for it
**And** the card renders in the collapsed one-line form, because an orphan can never be the current persona (the current persona is derived from the roster alone), and it expands on click like any collapsed card.

**Given** an orphaned session's card
**Then** its stop control is present, is its own tab stop, and carries the shared focus treatment
**And** activating it dispatches `run.stop(runId)` to that run's own session, found by the run and session ids and never through the roster, so a stop works for a persona the install no longer lists.

**Given** the stop is activated on an orphaned run
**Then** the turn halts exactly as it does for a rostered persona (in-band interrupt, `result` within milliseconds, no "stopping…" state), the file is left byte-for-byte as written, and the session stays open
**And** the orphan's header and its `close session` control from Story 2.11 remain until the user closes the session — a stop never closes an orphan, and no session is closed silently.

**Given** an orphan with a run in flight
**When** the user activates `close session`
**Then** the session ends, the card reaches a terminal state directly rather than continuing to read as live, and the file is left as written
**And** the transcript, including the card, stays.

**Given** an agent returns to the install while its orphaned run is in flight
**Then** its tile returns, the same session and the same card carry on, and the card follows the ordinary full-or-collapsed rule again.

**Given** the roster changes while any run is in flight — an agent added, removed or edited
**Then** no run, card or stop control changes except through the orphan rules above
**And** this is the live-run half of FR5's "never touches a live session", which Epic 2 could verify only against chat turns.

**Given** the application is quit and relaunched while the transcript holds a run's card
**Then** the card renders in its dead terminal state with no elapsed time ticking and no stop control, every persona reads `idle`, and nothing is offered to resume
**And** this is the relaunch clause of Story 2.7, which could not fail while no card existed.
```

Note for the owner: the second block's "close session stays reachable until the user closes the session" is only true if the shell stays mounted when the last agent vanishes. Today it does not (F12(b); `spec-2-11` `deferred`). That decision is Sherif and UX (retro item 15b); see question 6.

### 6.C Reconciliations

**Story 2.11 amendment note (row 30; insert after `epics.md:1371`)**

```
*Amended after close (Epic 2 retrospective F20; `spec-2-11` deferral).* The second criterion's "document card" and "working stop ... controls" could not be built or verified in this epic, because a card is born by `run:started` and a stop is `run.stop(runId)`, both Epic 3. What this story delivers and verifies is the transcript, the absence of a tile, and the working `close session` control. The card and stop clauses, and the live-run half of "never touches a live session", are carried to Story 3.7 and FR6's coverage row says so. The criteria above are left as written.
```

**Row 31, FR98 (`epics.md:164`)**

```
- **FR98:** Turns the harness sends are strictly serialised — at most one in flight, chat or run — so a queued message is sent only after the turn before it is over. A session can also take turns nobody sent (a background subagent finishing wakes the main thread and produces its own `result` row), so a `result` row ends *a* turn and not necessarily the one the harness sent. Different sessions run concurrently.
```

**Row 32, AD-11 (`ARCHITECTURE-SPINE.md:148`). Replace the clause "so a `result` row always belongs to the turn the harness is waiting on" with:**

```
A session can also take turns nobody sent (background subagents finishing wake the main thread), so a `result` row ends *a* turn and not necessarily the one the harness sent (`fixtures/runs/README.md`, "A session takes turns nobody sent"); whether a turn the harness sent is over is decided by the harness's own pending-turn bookkeeping, not by counting `result` rows [architect to align with the model chosen in Epic 2 retro action item 1].
```

**Row 33, Story 2.5 amendment (insert after `epics.md:1220`, the story's last AC)**

```
*Amended after close (Epic 2 retrospective F1; `fixtures/runs/README.md`, "A session takes turns nobody sent").* The first criterion's clause "so a `result` row always belongs to the turn the harness is waiting on" is superseded. The harness serialises the turns it sends, but a session also takes turns nobody sent, so a main-thread `result` row ends *a* turn and not necessarily the one the harness sent (`fast-path-opus.jsonl` holds 14 main-thread `result` rows against 3 sends). The criterion now reads:

**Given** turns within a session are strictly serialised by the harness
**Then** at most one turn the harness sent — chat or run — is in flight at a time, and the next is sent only when that turn is over
**And** a `result` row for a turn nobody sent neither ends the turn the harness sent, nor frees the session for a queued message, nor sets the persona idle while the sent turn is still in flight
**And** different sessions run concurrently without interfering.

The same premise is removed from FR98, AD-11, AD-18 and FR87.
```

The new criterion states the observable behaviour only. The mechanism is the pending-turn model of retro action item 1.

**Row 34, FR16 (`epics.md:49`)**

```
- **FR16:** The conversation transcript, session state and install model live in Electron main. The transcript is persisted per project under `userData`; session state and the install model are not — sessions are not held across restarts (FR100) and the install model is re-derived from disk on each launch (NFR2). The renderer is a pure projection: a window reload loses nothing, **including a run in flight**, because the card is a main-held projection re-emitted on reconnect rather than reconstructed from renderer memory.
```

The "loses nothing" sentence is unchanged and still subject to Sherif's queue ruling (F5).

**Row 35, AD-7 (`ARCHITECTURE-SPINE.md:124`). Replace the first sentence of the rule with:**

```
The conversation transcript, session state and install model live in main; the transcript is persisted per project under `userData`, while session state and the install model are not (sessions are not held across restarts, and the install model is re-derived from disk — AD-1, AD-18).
```

The rest of the rule, including the continuity sentences, is untouched.

**Row 36, Story 2.7 amendment (insert after `epics.md:1273`, the story's last AC)**

```
*Amended after close (Epic 2 retrospective F18; `spec-2-7` Design Notes, FR100, NFR2).* The first criterion is superseded. Only the transcript is persisted; session state and the install model live in main and are not written. The criterion now reads:

**Given** durable state
**Then** the conversation transcript lives in Electron main and is persisted per project under `userData`, keyed by project path
**And** session state and the install model live in main but are not persisted — sessions are not held across restarts (FR100) and the install model is re-derived from disk on each launch (NFR2)
**And** no harness byte is ever written inside the project root.

The relaunch criterion's "dead terminal state ... no stop control" clause held vacuously, since no card exists before Epic 3. It is carried to Story 3.7, where it can fail. The reload criterion's "nothing is lost" is not amended here; it awaits the ruling on who owns the queue (F5).
```

**Row 37, Story 2.9 amendment (insert after `epics.md:1324`, the story's last AC)**

```
*Amended after close (Epic 2 retrospective F6; `spec-2-9` Intent Contract).* The fourth criterion ("Given a handoff occurs / Then a sysline lands ...") says when a sysline lands without saying when it does not, who is "from", or what "the artifacts the previous persona wrote" can truthfully mean. It is superseded by:

**Given** the user moves from one persona to another in a conversation that already has turns
**When** the tile is activated, or `@<name>` resolves to a persona other than the current one
**Then** one sysline lands reading `handed off · <from> → <to> · picking up from <files>`
**And** `<from>` and `<to>` are fixed by the order of the user's actions, so two quick activations are recorded in click order whichever session finishes opening first.

**Given** the sysline's file list
**Then** it names the project-relative paths the previous persona wrote during this conversation, in write order, each once, and names a path only after the write succeeded
**And** it names only writes the harness can see as a `Write` or `Edit` call, so files written through a shell command (a heredoc, `memlog.py`) are not named [or: are named — question 3]
**And** with no visible writes it reads `handed off · <from> → <to>` with no file clause.

**Given** the transcript is empty, or the current tile is re-activated, or the open fails, or [`<from>` has said nothing since it was last opened — question 2]
**Then** no sysline is written, because nothing was handed off.

**Given** the window has reloaded or the app has relaunched
**Then** the first switch writes no sysline, because main does not hold who was last opened across either [or: writes one from the persona the transcript last shows speaking — question 4].

**And** every sysline never claims that context continues, which would be false — a handoff starts a new session and continuity is carried by the artifacts on disk.
```

Bracketed alternatives are the retro's open choices in action item 5 and are listed in section 7.

---

## 7. Residual questions for Sherif

Plain asks only he can answer. Numbering is stable; the rows above refer to it.

1. **Fallback when the interrupt is not acknowledged.** `execution-model.md` says the harness then falls back to `SIGINT`, which ends the session, and the cost is surfaced. Keep a narrowed FR90 carve-out, the fallback AC in Story 3.7 and the fallback clause in FR84 (as drafted, bracketed), or strike every Branch B remnant and treat the fallback as out of v1? If kept, the on-screen line is a `bmad-ux` copy decision.
2. **Sysline when returning to a quiet persona (F6b).** Should a sysline be written only if `<from>` has spoken since it was last opened? Browsing A to B to A currently writes two.
3. **Sysline and shell writes (F6c).** Should the file list try to name files written by Bash heredoc or `memlog.py` (the spike saw Bash writes in 6 of 7 trials), or state the limit as drafted?
4. **Sysline after reload (F6d).** Keep "first switch after a reload or relaunch writes none", or persist or derive the last-opened persona so it writes one?
5. **Failure subtypes in FR87.** `fixtures/runs/README.md:24` shows `error_max_budget_usd` with `is_error: true` and no `stop_reason`. FR87 and the draft name only `error_during_execution`. Keep that, or widen the rule to any `is_error: true` result?
6. **Last agent removed (F12b).** The AC "close session stays reachable until the user closes it" (Story 3.7, orphan block 3) is false today, because the shell unmounts when no agents resolve. Make it binding (UX fix required) or record it as an accepted limit? This is retro item 15b (Sherif and UX).
7. **Amendment form.** Confirm amendment notes in `epics.md` (section 3.1) for the six done stories, with in-place edits for 3.5, 3.7 and 3.8, rather than a change-log entry.

## 8. Implementation handoff

- **PM (John), via `bmad-create-epics-and-stories`:** rows 1-16, 26-31, 33, 34, 36, 37. Apply in `epics.md` in one pass.
- **Architect (Winston), via `bmad-architecture`:** rows 17-20, 32, 35, and the `updated:` front-matter date.
- **UX (Sally), via `bmad-ux`:** rows 21-24. Needed because `EXPERIENCE.md` is her single-writer file.
- **Dev, after the above:** regenerate `epic-1-context.md` and `epic-2-context.md` (row 25); close sprint keys `epic-1-retro-item-6-correct-the-stop-mechanism-everywhere-st` and `epic-2-retro-item-28-before-epic-3-finish-epic-1-item-6-fr83` with Sherif's confirmation; close the two Story 1.1 entries in `deferred-work.md` that this pass settles (the stop-mechanism amendment entry; the unmeasured stop scenarios stay open for Story 3.7); optionally flag `execution-model.md:127-128` to `bmad-spec`.
- **Order:** architecture and UX first or in parallel, then `epics.md`, so its edits can cite the corrected spine. Rows 33 and 37 can be applied before remediation items 1 and 5 land because they state observable behaviour, but bracketed choices should be settled first.

**Success criteria** (verification after application):
- `grep -n -i sigint _bmad/planning-artifacts/epics.md` returns only: NFR6 (`:180`, item 8's), the Story 1.1 and 2.1 amendment notes, the corrected FR83/FR84/FR87/FR90 sentences that say `SIGINT` ends a session, and the Story 3.7 and 3.8 fallback and corpus ACs. No line states `SIGINT` as the stop mechanism.
- `grep -n -E "Branch [AB]" _bmad/planning-artifacts/epics.md` returns only the Story 1.1 ACs and its amendment note.
- `grep -n -i -E "stop_reason" _bmad/planning-artifacts/epics.md` returns no line that makes `stop_reason` part of the discriminator.
- `grep -n -i orphan _bmad/planning-artifacts/epics.md` finds an Epic 3 hit in Story 3.7.
- `grep -n "always belongs to the turn" -r _bmad/planning-artifacts` returns nothing outside the amendment notes' quoted text.
- `ARCHITECTURE-SPINE.md` and `EXPERIENCE.md` contain no "unverified" claim about stop semantics and no `~250` figure.
- `epic-1-context.md` and `epic-2-context.md` carry no text that contradicts the corrected planning docs.

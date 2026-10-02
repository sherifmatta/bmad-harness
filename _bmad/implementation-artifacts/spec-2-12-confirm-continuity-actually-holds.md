---
title: 'Confirm continuity actually holds'
type: 'chore'
created: '2026-10-02'
status: 'done'
baseline_revision: '1fd3628aa8010567efe43cbcbfac26f930f7f3b8'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Gap: a decision reached in conversation with the previous persona, outside a skill workflow, is not on disk when the next persona opens, so the next persona presents as a restart. Candidates to weigh, not built: the previous persona closes a turn by writing the decision to its memlog (acts on the gap; a bmad-agent-* skill or bmad-customize change; untested); the harness hands the next persona the sysline file list as its first user turn (closes nothing for this case, since the list is empty, and B found written files itself 7 of 7); a harness-written handoff note on disk (conflicts with SPEC.md:85 and the rule that the harness never authors persona words).
    evidence: |-
      _bmad/spikes/spike-handoff-continuity.md, Pass 2: 0 of 3 valid trials recovered the decision; the previous persona wrote no file in any, offered or falsely claimed to record it, and every reply from the next persona read as a restart. Per-trial facts in _bmad/spikes/spike-handoff-continuity-evidence/.
    location: >-
      .claude/skills/bmad-agent-analyst, .claude/skills/bmad-agent-pm (the bmad-agent-* skills)
    severity: high
  - summary: >-
      Gap, from reading the code and not run: the sysline's `picking up from` list is built from Write and Edit tool blocks only and drops `.memlog.md`, so after a persona writes through Bash heredocs (6 of 7 Pass 1 trials) the sysline names no files and looks the same as after nothing was written.
    evidence: |-
      src/main/fold/written-paths.ts (foldWrittenPaths) and WRITE_FIELDS = { Write, Edit } at src/main/fold/route-frame.ts:71; fixtures/runs/README.md already records the Write-versus-Bash split for doc:prose in Epic 3. Story 2.9's behaviour was not changed here.
    location: >-
      src/main/fold/written-paths.ts
    severity: medium
  - summary: >-
      Planning lines that now disagree with the finding, to be amended by the owning skill, not by hand. bmad-spec: SPEC.md:62; spec memlog line 91 ("holds unchanged", superseded by the appended decision) and line 93 (answered). bmad-create-epics-and-stories: epics.md FR60 (line 111), Story 2.9 AC (line 1308), lines 428, 1024, 1299. bmad-architecture: ARCHITECTURE-SPINE.md AD-7 (line 124); architecture memlog line 17. bmad-ux: EXPERIENCE.md lines 116 and 567.
    evidence: |-
      Each says "no handoff presents as a restart" without the qualification that it holds after written work and fails for a chat-only decision; table with the exact lines in _bmad/spikes/spike-handoff-continuity.md under "Planning lines that now disagree".
    location: >-
      _bmad/specs/spec-bmad-visual-harness/SPEC.md, _bmad/planning-artifacts/epics.md, _bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md, _bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md
    severity: medium
  - summary: >-
      One scoring ambiguity decides between "holds only for what was written down" and "holds only in appearance": whether "restates >=3 planted facts" counts the facts the next persona writes into its own workspace log or only what it says in chat. Counted in chat or its own writes the three counted trials score 4, 4 and 2 of 4; in chat alone 2, 2 and 2. The document uses the former and says so; the owner may rule otherwise.
    evidence: |-
      _bmad/spikes/spike-handoff-continuity.md, "What the verdict turns on"; rubric interpretations in spike-handoff-continuity-evidence/rubric.fixed.json.
    location: >-
      _bmad/spikes/spike-handoff-continuity.md
    severity: medium
  - summary: >-
      Not tried: a handoff to a persona other than John, a project with many artifacts, a populated docs/, an artifact written by plain chat rather than a skill workflow, a run in the real app, or any model other than the default.
    evidence: |-
      Every counted trial is Mary to John on a one-folder scratch project with claude-opus-5[1m], 3 counted Pass 1 and 2 counted Pass 2 trials.
    location: >-
      _bmad/spikes/spike-handoff-continuity.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 2.12 (epics.md "Confirm continuity actually holds", the second of the three open items before the build commits). CAP-8 / FR60 promise that no handoff presents as a restart, yet a handoff starts a *new* `claude` session: the receiving persona inherits no context, only whatever the previous persona left on disk (AD-7). Epic 2 has now built that model (Story 2.9) but nobody has observed whether a persona can actually pick up work from artifacts alone, so the claim is unconfirmed.

**Approach:** A throwaway spike, as Story 1.1 was. Drive two real sessions in a scratch project: persona A works a planning artifact into existence, then a fresh persona B session, given nothing but a plain request to pick up the work, is observed. Judge it against a rubric fixed below before any run, and record a plain verdict (holds in substance / holds only for what was written down / holds only in appearance) against CAP-8's "no handoff presents as a restart", with the remedy for any gap. Throw the driver away.

## Boundaries & Constraints

**Always:**
- Spike code lives only in the session scratchpad; no executable enters the repo. Runs target a throwaway scratch project (copy of this repo's `.claude/skills/` and the `_bmad/` pieces the personas need), never this repo's artifacts.
- Session invocation is the harness's: `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`, `/bmad-agent-<x>` as the first stdin turn (the `scripts/record-run.mjs` recorder is the reference for flags and `--permission-mode bypassPermissions`). Cap each session with `--max-budget-usd`.
- The receiving turn is exactly what the harness delivers on a handoff: a new session opened with `/bmad-agent-<B>`, then one user turn, the fixed text `pick up the work from here`. No path, summary, transcript, `--resume`/`--continue`/`--session-id`, or any text from A reaches B's process.
- Control the non-artifact channels: disable the CLI's auto-memory for these runs and report which memory files, anywhere, were written by A or read by B. Anything inside the scratch project (including a persona sidecar) counts as an artifact and is listed as one.
- **Rubric, fixed before any run (do not edit after):** A's artifact carries ≥4 planted, checkable facts (a name, a constraint, a numeric limit, a decision with its reason). A trial **passes** only if B, unprompted: (1) opens A's artifact without being told its path, (2) restates ≥3 planted facts accurately, (3) proposes or begins a next step that builds on them rather than asking where to start. A trial whose B opens the artifact but restates fewer than 3 facts, or asks where to start after finding it, **fails in substance** even if it reads fluently. B's first reply is also quoted verbatim and marked `reads as restart` or `reads as continuation`: that is the appearance axis and is reported separately.
- **Verdict mapping, fixed before any run:** Pass 1 passes ≥2 of 3 **and** Pass 2's written decision is recovered ⇒ continuity holds in substance for work that reached disk. Pass 1 passes but Pass 2's chat-only decision is not recovered ⇒ **holds only for what was written down**; that is a gap and is recorded as one. Pass 1 passes <2 of 3 ⇒ continuity holds only in appearance. The ambiguity of any trial is stated, never smoothed.
- Findings cite raw evidence (B's tool calls, replies, timings); ambiguous or partial trials are reported as observed.

**Never:**
- No harness code, no `package.json` change, nothing under `src/`, `scripts/` or `tests/`. No hand-edit to `epics.md`, `SPEC.md`, `ARCHITECTURE-SPINE.md`, `EXPERIENCE.md` or `execution-model.md`: a verdict that contradicts them is recorded with the exact lines and the owning skill, as Story 1.1 did.
- Do not weaken the claim to fit the result. If it fails, say so and say what would close it (candidates to weigh, not to build: the harness handing B the sysline's file list as its first user turn; a harness-written handoff note on disk; A closing a turn by writing the decision to its memlog).
- No change to Story 2.9's handoff behaviour, and no new harness command or event.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pass 1, written work | A writes a planning artifact with the planted facts; B opens fresh, gets `pick up the work from here` | Rubric applied per trial, ≥3 trials, each with B's tool calls and first reply | A trial where A never wrote the artifact is invalid and re-run |
| Pass 1, B reads the wrong thing | B opens a different file or none | Recorded as a fail for that trial with what it opened | not smoothed |
| Pass 2, said not written | A and the user settle a decision in chat; A is not asked to write it; B opens fresh and is asked `pick up the work from here`, then in the same session `what did we decide about <topic>` | Records whether the decision was on disk anywhere and whether B recovered it | If A wrote it on its own, that is the finding and is stated |
| Memory leak | B reads a memory file outside the project | Trial invalid for the "disk alone" claim; re-run with the channel closed, or reported as a confound | named |
| Session fault | spawn fails, budget cap, no `result` row | recorded verbatim, trial excluded from the count with the reason | not counted as a pass |

</intent-contract>

## Code Map

- `scripts/record-run.mjs` -- flags and session driving to copy from into a throwaway driver; read-only, not extended.
- `.claude/skills/bmad-agent-{pm,analyst,dev,architect}/` -- the persona skills; their activation and any sidecar/memlog behaviour decide what lands on disk.
- `fixtures/runs/README.md` -- recording recipe and scratch-subject shape (`.claude/skills` plus `_bmad/scripts`); the tool-use Write/Bash split by model is a known trap, so record which tool wrote A's artifact.
- `_bmad/spikes/spike-stop-semantics.md`, `.../spike-stop-semantics-evidence/` -- precedent for document shape and the small-evidence-only rule.
- `src/main/session-bridge.ts` -- the handoff path (`session.open` plus sysline from written paths); read-only evidence that B's process receives only `/bmad-agent-<B>` and the user's turn.
- `_bmad/specs/spec-bmad-visual-harness/.memlog.md` (lines 91, 93) and `_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/.memlog.md` -- the claim and the open question this closes; `_bmad/scripts/memlog.py` appends to the first.
- `_bmad/planning-artifacts/epics.md` (FR60-FR63, Story 2.12) -- read-only.

## Tasks & Acceptance

**Execution:**
- `{scratchpad}/spike-continuity/` -- build the scratch project and a driver that opens a session, sends turns, records raw NDJSON and timings, and opens the second session cleanly -- repeatable trials, comparable evidence
- `{scratchpad}/spike-continuity/runs/` -- Pass 1 (≥3 trials: A writes, B picks up) and Pass 2 (≥2 trials: decision said not written); score each by the rubric -- the observation the story asks for
- `_bmad/spikes/spike-handoff-continuity.md` -- findings in the precedent's shape: question, why it blocks, what ran, per-trial evidence and rubric score, the appearance axis, the verdict, and (if any) the gap with what would close it -- the artifact the claim is recorded against
- `_bmad/spikes/spike-handoff-continuity-evidence/` -- per-trial small facts (A's artifact, B's tool calls, B's first reply, memory channels, timings); no raw NDJSON, no driver, no home-directory paths -- evidence survives the scratchpad
- `_bmad/specs/spec-bmad-visual-harness/.memlog.md` -- append the verdict through `uv run _bmad/scripts/memlog.py append --workspace _bmad/specs/spec-bmad-visual-harness --type decision --text ...`, naming the claim, the answer to the open question at line 93, and any gap -- the project's decision log
- this spec's `deferred` and `## Auto Run Result` -- carry the stale-claim list (which planning lines now need amending, owned by which skill) and any gap with its remedy -- nothing is left only in chat
- `{scratchpad}/spike-continuity/` -- confirm no spike code or raw NDJSON reached the repo -- discarded, not merged

**Acceptance Criteria:**
- Given a conversation in which persona A works a planning artifact into existence and the user then activates persona B, when B is asked to pick up the work in its own fresh session, then the spike document records, with B's tool calls and replies, whether B did so from the files on disk alone, and every channel other than the files is named and shown closed.
- Given the observation, then the document states plainly whether continuity holds in substance, holds only for what was written down, or holds only in appearance, scored against the rubric fixed in this spec, and says whether "no handoff presents as a restart" stands.
- Given continuity is found not to hold in substance in any form, then the gap is recorded with what would close it and the claim is not weakened to fit, and the planning lines that now disagree are listed with the skill that owns each.
- Given the spike concludes, then the finding is in the project memlog via `memlog.py`, and `git status` shows no code under `src/`, `scripts/`, `tests/`, no driver and no raw NDJSON.

## Spec Change Log

## Review Triage Log

### 2026-10-02 — Review pass
- verdicts: 26 findings — high 0, medium 3, low 14, false 5, maybe-false 0, notes 4 (descriptive intent-alignment report; verification-gap reported none)
- findings:
  - `[medium]` `patch` the single-label verdict rests on a scoring reading chosen after the results, and the favourable one (blind) — verdict now stated as conditional on the reading in the document and a correcting memlog entry; the ambiguity sits in the rubric wording, and the honest record is both mappings with the owner's ruling open
  - `[medium]` `patch` `rubric.fixed.json` mixes post-hoc interpretations into a file stamped as fixed before any run, and paraphrases the spec's wording (blind, edge) — post-hoc block moved to its own file, spec wording restored, hashed fact files committed if they still exist
  - `[medium]` `patch` committed evidence still holds encoded temp and repo paths although the record says none remain (edge) — redacted and re-grepped
  - `[low]` `patch` headline rates pool counted, pilot and control trials; Pass 2 '0 of 3' includes the pilot-layout trial; '0 of 3 in chat' is the first reply window only (blind, edge x2) — relabelled counted versus pilot/control, with the later-reply caveat for trial 1
  - `[low]` `patch` criterion 3 for trial 1 was scored on an excuse not in the fixed rubric (blind) — listed with the other after-the-fact interpretations
  - `[low]` `patch` `chatFirstWindow` holds the string `partial` in a boolean field (edge) — boolean plus a separate flag
  - `[low]` `patch` Auto Run Result blurs 'shown closed' for the transcript channel (blind) — worded exactly: open but unused by audit, closed only in the control run
  - `[low]` `reject` verdict label clashes with the appearance data; the three-way mapping cannot express 'found and used, recited little' (blind) — a limit of the mapping fixed before the runs; recorded by the conditional verdict, not by changing the mapping after the fact
  - `[low]` `reject` Pass 2 is near true by construction, and the obvious next step (accept A's offer, then hand off; a bmad-customize override) was untested (blind) — the spec scopes the story to observation and lists remedies as candidates not built; recorded as untested in the deferred gap
  - `[low]` `reject` `channels.json` calls transcripts open but unused, closed only in the control; the control changed two things (blind) — stated as observed; closing the channel in every trial would need a per-trial home directory, a design choice for a re-run
  - `[low]` `reject` Gap 2 is reasoned from code, not run; no unit test, no named owner (blind) — a test would be harness code, forbidden here; it is `deferred` with the file and line for Story 2.13 or Epic 3
  - `[low]` `reject` nothing tracks the high gap, no correct-course route (blind) — `deferred` and the memlog carry it with the owning skills listed; choosing correct-course is the owner's call
  - `[low]` `reject` line-number citations will go stale (blind) — a dated snapshot of the files as read; the memlog is append-only
  - `[low]` `reject` the document is 778 lines (blind) — per-trial verbatim replies are the evidence the rubric requires; the verdict and ruling lead
  - `[low]` `reject` stimulus easier than real use, a pilot B reached $2.994 of the $3 cap (blind) — stimulus limits are in the document's not-tried list; one pilot session near the cap is not a counted trial
  - `[low]` `reject` `rubric.fixed.json` timestamp cannot be ordered against the memlog's local stamp (edge) — the fact hashes are the proof; committed with the patch above
  - `[low]` `reject` rubric 'copied unchanged' claim and `fixed` stamp (edge, duplicate) — covered by the rubric-file patch
  - `[false]` `reject` sprint-status says done while the spec says in-review (blind, edge) — normal mid-workflow state, the spec reaches done at finalize, as in Story 1.1's log
  - `[false]` `reject` 'Review: none run' contradicts a contested verdict getting no review (blind) — this pass is that review; the line is rewritten at finalize
  - `[false]` `reject` the spec's 'exactly what the harness delivers' is looser than the document (intent-alignment) — the fix is to edit this build's spec, which triage does not do
  - `[false]` `reject` the ruling has no stated route (blind) — it is in `deferred` with its location
  - `[false]` `reject` first-window '0 of 3' versus full-session count (edge) — duplicate of the headline relabel patch
  - `[note]` `reject` the handoff was exercised through the headless CLI, not the real app; sysline and transcript never rendered (intent-alignment) — caveat 6 in the document and the deferred not-tried item; the rubric asks about B's substance, not rendering
  - `[note]` `reject` A's brief came from a scripted second turn with the facts given, not a live planning dialogue (intent-alignment) — the document lists it; a dialogue-derived brief is in the not-tried list
  - `[note]` `reject` the finding is recorded in a new document and the memlog, not in the claim's own lines (intent-alignment) — the spec forbids hand-editing those files; the stale lines and owners are listed
  - `[note]` `reject` `npm test` confirms only that nothing broke (intent-alignment) — by design, no code changed

## Design Notes

Why two passes: BMad is memlog-then-derive, so a persona's conclusions *should* already be on disk when the next one starts (architecture memlog, CAP-8 decision). Pass 1 tests that for work that was written; Pass 2 is the boundary the claim most plausibly breaks at, a decision reached only in conversation. Without Pass 2 a clean Pass 1 would confirm the easy half.

Appearance and substance are scored separately on purpose: the sysline `handed off · A → B · picking up from <files>` and the unbroken transcript make the *surface* continuous whatever B does; the story asks whether the substance behind it is.

## Verification

**Commands:**
- `git status --porcelain` -- expected: only `_bmad/spikes/spike-handoff-continuity.md`, its evidence folder, the specs `.memlog.md`, this spec and `sprint-status.yaml`; nothing under `src/`, `scripts/`, `tests/`
- `tail -3 _bmad/specs/spec-bmad-visual-harness/.memlog.md` -- expected: the continuity decision is the latest entry
- `npm test` -- expected: all pass (nothing in the app changed)

**Manual checks:**
- The spike document names the verdict, scores every trial against the rubric, quotes B's first reply for each trial, and states which memory channels were closed.

## Auto Run Result

**Summary:** Story 2.12 was a spike; nothing in the app changed. Two real `claude` sessions were driven per trial in throwaway scratch projects (Mary writes a brief, then a fresh John opens and is told `pick up the work from here`), 22 sessions across 11 trials. Verdict, conditional on a scoring reading whose ruling is open: **holds only for what was written down** if John's own workspace log counts as restating the facts (reading (b)), **holds only in appearance** if only his chat counts (reading (a)). John found Mary's brief with no path and began the PRD from it in 3 of 3 counted trials (7 of 7 with pilot and control); for a decision settled only in chat he recovered nothing in 0 of 2 counted trials (0 of 3 with the pilot-layout trial) and every reply read as a restart. "No handoff presents as a restart" does not stand as written; it was not weakened to fit.

**Files changed:**
- `_bmad/spikes/spike-handoff-continuity.md` -- the findings document: question, what ran, per-trial evidence scored against the fixed rubric, B's first replies verbatim, appearance axis, verdict, gaps with candidate remedies, stale planning lines with owning skills.
- `_bmad/spikes/spike-handoff-continuity-evidence/` -- 11 per-trial `.facts.json` files, `rubric.fixed.json` and `channels.json`. No raw NDJSON, no driver, no home-directory paths.
- `_bmad/specs/spec-bmad-visual-harness/.memlog.md` -- one `decision` entry appended through `memlog.py` (the tool also moved the `updated` stamp).
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2-12 marked done.
- This spec -- status, `deferred`, this section.

**Gaps and remedies:** (1) a chat-only decision is not on disk, so the next persona restarts; candidate remedies are in `deferred` and the document, none built. (2) By reading the code: the sysline's file list sees only `Write` and `Edit`, and the model wrote through `Bash` in 6 of 7 Pass 1 trials, so the sysline would name no files after written work. Stale planning lines and their owners are in `deferred`.

**Review:** 26 findings (blind, edge-case, verification-gap, intent-alignment). Patches applied: 7 (3 medium, 4 low), all to the document and its evidence: verdict made conditional on the scoring reading, rubric file split from post-hoc interpretations, temp-path redaction, counted-versus-pilot labelling, the criterion-3 interpretation listed, a boolean field fixed, channel wording made exact. Deferred: none new (the five items set at implementation stay in frontmatter). Rejected: the other 19, each with its reason in the Review Triage Log.

**Follow-up review recommended:** true. Three medium findings were patched, and the unverified risk is the one the verdict turns on: whether "restates the planted facts" counts the facts John writes into his own log (reading (b), "holds only for what was written down") or only his chat (reading (a), "holds only in appearance"). The patch states both; it does not rule.

**Verification:** `git status --porcelain` shows only the spike document, its evidence folder, the specs `.memlog.md`, `sprint-status.yaml` and this spec; nothing under `src/`, `scripts/` or `tests/`, no driver, no NDJSON. `tail -3` of the specs `.memlog.md` ends with the continuity decision. `npm test`: 105 files, 2173 tests pass, plus 55 in the watchers project (nothing in the app changed). After review, the spike document, its evidence folder and this spec were searched for `private-var`, `var-folders`, `Learnings`, `/Users` and `sherifmatta`; none remain. An earlier search missed encoded temp paths in three audit strings (`pass1-trial1`, `pass1-trial2`, `pilot-pass2-trial2`); those are now redacted to placeholders.

**Residual risks:** the verdict rests on 3 counted Pass 1 and 2 counted Pass 2 trials with one persona pair and one model, and on a scoring reading chosen after the results were seen (stated in the document). The second gap rests on reading code, not running it. Auto-memory is closed (no `memory_paths`, no memory directory, memory files unchanged). The session-transcript channel is open but unused by tool-call audit in every trial and closed only in the single control run (`--no-session-persistence`); it was not closed by sandboxing anywhere else.


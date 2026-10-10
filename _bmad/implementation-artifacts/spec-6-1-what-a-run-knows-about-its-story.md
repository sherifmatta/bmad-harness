---
title: 'What a run knows about its story'
type: 'chore'
created: '2026-10-10'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_revision: 'eb5395ba70cedf9624a1603096ee9107cb3818af'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 6.8 shows which persona is on which story, but nothing in the harness ties a run to a story. Story 6.1 (epics.md, Epic 6) asks whether a rule can, and whether `StoredRun` is enough for Story 6.7.

**Approach:** A spike note at `_bmad/spikes/spike-run-to-story.md` with its evidence beside it. No code in `src/`, no new event or field, nothing written into a project.

</frozen-after-approval>

## Implementation Notes

- The user's own run history under `userData` is outside what this session can read, so the three rules were scored over `fixtures/runs/` and the repo's memlogs only: 0 runs assigned by each. The note says accuracy is unmeasured and that the epics.md amendment (cutting 6.8, FR123) is **not** made, because absence of evidence is not evidence the rules fail.
- Evidence script and output: `_bmad/spikes/spike-run-to-story-evidence/`.
- No run cap was found in `stored-runs.ts` or `transcript-file.ts`; recorded for Story 6.7.

## Review Triage Log

- medium, fixed: script rule A was looser than the note (Bash-mentioned and date-like names). Now `spec-<e>-<n>-<slug>.md` on `Write`/`Edit` paths only, with a positive control.
- medium, fixed: memlog claim had no re-runnable evidence. The script now prints the counts.
- low, fixed: hand-typed `last_updated`, line-number reference, unverified no-cap claim.
- medium, deferred to the note's Open list: a `StoredRun`-shaped scorer for the userData history. It needs that history, which this session cannot read.
- false: "spec done vs sprint-status in-progress" was a transient state; both now `done` at the owner's "close".
- rejected low: tie rule across A and B, deadline for the owner's input.

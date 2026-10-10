---
status: cut
---

# BMad Build Auto Result: Story 6.8, The persona on a story

Status: cut (was blocked on an intent gap)

**Resolved 2026-10-10 by the owner (Sherif): cut Story 6.8 and amend FR123.** Reading 2 below. `epics.md` (FR123, the coverage table, UX-DR47, UX-DR48, the Epic 6 notes and Story 6.8), `EXPERIENCE.md`, `DESIGN.md`, `epic-6-context.md` and `sprint-status.yaml` were amended; the story key was removed from `sprint-status.yaml` so no Board column or `n of m` count holds it.

## What the story needs

Every acceptance criterion of Story 6.8 turns on "the rule 6.1 settled": which run is on which story. The card foot, the pulse and border, the owner precedence and the card acting as the persona's tile all follow from it. A card with no owner shows nothing.

## Evidence gathered

- `_bmad/spikes/spike-run-to-story.md` (Story 6.1, "partly answered") scored three candidate rules over the 11 recorded runs: every rule assigned 0 of 11. Accuracy is unmeasured, and it ships no rule. It says Story 6.8 "may only build the cut form (persona-row pulse and elapsed time)" until the history is scored, and that if no rule proves right, 6.8 is cut and FR123 is amended in `epics.md`.
- Its open item 1, scoring the rules over `<userData>/conversations/*.json`, was tried on 2026-10-10 on this machine. `~/Library/Application Support/bmad-harness/conversations/` holds four files. The one for this project (`e33f2aa6…`, the `sha256` of `/Users/sherifmatta/Learnings/bmad-harness`) has `"entries": []`. The other three belong to other projects and hold no run cards. There is no history to score here.
- The cut form already exists: Story 6.6's Agents panel shows each persona's run `code`, document path and elapsed time, and the pulse on its state dot.

## Readings that give different outcomes

1. Build candidate rule A (a run's story is the story key in the file name of the last document on its card named `spec-<epic>-<n>-<slug>.md`), unscored. This shows owners on cards and makes cards controls, against the spike's "none is shipped on its strength" and the "a wrong owner is worse than none" boundary.
2. Cut 6.8: amend FR123, Story 6.8 and `epic-6-context.md` in `epics.md` to say the Board shows no story owner, because the cut form is already built by 6.6. Planning documents are amended by their owning skill, not here.
3. Score first: run real story-building runs so a history exists, then decide. This blocks 6.8 only.

Nothing in the intent, the spike or the epic context selects between them, so none was picked.

## Decision

Reading 2. No code changed.

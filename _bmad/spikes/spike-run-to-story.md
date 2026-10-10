# Spike — what a run knows about its story

**Status:** partly answered · **Opened:** 2026-10-10 · **Closed:** 2026-10-10 · **Story:** 6.1, What a run knows about its story

## Verdict, up front

**The evidence this spike could reach cannot show that any rule is right, so none is shipped on its strength. The owner has to supply the one missing input before Story 6.8 is decided.**

- Over the 11 recorded runs in `fixtures/runs/` and the 5 `.memlog.md` files in the repo, **every candidate rule assigns 0 runs**. Accuracy is unmeasured, not poor: no recorded run worked on a story.
- This repo's own run history (`<userData>/conversations/<sha256(projectPath)>.json`, `src/main/sources/persistence/transcript-file.ts:45`) was **not read**. The session that built this spike cannot read outside the repository. It is where story runs would be, and the only place the rules can be scored.
- The AC says to cut Story 6.8 to the live pulse and elapsed time and amend FR123 only when no rule is right often enough. That has not been shown, so **`epics.md` is not amended here**. Until the history is scored, Story 6.8 may only build the cut form (the story's own default, "a wrong owner is worse than none", points that way).
- To close the spike: apply the same three rules to the stored cards in `userData` (a card's `documents[].path` stands in for the stream's `Write`/`Edit` paths) and hand-check each assignment. Copy none of that history into the repo.

## The question

Can a run be tied to the story it worked on, by a rule Story 6.8 can state as one sentence and a test can pin, so an owner is shown only when the harness can stand behind it? And is `StoredRun` enough for Story 6.7's recent activity?

## What ran

`_bmad/spikes/spike-run-to-story-evidence/rules-over-fixtures.mjs` reads each `fixtures/runs/*.jsonl` and its `.meta.json` (the harness's own turns are in `meta.turns`, not in the stream), and prints one line per recording: `rules-over-fixtures.out.jsonl`. No product code changed; nothing was written into a project.

The script first runs a positive control (the rules must fire on a known story path, status file and turn), then applies the rules as implemented:

- **A, written path.** A `Write` or `Edit` `file_path` whose name is `spec-<epic>-<n>-<slug>.md`. Where several, the last one. A path only named in a Bash command is not counted: it may only have been read.
- **B, sprint-status write.** A `Write`/`Edit` of `sprint-status.yaml` or a Bash command naming it.
- **C, the turn.** A user turn naming `story <e>.<n>` or a full story key.

## Results

| Rule | Runs assigned (of 11) | Right by hand | False positives |
|---|---|---|---|
| A, written path | 0 | n/a | 0 |
| B, sprint-status write | 0 | n/a | 0 |
| C, the turn | 0 | n/a | 0 |

Why 0 is the true answer: every recording is `/bmad-prd` or a scripted prose turn against a scratch project (`fixtures/runs/README.md`). The written files are `prd.md`, `addendum.md`, `notes.md` and the like. None writes `sprint-status.yaml`. No turn names a story. The memlog counts are in the same output file: 0 story-key lines; three mention `sprint-status` as a format that was checked, not written.

**A run that no rule assigns shows nothing.** No placeholder, no "unassigned" label.

## What the stored run allows, whatever the rules score

Read from `src/shared/conversation.ts:136` and `src/main/fold/stored-runs.ts`:

- **Rule A is computable from `RunCardSnapshot` as stored today**, but only for runs that write through `Write`/`Edit`: `documents[].path` comes from those two tools only (`fixtures/runs/README.md`, "Still open after Story 3.12"). A run that writes through Bash (the default model, opus, in `fast-path-opus` and `coaching-path`) has no `documents`, so A assigns it nothing even when the file names a story. `documents` is in first-seen order, so "the last document that names a story" is the last one first seen, not the last one touched.
- **Rule B is not computable from the card.** The card keeps a written document's text, not what changed in it, so "changes one story's status" needs a before/after the card does not hold. It would need a field added to the stored run.
- **Rule C is not on the card.** The user turn is a transcript entry, not part of `RunCardSnapshot`; a join by `sessionId` and time is possible but untested. A run started from the menu starts from a skill invocation, and the card keeps `skill` but not its arguments.
- **A step label is not evidence** (Story 6.1 amendment): rule A reads `documents`, never `steps`.

## Story 6.7

`StoredRun` (`{ card, lastAt }`) holds the whole card, so recent activity can read the same after a relaunch: a card still `running` is read back as `failed` at `lastAt` (`deadOf`), by a pure function. **No cap on stored runs was found** (read of both files, and a grep of `src/main` and `src/shared` for `slice(-`, `MAX_` and `splice`): `withRun` appends, and `transcript-file.ts` filters by shape but never by count. Only `steps` (300, `MAX_STEPS`) is bounded. A long-lived project's file therefore grows with every run, `documents[].text` included; 6.7 should read newest-first and show a fixed window rather than assume a cap.

## What Story 6.8 may rely on

- A story owner: **not yet.** Candidate sentence for the test to pin once scored: *a run's story is the story key in the file name of the last document on its card whose path is `spec-<epic>-<n>-<slug>.md`; a run with none has none.* Computable from the stored card, no field added, blind to Bash-written documents.
- The live pulse and elapsed time on a persona's row need no rule and are safe now.

## Open

1. Score A (and C, if wanted) over `<userData>/conversations/*.json` by hand, and amend this note. If A is right for every assigned run and assigns most story-building runs, ship it; if not, cut 6.8 and amend FR123 in `epics.md`.
2. Whether a heredoc-aware document interpreter (open since Story 3.12) should come before 6.8, since it decides how many runs A can see at all.

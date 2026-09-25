---
title: 'Settle what stopping a run actually costs'
type: 'chore'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
baseline_commit: '01be28844b8b9c796c391523a9a310499023e4a9'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `execution-model.md` carries an open risk: `SIGINT` exits a `claude` subprocess in ~250ms, but whether it halts **one turn** of a long-lived session *without ending the session* is unverified. Until that is settled, CAP-11's stop control has no fixed shape, FR84's copy is undecided, and FR90 — the persona explaining a stopped run in its own voice — may not be a valid requirement at all. The CLI docs say SIGINT "interrupts the current turn" but say nothing about session survival, so only a measurement can close it.

**Approach:** A throwaway spike. Drive a real session with the FR95 invocation and `/bmad-agent-pm` as the first stdin turn, dispatch a turn that makes tool calls, `SIGINT` mid-flight, and record three facts: process survives, `result` row terminates the turn, subsequent turn accepted. Measure exit latency whenever the process does exit. Record the finding, close the risk, throw the code away.

## Boundaries & Constraints

**Always:**
- Spike code lives only in the session scratchpad; nothing executable enters the repo.
- Every run targets a throwaway scratch project (a copy of `.claude/skills/` plus a minimal `_bmad/`), never this repo's artifacts.
- FR95 invocation verbatim — `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local` — with `/bmad-agent-pm` as the **first stdin turn**, not a positional prompt.
- ≥3 trials per configuration before an outcome is called. Findings cite raw evidence — NDJSON excerpts, timings, process state — as `spike-skill-execution-model.md` does for its Run C.
- **Two passes, decided:** first ≥3 cheap tool-forcing turns on the `/bmad-agent-pm` session (a prompt that reads and writes a small file) to establish the signal repeatably, then 1–2 real `/bmad-prd` turns to confirm a genuine skill dispatch behaves no differently. Both passes are reported; a disagreement between them is itself the finding.
- **On Branch B, decided:** timebox ~30 minutes to probe whether the CLI accepts an in-band interrupt control message on stream-json stdin. Record what was tried and what it did either way. Do not extend the timebox, and do not adopt the Agent SDK to get it.

**Never:**
- No harness code, scaffold or `package.json`; Story 1.2 owns that.
- No hand-edits to `SPEC.md` (re-derived by `/bmad-spec`) and no edits to FR84/FR85/FR90 in `epics.md` — both branches are already written there. This story determines which branch is live; amendments belong to Story 1.13.
- Not the Agent SDK as a runtime; it was rejected on authentication and is not reopened here.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Branch A | `SIGINT` during in-flight tool call | process alive; `result` terminates the turn; next turn accepted and answered | record: FR84 ships plain `stop`; FR90 stands as written |
| Branch B | same | process exits | record: FR84 ships `stop · ends this conversation` on the full card head, cost in the collapsed line's accessible name; FR90 amended for stops — harness reports in its own register, never a fabricated persona voice |
| Branch B′ | process survives but no `result` arrives, or the next turn hangs or errors | recorded verbatim, **treated as Branch B**: an unusable session costs the conversation as surely as a dead one | ambiguity named, not smoothed over |
| Exit latency | `SIGINT`, repeated if absorbed, until exit | elapsed ms and exit code recorded; the ~250ms figure FR85 depends on confirmed or refuted | never exits ⇒ that is the finding; note how FR85's dependency is then satisfied |
| No tool in flight | turn emits only text | invalid trial — re-run, waiting for `content_block_start` naming a tool | discarded, not counted toward the three |

</frozen-after-approval>


## Code Map

- `_bmad/specs/spec-bmad-visual-harness/execution-model.md` -- **the file to amend.** "Stop and failure", lines ~107–112: the `**Open risk:**` sentence is what closes, the `~250ms` claim is what the latency measurement tests. Amend those bullets only.
- `_bmad/spikes/spike-skill-execution-model.md` -- precedent and baseline. Its "CAP-11 / CAP-12 (Run C)" section records `rc=0` within 250ms, `result` with `subtype: "error_during_execution"` / `is_error: true` / `stop_reason: "tool_use"`, and an `is_error` `tool_result` naming the rejected call. **Run C used positional `claude -p` with stdin closed** — which is exactly why it does not answer this story. Reuse its document shape.
- `_bmad/scripts/memlog.py` -- `uv run _bmad/scripts/memlog.py append --workspace <dir> --type <kind> --text "<text>"`. Append-only, atomic rename.
- `_bmad/specs/spec-bmad-visual-harness/.memlog.md` -- the project memlog the finding lands in, per the prior spike's own "Write back" instruction. Go through `memlog.py`, never hand-edit.
- `_bmad/planning-artifacts/epics.md` -- FR84 (144), FR85 (145), FR90 (153), FR95 (161). **Read-only here**; FR95 is the invocation to reproduce exactly.
- `.claude/skills/bmad-agent-pm/` -- the persona skill sent as the first stdin turn; present in this install.
- No application code exists in the repo yet — nothing to integrate with or avoid breaking.

## Tasks & Acceptance

**Execution:**
- [x] `{scratchpad}/spike-stop/subject/` -- build the throwaway scratch project -- keeps every run off this repo's artifacts
- [x] `{scratchpad}/spike-stop/drive.py` -- driver: spawn, send `/bmad-agent-pm`, await `init` then `result`, dispatch the trial turn, watch for `content_block_start` naming a tool, `SIGINT`, then record liveness, any `result`, and the follow-up turn's fate -- one script makes trials repeatable and evidence comparable
- [x] `{scratchpad}/spike-stop/runs/` -- run the matrix, capturing full NDJSON and a timing log per run -- the three facts plus exit latency
- [x] `{scratchpad}/spike-stop/runs/` -- **Branch B only:** spend the ~30 min timebox probing an in-band interrupt on stdin; capture the attempts and their results -- decides whether the product keeps a plain `stop`
- [x] `_bmad/spikes/spike-stop-semantics.md` -- findings in the precedent's shape: question, why it blocks, what ran, per-run evidence, branch call, consequences for FR84/FR85/FR90 -- the artifact `execution-model.md` cites for raw measurements
- [x] `_bmad/specs/spec-bmad-visual-harness/execution-model.md` -- replace the `**Open risk:**` sentence with the settled finding, confirm or correct `~250ms`, cite the new spike doc
- [x] `_bmad/specs/spec-bmad-visual-harness/.memlog.md` -- append the finding via `memlog.py --type decision`, naming the branch and its consequence for FR84 and FR90
- [x] `{scratchpad}/spike-stop/` -- confirm no spike code landed in the repo -- "discarded rather than merged"

**Acceptance Criteria:**
- Given the FR95 invocation with `/bmad-agent-pm` first on stdin, when a turn is dispatched and `SIGINT` sent while a tool call is in flight, then the spike document records whether the process survives, whether a `result` row terminates that turn, and whether a subsequent turn can be sent on the same session — each with its raw evidence.
- Given the trials conclude, when the branch is called, then the document states Branch A, B or B′ with evidence, and states the consequent shape of FR84's control copy and whether FR90 stands or is amended for stops.
- Given `SIGINT` is sent and the process exits, when the exit is observed, then elapsed milliseconds and exit code are recorded and the ~250ms figure FR85's no-transitional-state rule depends on is explicitly confirmed or refuted.
- Given the spike concludes, when the repository is inspected, then `execution-model.md` no longer states the risk as open, the finding is in the project memlog, and no spike code exists under the project root.
- Given any trial was ambiguous or partial, when findings are written, then the ambiguity is stated as observed rather than resolved into a cleaner story.

## Implementation Notes

Executed 2026-09-25 against Claude Code CLI 2.1.274. Eight interrupted turns across two
mechanisms and two passes; evidence and per-run NDJSON retained in the session scratchpad under
`spike-stop/` (driver `drive.py`, runs `runs/A1..A3`, `B1..B3`, `P1`, `P2`, plus a discarded
`smoke` run that emitted no tool call). The nine `.facts.json` and nine `.timing.log` files are
committed at `_bmad/spikes/spike-stop-semantics-evidence/` so the measurements survive the
scratchpad; the NDJSON captures and the driver did not enter the repo.

**Outcome: Branch A — reached by overturning the mechanism.** `SIGINT` is Branch B (4/4: clean
`result` ~16ms in, then stdout EOF and `rc=0` at 217-390ms; no next turn possible). The in-band
`control_request` / `interrupt` on the session's stdin is Branch A (4/4: `control_response`
success, `result` in 3-6ms, process alive, `session_id` unchanged, next turn accepted and
answered in persona). FR84 therefore ships a plain `stop`; FR90 stands as written for stops.

**Deviations and limitations, all recorded in the spike doc:**
- The Branch B timebox probe succeeded on its first candidate, so the ~30 minutes were not spent.
- The scratch workspace is untrusted, so `.claude/settings.json` `permissions.allow` entries were
  ignored and `Write`/`Edit`/`uv run` were denied. That also made the persona activation itself
  degraded: the customization resolver was denied and John used the skill's manual fallback. The user's global trust list was deliberately
  not modified. Interrupted tool calls were therefore `Read` and `Bash`, never `Write`, and
  `/bmad-prd` was interrupted at its first tool call. Does not affect the three facts under test.
- `stop_reason` is `null` on every interrupted turn under both mechanisms (a completed turn
  carries `"end_turn"`), contradicting `execution-model.md`'s "Stop and failure" discriminator
  bullet and FR87. The `execution-model.md` bullet is corrected: the discriminator is `subtype` +
  `is_error`, and `stop_reason` must not be tested. FR87 lives in `epics.md`, which is read-only
  here, so it stays flagged for Story 1.13.
- FR83's "which sends `SIGINT`" is now wrong and needs amending in Story 1.13.

## Spec Change Log

## Review Triage Log

| verdict | finding | evidence |
|---|---|---|
| high | `execution-model.md:124` still says a `stop_reason` marks a stopped turn | Confirmed against raw NDJSON: 8/8 interrupted turns carry `stop_reason: null`; every completed turn carries `'end_turn'`. A detector requiring non-null `stop_reason` classifies every stop as finished. File is in this story's amend scope. → **patch** |
| high | The finding reached one of four documents that assert the now-false claim | Confirmed: `ARCHITECTURE-SPINE.md:190` carries the identical open-risk sentence *and* the `stop_reason` claim, `:338` lists stop semantics unverified; `EXPERIENCE.md:370` says unverified and `:381` carries the ~250ms `[ASSUMPTION]`; `epics.md:1643` has an AC testing the refuted figure; `epics.md:212/422/440` and `epic-1-context.md:86` still call it "the SIGINT spike". Every one of those files is either forbidden by the frozen block or a derived artifact with its own single writer. → **defer** |
| high | Story 1.13's ACs are a closed list that does not contain the three amendments this story defers to it | Confirmed at `epics.md:956-980`: eight spine amendments, three format corrections, two UX supersessions, named exhaustively; FR83, FR87 and FR90's dead carve-out appear in none. Grouped with the row above — same root cause. → **defer** |
| medium | Spike-doc quotes labelled verbatim are altered or truncated | Confirmed against NDJSON: B1 reads "pick them **straight** back up"; P1 continues "— when you interrupted." The doc's authority rests on raw evidence. → **patch** |
| medium | Raw evidence lives only in an ephemeral scratchpad while Verification claims a reviewer can re-read it | Confirmed: `.facts.json` + `.timing.log` total 108K and are session-scoped. → **patch** (commit the small files, no NDJSON, no code) |
| medium | FR99 `still_queued` claim is an inference, not an observation | Confirmed: all four `control_response` rows carry `still_queued: []`; no trial ever had a queued message pending. → **patch** |
| medium | Stop scenarios the spike never measured — idle session, text-only streaming, a second interrupt, orphaned `Bash` children, FR86 under the in-band interrupt | Real coverage gaps, but the frozen matrix explicitly scoped trials to "a tool call in flight" and discarded text-only runs. Intent chose this scope. → **defer** |
| low | Spike-doc subject description omits `_config/`, `config.user.toml`, `implementation-artifacts/`, `party-mode/`, `render/` | Confirmed by listing the scratch subject. Reproducibility claim in a doc that stakes itself on reproducibility. → **patch** |
| low | Findings tables omit the +5s liveness observation the stated protocol collects | Confirmed: `facts.json` records all four of +0.25/1/5/10s; the tables show two each. → **patch** |
| low | Persona activation itself ran degraded — resolver denied in the untrusted workspace | Confirmed in `stderr_tail` and the persona's own first reply ("the resolver script needed approval I couldn't get"). Does not touch the three session facts, but belongs in the caveats. → **patch** |
| medium | `.bmadshow/paths.json` `customOutputPath` is `/bmad-harness/_bmad/`, a path that does not exist | Confirmed (`ls /bmad-harness` → no such directory); `customEpicsPath` alongside it is repo-relative. Pre-existing untracked viewer config, present before this story began, unrelated to its scope. → **defer** |
| false | Spec `status: in-review` disagrees with sprint-status `in-progress` | Normal mid-workflow state; the sprint file is synced to `review` at presentation, not during review. |
| false | `## Spec Change Log` and `## Review Triage Log` are empty | By design: the change log is written only on a `bad_spec` loopback, and the triage log is this table. |
| low | Sprint key `1-4-...-one-live-re` is truncated mid-word, and the file's vocabulary is `review` not `in-review` | Both pre-existing, generated by `bmad-sprint-planning`. Story-key resolution matches on the first two numeric segments, so the truncation does not break lookup. Fix is more than a direct correction. → rejected |

## Design Notes

A `result` row arrives **per turn**, not once per process, so the stream is the turn signal and the exit code is not. Branch B is the case where that distinction collapses. One stdin line per turn; `session_id` is not required on subsequent turns.

```
spawn: claude -p --input-format stream-json --output-format stream-json \
       --include-partial-messages --verbose --setting-sources project,local
stdin: {"type":"user","message":{"role":"user","content":"/bmad-agent-pm"}}
await: system/init  ->  result            # persona turn settles
stdin: {"type":"user","message":{"role":"user","content":"<trial turn>"}}
await: content_block_start naming a tool  # a call is genuinely in flight
send:  SIGINT -> t0
record: result row? · alive at t0+1s / +5s? · next turn accepted?
```

## Verification

**Commands:**
- `git status --porcelain` -- expected: among changes, only `_bmad/spikes/spike-stop-semantics.md`, `.../execution-model.md` and `.../.memlog.md`; no spike code under the project root
- `grep -n 'Open risk' _bmad/specs/spec-bmad-visual-harness/execution-model.md` -- expected: no match on the stop-semantics bullet
- `tail -5 _bmad/specs/spec-bmad-visual-harness/.memlog.md` -- expected: the stop-semantics finding as the latest entry

**Manual checks:**
- `spike-stop-semantics.md` names the branch, cites per-run evidence, and states the consequence for FR84, FR85 and FR90.
- Captured NDJSON is retained in the scratchpad so a reviewer can re-read the evidence rather than trust the summary.

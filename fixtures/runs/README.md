# Replay corpus

Raw `claude` `stream-json` from real sessions, all but one of them `/bmad-prd`. One frame per line, exactly as the CLI wrote it to stdout; nothing here is a domain event, and nothing was edited after recording. `<scenario>.meta.json` sits beside each file. `tests/replay-corpus.test.ts` asserts that every scenario still has the shape it is named for.

Recorded with `scripts/record-run.mjs` on 2026-10-01 (and `multi-file-sonnet` on 2026-10-03, flags in its row), `claude` 2.1.274, against throwaway subject projects (a copy of this repo's `.claude/skills` and `_bmad/scripts` in a scratch directory), `--permission-mode bypassPermissions`. Each session ran with the load-bearing flags: `--input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`.

## Scenarios

| File | Model | What it shows |
| --- | --- | --- |
| `fast-path-sonnet` | sonnet | **The shape the design depends on.** Research subagents, then one 54 KB `Write` of `prd.md` at frame 6070, then 32 revision `Edit`s, then a reviewer gate. Two quiet windows of about 47 frames where the main thread says nothing. |
| `fast-path-opus` | opus (the default) | The same workflow where the document **never goes through `Write` or `Edit`**: eleven Bash heredocs of 10-48 KB carry it in, and revisions are Python patches run through Bash. 14 `result` rows for 3 sent turns. 20 MB, 47k frames, 23 minutes of drafting plus a 7-reviewer gate. |
| `coaching-path` | opus | A Coaching-path conversation, 10 turns, with the PRD written in multi-kilobyte batches (Bash heredocs and Python patches) a few sections at a time, then a four-reviewer gate. |
| `interrupt-sigint` | sonnet | `SIGINT` to the process once a `Write` had streamed 20 KB of input. The write's `content_block` never closes. The CLI emits a synthetic `user` frame and a final `result` with `error_during_execution`, `stop_reason: tool_use`, and exits 0. The session is over. |
| `interrupt-inband` | sonnet | A `control_request` `interrupt` at the same point. The CLI answers with a `control_response`, ends the turn with `error_during_execution`, and **the session survives**: a follow-up turn produces a complete 38 KB `Write`. |
| `interrupt-inband-idle` | sonnet | **An in-band interrupt on an idle session** (recorded 2026-10-06, `claude` 2.1.285, scripted turns `READY` / `PONG`, no tools). Sent after the first turn's `result`, with no turn in flight. The CLI answers with `control_response` `success` (`still_queued: []`) and **no `result` row at all**; the session survives and the next turn is answered normally. |
| `interrupt-inband-tasks-live` | sonnet | **An in-band interrupt while background tasks are live** (recorded 2026-10-06, `claude` 2.1.285). Two background subagents (`sleep 90` workers) launched, interrupt 1.5 s after the first `background_tasks_changed` that lists a task. **The interrupt stops the tasks first:** each gets `task_notification` `stopped` and `background_tasks_changed` falls to `[]` (line 52), then `control_response`, the `[Request interrupted by user]` user frame, and the `result` (`error_during_execution`, `is_error`, `stop_reason: tool_use`, line 59). So the failed `result` arrived with the task set already empty. A hand-fed follow-up turn (`PONG`) is answered: the session lives. |
| `interrupt-inband-tasks-live-mid-write` | sonnet | **The same interrupt, 10 s after the first task** (recorded 2026-10-06), with two backgrounded `sleep 90` shell tasks live behind a main thread that has not yet reached its `Write` of `notes.md`. Same order: tasks `stopped`, `background_tasks_changed` `[]` (line 330), `control_response` (333), `result` with `is_error` (335). **Then the CLI resumes on its own:** an empty turn nobody sent (`init` 336, `result` 337 with `num_turns: 0`), then another (338 on) in which the main thread carries on with the original instruction, `Write`s `notes.md` (11 KB, line 349 on) and says it is done (`result` 1432). The recorder sent only the interrupt (`meta.turns`); a stop does not keep the persona from continuing once the stopped tasks' notifications wake it. |
| `multi-file-sonnet` | sonnet | **One card, several files** (Story 3.12). Recorded 2026-10-03 with `--permission-mode acceptEdits` and `--disallowedTools Bash,Task,Agent,WebFetch,WebSearch,NotebookEdit`, from one scripted turn rather than `/bmad-prd`: a 1.4 KB `addendum.md`, a 3.3 KB `prd.pre-review.md` and an 8.4 KB `prd.md`, each by one `Write` with a relative `file_path`, then three revision `Edit`s of `prd.md` (the last adds a section). A real recording, not hand-built; short so it can be replayed in every test run. |
| `reviewer-gate-failure-induced` | sonnet | **Induced, not natural.** The gate run on a finished PRD under `--max-budget-usd 1.00`: two reviewer subagents dispatched, one reports, and the CLI ends with `result` `error_max_budget_usd`, `is_error: true`, no `stop_reason`. |

## Things the corpus shows that the planning text got wrong or left open

- **Which tool writes the document depends on the model.** Sonnet uses `Write`/`Edit`; opus uses Bash heredocs. A `doc:prose` interpreter that watches only `Write` input sees nothing on opus. The interpreter has to recognise a document write inside a Bash command, or the product has to pin a model. **Still open after Story 3.12:** the card keeps a buffer per path only for `Write`s and patches it only by `Edit`; a run that writes through Bash heredocs or Python patches has no buffer and no subject, and its body stays the run-note feed. Naming a heredoc-aware interpreter is a later decision.
- **A session takes turns nobody sent.** Background subagents finishing wake the main thread, which produces its own `result` rows. A `result` row is the end of *a* turn, not of the turn the harness sent; matching them one to one is wrong.
- **The "quiet window" is not just `system/task_progress`.** While subagents run, the stream carries their `assistant`/`user`/`stream_event` frames (marked by `parent_tool_use_id`), `tool_progress`, `task_*` system frames and `rate_limit_event`. The main thread is silent; the stream is not.
- **`SIGINT` ends the session and the in-band interrupt does not.** Both end the interrupted turn in `error_during_execution` with `stop_reason: tool_use`.
- **Failure results vary in shape.** `error_during_execution` carries `stop_reason`; `error_max_budget_usd` carries `errors: [...]` and no `stop_reason`.
- A `system/init` frame lists `memory_paths` under the recording user's home directory.

## Known gaps

- **A natural failure inside the reviewer gate was not obtained.** Every background task across the six recordings completed (`task_notification` status `completed`); none failed, and no run was aimed at provoking a natural failure. The one failure here is a budget cap, which exercises the `result` error path but not a reviewer subagent that itself errors. Interpreter behaviour for a subagent reporting failure to the main thread is untested by this corpus.
- **No contract version.** `contractVersion` is `null` in every `meta.json`: the contract is declared in a later story. It is metadata for forensics and never a validity constraint.
- Recordings are model- and CLI-version-specific. Re-record rather than edit.

## Re-recording

```bash
node scripts/record-run.mjs --scenario <name> --subject <throwaway project dir> --turns <turns.json> \
  [--model sonnet] [--interrupt sigint|inband] [--interrupt-tool Write] [--interrupt-after-bytes 20000]
```

Turns after the scripted ones are fed by dropping `<n>.txt` into `fixtures/runs/<name>.inbox/`; an empty file named `end` closes the session.

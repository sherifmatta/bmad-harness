# Replay corpus

Raw `claude` `stream-json` from real `/bmad-prd` sessions. One frame per line, exactly as the CLI wrote it to stdout; nothing here is a domain event, and nothing was edited after recording. `<scenario>.meta.json` sits beside each file. `tests/replay-corpus.test.ts` asserts that every scenario still has the shape it is named for.

Recorded with `scripts/record-run.mjs` on 2026-10-01, `claude` 2.1.274, against throwaway subject projects (a copy of this repo's `.claude/skills` and `_bmad/scripts` in a scratch directory), `--permission-mode bypassPermissions`. Each session ran with the load-bearing flags: `--input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`.

## Scenarios

| File | Model | What it shows |
| --- | --- | --- |
| `fast-path-sonnet` | sonnet | **The shape the design depends on.** Research subagents, then one 54 KB `Write` of `prd.md` at frame 6070, then 32 revision `Edit`s, then a reviewer gate. Two quiet windows of about 47 frames where the main thread says nothing. |
| `fast-path-opus` | opus (the default) | The same workflow where the document **never goes through `Write` or `Edit`**: eleven Bash heredocs of 10-48 KB carry it in, and revisions are Python patches run through Bash. 14 `result` rows for 3 sent turns. 20 MB, 47k frames, 23 minutes of drafting plus a 7-reviewer gate. |
| `coaching-path` | opus | A Coaching-path conversation, 10 turns, with the PRD written in multi-kilobyte batches (Bash heredocs and Python patches) a few sections at a time, then a four-reviewer gate. |
| `interrupt-sigint` | sonnet | `SIGINT` to the process once a `Write` had streamed 20 KB of input. The write's `content_block` never closes. The CLI emits a synthetic `user` frame and a final `result` with `error_during_execution`, `stop_reason: tool_use`, and exits 0. The session is over. |
| `interrupt-inband` | sonnet | A `control_request` `interrupt` at the same point. The CLI answers with a `control_response`, ends the turn with `error_during_execution`, and **the session survives**: a follow-up turn produces a complete 38 KB `Write`. |
| `reviewer-gate-failure-induced` | sonnet | **Induced, not natural.** The gate run on a finished PRD under `--max-budget-usd 1.00`: two reviewer subagents dispatched, one reports, and the CLI ends with `result` `error_max_budget_usd`, `is_error: true`, no `stop_reason`. |

## Things the corpus shows that the planning text got wrong or left open

- **Which tool writes the document depends on the model.** Sonnet uses `Write`/`Edit`; opus uses Bash heredocs. A `doc:prose` interpreter that watches only `Write` input sees nothing on opus. The interpreter has to recognise a document write inside a Bash command, or the product has to pin a model. Both are decisions for Epic 3, not for this story.
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

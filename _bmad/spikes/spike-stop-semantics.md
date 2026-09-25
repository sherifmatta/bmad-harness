# Spike — stop semantics

**Status:** answered · **Opened:** 2026-09-25 · **Closed:** 2026-09-25 · **Timebox:** ½ day

## The question

Does `SIGINT` halt **one turn** of a long-lived persona session without ending the session?

`execution-model.md` carried this as an open risk. `SIGINT` was known to exit a `claude -p`
subprocess `rc=0` in ~250ms — but that measurement (the prior spike's Run C) used a **positional
prompt with stdin closed**, where killing the process and ending the turn are the same act. The
FR95 session is different: stdin stays open, `result` arrives per turn, and the session is meant
to outlive the turn. Nothing in the CLI docs says what `SIGINT` does to *that*.

## Why it blocks

- **CAP-11 / FR83–FR85** — the stop control's shape. If stop costs the conversation, the cost has
  to be printed on the control before it is pressed.
- **FR90** — the persona picking up a stopped run in its own voice. If the session is gone, there
  is no persona left to speak and the requirement is invalid for stops.
- **FR85** — "no *stopping…* transitional state" depends on the stop being fast enough that a
  transitional state would never be seen.

## What ran

Claude Code CLI **2.1.274**, macOS 25.6.0, model `claude-opus-5[1m]`.

Invocation, verbatim FR95, `/bmad-agent-pm` as the **first stdin turn**, never a positional prompt:

```
claude -p --input-format stream-json --output-format stream-json \
       --include-partial-messages --verbose --setting-sources project,local
```

Per-run evidence — the nine `.facts.json` fact sheets and nine `.timing.log` timelines these
findings are drawn from — is committed alongside this document at
`spike-stop-semantics-evidence/`. The full NDJSON captures and the driver script stayed in the
session scratchpad and were not merged.

Subject: a throwaway scratch project — a verbatim copy of this repo's `.claude/skills/` plus an
`_bmad/` carrying `_config/`, `bmm/`, `core/`, `custom/`, `party-mode/`, `render/`, `scripts/`,
`config.toml` and `config.user.toml`, with empty `planning-artifacts/`, `implementation-artifacts/`
and `docs/`. Only this repo's own spec, spike and planning artifacts were left out.
Nothing was written into this repo.

Per trial: send `/bmad-agent-pm`, wait for `system/init` then `result`; send the trial turn; wait
for `content_block_start` naming a tool (a call genuinely in flight); interrupt at `t0`; then
record liveness at `t0+0.25/1/5/10s`, any `result`, process exit code and latency, and the fate of
a follow-up turn on the same stdin.

**Two passes, as decided.** Pass 1: three cheap tool-forcing turns (a multi-file read). Pass 2: two
real `/bmad-prd` dispatches. Both mechanisms were exercised in both passes.

**Turns that emitted only text were discarded as invalid** — one such run (`smoke`) is retained in
the scratchpad and is not counted toward any three.

## Finding 1 — `SIGINT` ends the session. Branch B. (4 trials, 4/4)

`SIGINT` to the `claude` pid while a tool call was in flight:

| trial | turn | tool in flight | `result` at | liveness | exit |
|---|---|---|---|---|---|
| A1 | 3-file read | `Read` | t0+**15.0ms** | dead by +0.25s; dead +1s, +5s, +10s | `rc=0` @ **217.3ms** |
| A2 | 3-file read | `Read` | t0+**16.8ms** | alive +0.25s; dead +1s, +5s, +10s | `rc=0` @ **346.1ms** |
| A3 | 3-file read | `Read` | t0+**17.8ms** | alive +0.25s; dead +1s, +5s, +10s | `rc=0` @ **353.7ms** |
| P2 | `/bmad-prd` | `Bash` | t0+**17.3ms** | alive +0.25s; dead +1s, +5s, +10s | `rc=0` @ **390.0ms** |

The turn *is* terminated cleanly — a `result` row arrives first, ~16ms after the signal:

```json
{"type":"result","subtype":"error_during_execution","is_error":true,
 "num_turns":2,"duration_ms":1223,"stop_reason":null,
 "session_id":"d8931b7d-0ef8-4ffe-b27b-e69c063db92f","permission_denials":[]}
```

…and is then immediately followed by stdout EOF and process exit. **No follow-up turn was
possible in any of the four trials**: by the time the harness could write the next line to stdin,
the pipe was gone.

So `SIGINT` gives a clean turn terminator *and* takes the session with it. Under the story's
matrix that is **Branch B**, not B′ — nothing hung, nothing was ambiguous. The process simply died.

`/bmad-prd` (P2) behaved identically to the cheap turns. A genuine skill dispatch is not a
different case.

## Finding 2 — an in-band interrupt on stdin does halt one turn. Branch A. (4 trials, 4/4)

The ~30-minute Branch B timebox was spent probing whether the CLI accepts an interrupt as a
message on the stream-json stdin lane. **It does, on the first thing tried.** The Agent SDK's
control-protocol message, written as one stdin line:

```json
{"type":"control_request","request_id":"spike-1","request":{"subtype":"interrupt"}}
```

The CLI answers on stdout and ends the turn:

```json
{"type":"control_response","response":{"subtype":"success","request_id":"spike-1",
 "response":{"still_queued":[]}}}
{"type":"result","subtype":"error_during_execution","is_error":true,"num_turns":2,
 "duration_ms":2347,"stop_reason":null,
 "session_id":"f1850a6c-a171-4bca-906b-c0ed9686b59c"}
```

| trial | turn | tool in flight | `control_response` | `result` at | liveness +0.25/1/5/10s | follow-up turn |
|---|---|---|---|---|---|---|
| B1 | 4-file read | `Read` | `success` | t0+**3.3ms** | alive at all four | **accepted and answered** |
| B2 | 4-file read | `Read` | `success` | t0+**4.7ms** | alive at all four | **accepted and answered** |
| B3 | 4-file read | `Read` | `success` | t0+**5.5ms** | alive at all four | **accepted and answered** |
| P1 | `/bmad-prd` | `Bash` | `success` | t0+**5.4ms** | alive at all four | **accepted and answered** |

All three facts the story asked for, positive: **process survives**, **`result` terminates the
turn**, **the next turn is accepted**. And the persona is intact, in its own voice, with memory of
what was interrupted — verbatim follow-up replies:

- B1 — *"📋 Still here, Sherif — I'm John, your Product Manager. The four file reads were interrupted before I ran them; say the word and I'll pick them straight back up."*
- B3 — *"📋 Yes, I'm here — I'm John, your Product Manager. I had just started the file reads when you interrupted; say the word and I'll pick them back up."*
- P1 (`/bmad-prd`) — *"📋 I'm John, your Product Manager. I was just starting the PRD workflow — activating it and about to begin discovery with you — when you interrupted."*

`session_id` is **unchanged across every turn**, before and after the interrupt (3 `system/init`
rows per run, one `session_id`): B1 `f1850a6c…`, B2 `c1d8c7f7…`, B3 `b2587a18…`. This is the same
session, not a silently restarted one.

The control protocol is not an SDK-only affordance bolted on top — it is compiled into the CLI
binary. `strings` over `claude` 2.1.274 shows the stdin lane parsing `control_request` (*"Dropping
control_request: missing request object or non-string subtype"*) and carrying the subtypes
`initialize`, `interrupt`, `set_permission_mode`, `set_model`, `can_use_tool`, `hook_callback`,
`mcp_message`, plus `control_cancel_request`.

## Finding 3 — the ~250ms figure, confirmed in order of magnitude, corrected in detail

Two different latencies matter and the spec was conflating them.

- **Turn terminator** (what the UI waits on): `result` arrives **3.3–5.5ms** after an in-band
  interrupt, **15.0–17.8ms** after `SIGINT`. Both are far below any perceptible threshold.
- **Process exit** (only relevant when the session is being torn down): `rc=0` at **217.3ms,
  346.1ms, 353.7ms, 390.0ms** (n=4, mean ≈327ms). The signal was never absorbed; no repeat
  `SIGINT` was needed, so the escalation path was never exercised.

So "~250ms" is **optimistic but not wrong in kind**: the honest statement is *exits `rc=0` in
under 400ms (217–390ms observed, n=4)*. FR85's no-transitional-state rule does not in fact depend
on that number at all — it depends on the **`result` row, which lands in single-digit
milliseconds**. The card reaches its terminal state off the stream, not off the exit.

## Branch call

**Branch A is live — but not through `SIGINT`.**

The story framed this as a property of `SIGINT`. It is not. `SIGINT` is Branch B (4/4). The in-band
`control_request` / `interrupt` on stdin is Branch A (4/4). The capability CAP-11 needs exists; the
mechanism FR83 names is the wrong one.

Stated plainly, because the story asked for the ambiguity not to be smoothed over: **this is a
Branch A outcome reached by overturning a mechanism the FRs already committed to.** It is a better
result than either branch the story anticipated, and it costs an amendment to FR83.

## Consequences

- **FR83 — amend (Story 1.13).** `run.stop(runId)` must send
  `{"type":"control_request","request_id":"<id>","request":{"subtype":"interrupt"}}` on the
  session's stdin, **not** `SIGINT`. `SIGINT` remains correct for *ending a session* (the
  end-session control), where killing the process is the intent.
- **FR84 — ships plain `stop`.** Stopping costs the turn, not the conversation. There is no cost
  to print on the control, so the "where stop ends the persona's session" clause does not fire and
  the collapsed line needs no cost in its accessible name.
- **FR85 — stands, on firmer ground.** The terminal state is reachable **3–6ms** after the stop is
  dispatched. No confirmation dialog and no transitional state is not just permissible, it is the
  only honest rendering. The `~250ms` exit figure it was resting on is neither needed nor
  load-bearing for stop; corrected to *under 400ms* where it still applies (session teardown).
- **FR90 — stands as written, for stops as well as failures.** The persona survives, remembers
  what was interrupted, and volunteers to resume unprompted. The Branch B carve-out in FR90's
  current text ("where stopping also ends the session … there is no persona left") is now dead
  text and should be struck in Story 1.13.
- **FR99 — a lead, not a result.** `control_response` carries a `still_queued` field, which looks
  like the source FR99's queued-composer reconciliation needs. **It was empty (`[]`) in all four
  in-band trials and was never observed carrying data** — no trial had a message queued when the
  interrupt was sent. That the field exists is evidence; what it contains under load is not yet
  measured.

## Caveats and risks, as observed

1. **`stop_reason` is `null` on an interrupted turn, under both mechanisms.**
   `execution-model.md` and FR87 currently say *"`subtype: error_during_execution` with
   `is_error: true` **and a `stop_reason`** marks a turn stopped or failed"*. In all eight
   interrupted turns here the `result` carried `subtype: "error_during_execution"`,
   `is_error: true`, and `stop_reason: null`. The prior spike's Run C saw
   `stop_reason: "tool_use"` — but that was a positional `claude -p` with stdin closed, a
   different shape. **A detector that requires a non-null `stop_reason` will miss every stop in a
   live session.** The reliable pair is `subtype` + `is_error`. `execution-model.md`'s bullet has
   been corrected accordingly; **FR87 in `epics.md` still carries the wrong wording** and is
   flagged for Story 1.13, which owns amendments there.
2. **The control protocol is undocumented in `claude --help`.** It is present and stable in the
   2.1.274 binary and is the Agent SDK's own transport, so it is not a private hack — but it is
   not a documented CLI contract either, and a future release could change the message shape.
   Mitigation: the stop path should treat a missing or non-`success` `control_response` as a
   fallback trigger to `SIGINT` + session restart, which is exactly the Branch B behaviour the
   product already knows how to describe.
3. **The scratch workspace was untrusted, so `Write`, `Edit` and `uv run …` were denied.**
   `.claude/settings.json` `permissions.allow` entries are ignored in an untrusted workspace
   (*"this workspace has not been trusted"*), and the user's global trust list was deliberately not
   modified for a throwaway directory. Consequence: the tool calls interrupted were `Read` and
   `Bash`, never `Write`; and `/bmad-prd` was interrupted at its first tool call rather than deep
   in an authoring pass. This does not touch the three facts under test — liveness, `result`,
   next turn — all of which are properties of the session, not of the tool. It does mean **this
   spike did not re-test FR86's byte-for-byte partial file**; that remains settled by the prior
   spike's Run C and is unaffected.
4. **The persona activation itself ran degraded.** `/bmad-agent-pm`'s Step 1 runs
   `uv run _bmad/scripts/resolve_customization.py`; in the untrusted workspace that Bash call was
   denied (`system/permission_denied`, *"This command requires approval"*, and the turn's `result`
   lists it under `permission_denials`), so John took the skill's documented fallback and resolved
   the agent block by hand — his own first reply says so: *"the customization resolver script
   needed an approval I couldn't get in this session, so I resolved the agent block by hand
   instead"*. The persona still activated, adopted its voice and carried across turns, which is
   all the three facts under test depend on. But **these trials are not a fully-trusted-install
   reproduction**, and a reader should not treat them as one.
5. **Interrupt was always sent at the *first* `content_block_start` naming a tool**, i.e. while the
   tool input was still streaming as `input_json_delta`. Interrupting later in a long tool
   execution was not separately measured.
6. **Every stopped turn still emits `result` before anything else.** Worth holding onto: the
   harness should close the turn on `result`, never on `control_response` — the response only says
   the interrupt was accepted.

## Decision

Adopt the in-band interrupt. `run.stop(runId)` writes one `control_request` line to the session's
stdin and waits for the `result` row. `SIGINT` is reserved for ending a session outright. CAP-11
ships a plain `stop` with no cost copy, and FR90 needs no stop-specific exception.

The open risk in `execution-model.md` is closed.

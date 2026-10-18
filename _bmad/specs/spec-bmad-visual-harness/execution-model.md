# Skill execution model

What runs a BMad skill when a skill button is pressed, and what the harness reads to render it.
Settled by evidence in `../../spikes/spike-skill-execution-model.md` (raw measurements) and
amended by `ARCHITECTURE-SPINE.md` AD-18, which moved the runtime unit from a per-run
subprocess to a long-lived persona session. CAP-4, CAP-5, CAP-6, CAP-11 and CAP-12 depend on it.

## The runtime

**A persona session** — the Claude Code CLI spawned as a long-lived subprocess, one per active
persona, not one per run:

```
claude -p --input-format stream-json --output-format stream-json \
  --include-partial-messages --verbose --setting-sources project,local
```

`/bmad-agent-<x>` is sent as the **first turn on stdin**, not as a positional prompt:
`--input-format` is only valid alongside `--print`, so the prompt arrives on the stream.
Party mode is a session of the same kind, opened with `/bmad-party-mode`.

**The session starts at the user's first message, not at selection (2026-10-16, CAP-15).**
Selecting a persona spawns nothing and writes nothing; the process is spawned, and
`/bmad-agent-<x>` written as the first stdin turn, when the user sends that persona's first
message, which follows as the next turn. The persona's activation reply and its answer to that
message are one reply in the chat. How the two turns are presented without editing the persona's
words is left to architecture and its story (`SPEC.md` Open Questions).

Three flags are load-bearing and may not be dropped:

- `--include-partial-messages` is what makes `input_json_delta` exist at all. Without it CAP-5
  has no prose to stream.
- `--setting-sources project,local` restricts resolution to the project and local sources and so
  **excludes the `user` source**: the subprocess sees the target project's `.claude/skills/` and
  none of whoever-is-running-the-harness's user-level configuration. This is CAP-1's mechanism.
- `--input-format stream-json` is what keeps the session alive across turns.

**Chat turns and skill invocations are both turns into a session.** There is no second run kind.
A **run** is a turn dispatched from a menu entry; a plain chat turn is not a run and raises no
card. A menu entry carrying a `prompt` rather than a `skill` dispatches its text verbatim as a
turn — the same path (`bmad-install-contract.md`).

Sessions are reclaimed when the persona's chat is closed. They are not held across app restarts;
the persona's thread is. Closing a persona's chat deletes that persona's thread with the session.

**Not the Agent SDK.** The SDK runs the same binary as a library and emits the same events, with
`interrupt()`, `canUseTool` and hooks as typed callbacks instead of signals and flags. It was
rejected on authentication, not ergonomics: Anthropic's terms require third-party products built
on the Agent SDK to use API-key auth rather than claude.ai login. A subprocess spawning the
`claude` binary the user already installed and authenticated does not. Revisit only if the
harness ever ships carrying its own key.

## What feeds which surface

The live card and the outputs rail read **different sources**, and this is deliberate.

| Surface | Source | Event |
|---|---|---|
| Live document card — prose streaming in (CAP-5) | the run's event stream | `input_json_delta` on the `Write`/`Edit` tool call, decoded as it arrives |
| Live card — current section | same stream | markdown headings parsed out of the accumulating buffer |
| Live card — persona's own voice, pushback (CAP-5) | same stream | main-thread `text_delta` |
| Live card — subagent activity | same stream | `system/task_progress` (description, tokens, `last_tool_name`, duration), where the runtime emits it |
| Outputs rail — file state (CAP-6) | the filesystem | watcher on `_bmad/` |
| Rail — a row settles to `saved` | the filesystem | the watcher saw the write land — never because the stream announced it |
| Stop / failure (CAP-11, CAP-12) | the stream | the turn's `result` row + the rejected call's `tool_result` |

The stream may **annotate** a rail row with run-scoped metadata — owning persona, section in
flight, stopped — but may never create a row, remove one, or assert what a file contains. Because
`changing` comes from watcher activity plus a settle debounce, CAP-6's "by any writer" holds for
an editor or a terminal `claude` with no stream at all.

This does **not** breach the no-second-source-of-truth constraint. The card renders a write that
is still in flight and not yet on disk; it is a view of the run, not a model of project state.

**Separate the voices.** `parent_tool_use_id` is set on everything a subagent emits. Only
main-thread `text_delta` is the persona speaking; subagent text belongs to the research or review
pass and must not be rendered as the persona's own words. The CLI also gates subagent text behind
`--forward-subagent-text`, which is not passed.

**Route the bytes once.** Writes to `.memlog.md` are run notes and never document prose, so
memlog text can never enter the document buffer or its section parser.

## Progress against a plan

The head reads `writing · §4 Functional Requirements` — the section number and its name, with
**no denominator**, here or on the rail row
(`../../planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md`, *Progress, batch
commit and revision*: "the denominator is deleted"). A total is not something the run supplies:
BMad adapts its template — one observed `bmad-prd` run expanded the template's 0–9 Essential
Spine into 15 top-level sections — and a counter going 9 → 15 reads as a defect.

The plan is the foot's list of not-yet-written section names. Predict it from two places, in
order:

1. The skill's own template (`assets/prd-template.md` for `bmad-prd`) — the Essential Spine is
   stable and numbered.
2. The run's `.memlog.md`, which records a concern-scan entry naming exactly which Adapt-In
   sections were pulled. This lands early, before the document is written.

Render the head from headings already parsed, and the predicted plan as the foot's list. When the
two disagree, the headings win and the list gains names — never renumber a section the user has
already seen.

## Confirming a write

**Mark a section written on `tool_result`, never on `tool_use`.** A write is announced in the
stream before it executes, and an announced write can fail to land.

The unit of confirmation is the **tool call, not the section**. BMad does not author section by
section on disk: a Fast-path run commits a whole document in one `Write` and then lands ~20
revision `Edit`s. On `tool_result`, every section parsed from that call's accumulated input
becomes committed together; on `tool_result` with `is_error: true`, none of them did, and that
call names what failed to land.

`Write` and `Edit` are both stream sources and differ in handling: a `Write` replaces the
document buffer and may open new sections; an `Edit` patches it and is a **revision** — it
re-parses sections but never advances the section counter. Twenty of twenty-one observed writes
in a Fast-path run were revision `Edit`s.

## Stop and failure

- **Stopping a run costs the turn, not the conversation — but not via `SIGINT`.** Write one
  interrupt line to the session's own stdin:
  `{"type":"control_request","request_id":"<id>","request":{"subtype":"interrupt"}}`. The CLI
  answers `control_response` `subtype: "success"` and emits the turn's `result` within **3–6ms**;
  the process stays alive, `session_id` is unchanged, and the next turn is accepted and answered
  in the persona's own voice, with memory of what was interrupted. Measured 4/4.
- **`SIGINT` ends the session.** It exits the subprocess `rc=0` — measured at 217, 346, 354 and
  390ms (n=4), so *under 400ms*, not the ~250ms previously assumed. A `result` row does arrive
  ~16ms ahead of the exit, but stdout closes with it and no further turn can be sent. Reserve
  `SIGINT` for ending a session outright; never use it to stop a run. If an interrupt ever fails
  (no `control_response`, or a non-`success` one), falling back to `SIGINT` means restarting the
  session, and that cost is surfaced to the user rather than hidden.
- Raw measurements: `../../spikes/spike-stop-semantics.md`.
- A `result` row arrives **per turn**, not once per process, and terminates the turn the harness
  is waiting on. Process exit code is not the signal — a session outlives every turn in it.
- `subtype: "error_during_execution"` with `is_error: true` marks a turn stopped or failed; its
  absence marks it finished. Those two fields are the whole discriminator. **Do not test
  `stop_reason`** — on an interrupted turn in a live session it is `null` (8/8 turns, under both
  `SIGINT` and the in-band interrupt), while a completed turn carries `"end_turn"`, so a detector
  that requires a non-null `stop_reason` classifies every stop as finished.
- The tool call that was in flight returns a `tool_result` with `is_error: true`, naming the call
  that was rejected. This is how the rail knows which section did *not* land.
- The partial file on disk is byte-for-byte the last **successful** write. Nothing to revert, so
  the never-revert constraint costs nothing.

## One turn in flight per session

Turns within a session are strictly serialised by the harness: at most one turn — chat or run —
is in flight, and anything the user types during a run is queued and sent when that turn
completes. This is what makes a `result` row unambiguously belong to the turn the harness is
waiting on. Skill buttons are disabled whenever any turn is in flight; the composer is not.

**Different sessions run concurrently** (`ARCHITECTURE-SPINE.md` AD-11). Concurrent personas can
still collide on one artifact — `bmad-correct-course` touches the PRD, epics, architecture and UX
at once — and that collision is reported, never resolved.

## Filesystem watcher constraints

- `.memlog.md` is written by **atomic temp-file rename** (`_bmad/scripts/memlog.py`). Configure
  the watcher for atomic writes or it will miss or double-count appends.
- The memlog's **kind vocabulary is open**: the host skill supplies it by how it calls `append`,
  and the writer enforces none. An entry renders as `(kind)`, `(kind by who)` or `(by who)`, or with
  no tag for a plain note. Entries carry **no per-entry timestamp** — the only time in the file is
  the file-level `updated:` frontmatter field, restamped on every write. Nothing downstream may
  assume a fixed set of kinds or a time per entry (`../../scripts/memlog.py`, module docstring and
  `now()`).
- Rapid appends **coalesce** — three landed inside 400ms in one observed run. Sub-second polling
  does not give one event per entry, and nothing downstream should assume it does.
- Document commits are **whole-file `Write` calls, not appends**. An on-disk delta is a full
  replacement, so incremental diffing has to come from the stream.

## The dead-air problem

The risk to "no spinner substitutes for this at any point" is **not** the document render — that
streams for minutes. It is the parallel-subagent windows: Discovery research and the Finalize
reviewer gate, where the main thread emits nothing but `system/task_progress` while subagents
work — and that is not guaranteed on every run.

In those windows `.memlog.md` is the dependable live signal rather than a fallback, and it is a
good one — appended entry by entry with the decision and its reason. **It is the card's secondary
feed**, and the persona's state stays `work` throughout.

## Stream volume

Deltas must be coalesced before they reach any component. One observed document write decomposed
into **5,795 `input_json_delta` events carrying 69,031 characters**; replaying the buffer at
10 / 50 / 75% of deltas yields a valid growing document at §2.3, §4.5 and §7 respectively. No
render may be driven by an individual delta.

## Measured behaviour

Two `bmad-prd` runs against a throwaway subject, watched from outside at 200ms resolution.

**Headless / Fast path** — `prd.md` created as a single **68,394-byte** write ~8.5 minutes in,
then ~20 revision edits of 150–2,200 B each.

**Interactive / Coaching path** — a 219-byte frontmatter stub, then §0 through §2.3 in a single
7,798-byte write; `addendum.md` in one 10,506-byte write.

The conclusion both runs support: **BMad does not author section by section on disk. It does
author section by section on the wire.**

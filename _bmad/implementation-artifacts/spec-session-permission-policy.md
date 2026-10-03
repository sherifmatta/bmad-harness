---
title: 'Persona sessions get permission through a fixed in-project policy'
type: 'feature'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
baseline_commit: 'b8b505432229621bc22a5a5760746fbece77fe63'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad/spikes/spike-product-argv-check.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Under the product's argv (no permission mode) every persona activation has its `uv run …resolve_customization.py` call denied and every `Write` denied, so Epic 3 cannot write a document (spike Findings 2 and 4, Epic 2 retro item 32).

**Approach:** Add `--permission-prompt-tool stdio`. The CLI then sends a `control_request` (`subtype: can_use_tool`) on stdout for each call that would prompt; the session Source answers every one on stdin from a pure policy: allow what stays inside the project root or `userData`, deny the rest with a short reason the persona relays. Decided by Sherif 2026-10-03; `bypassPermissions` rejected.

## Boundaries & Constraints

**Always:** Every `can_use_tool` request is answered exactly once, by its `request_id`, even when the policy throws or the input is malformed (that is a deny). Control frames never reach the fold, the transcript or the renderer. The policy is a pure function: `fs` access (path canonicalisation) and `homeDir` are injected. Paths are canonicalised before comparison, so `/tmp` and `/private/tmp`, `..` and symlinks cannot escape. A deny message states the real reason and the boundary (`outside the project`), never a guess. The CLI's deny shape, checked against the real CLI: `{behavior:"deny", message}`.

**Never:** No approval UI, no persisted allow rules, no write inside the project. Do not add `--permission-mode`, `--model`, `--allowedTools` or `--settings`. The policy is not a sandbox and says so: a shell command cannot be fully analysed, so Bash is a boundary check on obvious path arguments and redirects. Do not edit `_bmad/planning-artifacts/**` or `fixtures/runs/**`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Write inside project | `Write` `file_path` under the project root | allow, `updatedInput` = the input | N/A |
| Write outside | `file_path` outside root and `userData` | deny, message names the path and `outside the project` | N/A |
| Read tool | `Read` / `Glob` / `Grep` / `LS` with a path | allow inside root or `userData`; deny outside; no path means the cwd, allow | N/A |
| Escape by `..` or symlink | `<root>/../x`, or a link resolving outside | deny (canonical path compared) | canonicaliser failure on a missing leaf: use the nearest existing ancestor |
| Bash, no outside paths | `uv run _bmad/scripts/…`, `cat > notes/b.md <<EOF` | allow | N/A |
| Bash outside path | an absolute, `~`, `$HOME` or `..`-escaping argument or redirect target outside root and `userData` | deny, message names the first offending path | N/A |
| Bash, system path | `/dev/null`, `/usr/bin/env`, and other system executable dirs as a command or `/dev/std*` as a target | allow (not a data boundary) | N/A |
| Bash with expansions | `$(…)`, backticks, unknown `$VAR` | allow when no literal outside path is visible: the stated limit | N/A |
| Non-file tools | `Skill`, `Task`/`Agent`, `TodoWrite`, `ToolSearch`, `WebFetch`, `WebSearch` | allow | N/A |
| Anything else | other tool name (including `mcp__*`, `AskUserQuestion`) | deny, message says the tool is not available to sessions here | N/A |
| Malformed request | no `tool_name`, `input` not an object | deny, `unrecognised permission request` | answered, never ignored |
| Other subtype | `control_request` whose subtype is not `can_use_tool` | answer `error` response for that `request_id`; do not wedge | N/A |
| Cancel | `control_cancel_request` | ignored | N/A |
| Late or dead | request after the process closed, or stdin destroyed | no write attempted, no throw | the session's own exit path runs |
| Concurrent | two requests before either is answered | each answered by its own id | N/A |

</frozen-after-approval>

## Code Map

- `src/main/sources/session/session-process.ts` -- `SESSION_ARGS`; the only place that knows wire framing. Add the flag; intercept `control_request` frames before `onFrame`; add `control_response` line builders; take an injected `decide` option shaped structurally (no import from `fold/`, the layer rule forbids Source importing upward).
- `src/main/fold/permission-policy.ts` (new) -- pure `decidePermission(request, { projectRoot, userDataDir, homeDir, canonicalize })`, with the Bash path scan.
- `src/main/session-registry.ts` -- `startProcess` passes `cwd` and `decide` to `start`; `SessionRegistryDeps` gains `userDataDir`, `homeDir`, `canonicalize`.
- `src/main/session-bridge.ts` -- composition root: `app.getPath('userData')`, `os.homedir()`, real canonicaliser.
- `src/main/sources/persistence/` or a new `src/main/sources/session/canonical-path.ts` -- real canonicaliser (`realpathSync` of the nearest existing ancestor).
- `src/main/session-voice.ts` -- `LINES.quiet`: the silence clock already covers a turn waiting on a control response; the answer path resets it by activity.
- `tests/session-contract.test.ts` -- argv pins; add `--permission-prompt-tool` and its value `stdio`, keep the absence list (`--permission-mode`, `--model`, `--system-prompt`, `--append-system-prompt`, `--forward-subagent-text`).
- `_bmad/spikes/spike-product-argv-check.md` -- Finding 5 with evidence. Reuse `…-evidence/run.mjs`.
- Do not change `src/main/fold/frame.ts` or `route-frame.ts` (control frames never reach them), nor `fixtures/runs/`.

## Tasks & Acceptance

**Execution:**
- [x] `src/main/fold/permission-policy.test.ts`, `src/main/fold/permission-policy.ts` -- tests first from the matrix, then the policy, including Bash tokenising (quotes, `>` and `>>` redirects, `tee`, `cd`) -- the boundary is the decision
- [x] `src/main/sources/session/session-process.test.ts`, `session-process.ts` -- tests first (answers by `request_id`, concurrent, malformed, other subtype, cancel ignored, late, dead pipe, throwing `decide` becomes a deny, control frames not handed to `onFrame`), then the interception -- Source owns the frames
- [x] `src/main/sources/session/canonical-path.ts` (+ test) -- real canonicaliser -- injected I/O for the pure policy
- [x] `src/main/session-registry.ts`, `session-bridge.ts` (+ their tests) -- wire `decide` per entry with its own `projectRoot` -- the policy is per project
- [x] `tests/session-contract.test.ts`, `tests/layering.test.ts` coverage -- argv pins and the new fold file stays pure
- [x] `_bmad/spikes/spike-product-argv-check.md` + evidence -- Finding 5 from a real run through `spawnSession` -- verification
- [x] `_bmad/implementation-artifacts/deferred-work.md`, `sprint-status.yaml` -- list the planning lines to amend; set item 32 done

**Acceptance Criteria:**
- Given the product argv, when a session opens, then activation completes with zero `permission_denials` and a `Write` inside a scratch project succeeds on a real `claude`.
- Given a `Write` outside the project, when requested, then it is denied, no file appears, and the persona says plainly that it was blocked as outside the project.
- Given a request the CLI sends, when no policy rule matches or the policy throws, then a deny is written; no turn is left waiting on a control response.
- Given the full suite, lint and typecheck, then all pass, and `session-process.ts` imports nothing from `fold/`.

## Implementation Notes

- Beyond the matrix, `Edit`, `MultiEdit` (`file_path`) and `NotebookEdit` (`notebook_path`) are bounded like `Write`; denying them as "not available" would block document edits. An absolute `Glob` pattern is bounded by the directory before its first wildcard.
- Bash (after review): a here-document is opened only by a `<<` the tokenizer reads as an operator (never in quotes, arithmetic or a comment); its body is dropped as data, except the `$(…)` and backtick commands of a body whose delimiter is unquoted, which are scanned. `$(…)` and backticks are scanned as their own commands wherever they appear, double quotes included, and `$'…'`/`$"…"` read as plain words. A word is checked up to its first expansion (`/etc/$X` reads as `/etc/`); the text after an option's `=` or a one-letter short flag is also checked. `cd`/`pushd` are followed, a subshell's directory is restored at `)`, and a `cd` with no literal target (bare, `-`, an expansion) or any `popd` is denied, naming the command. System executable directories are exempt only as the command word; devices (`/dev/null`, `/dev/std*`, `/dev/tty`, `/dev/zero`, `/dev/random`, `/dev/urandom`, `/dev/fd/<n>`) anywhere. Glob patterns are bounded by their literal prefix, relative ones read from `path` or the root. A single-quoted `$HOME` is read as the home directory (conservative). A token that begins `/` is read as a path whatever it is, so `grep "/api/users" src` and `sed -n '/x/p'` are denied: the stated limit, on the strict side.
- `decide` is a required option of `spawnSession`. A control request with no `request_id` cannot be answered and is dropped (nothing is written, nothing reaches `onFrame`). `control_response` frames from the CLI are dropped with the cancels.
- Deny wording: `blocked: <path> is outside the project`, `blocked: the <tool> tool is not available to sessions here`, `unrecognised permission request`, and `blocked: the permission check failed` (a throwing `decide`, written in Sources). The word "decision" is banned from main code by `tests/negative-surface.test.ts`, so the policy's answer type is `PermissionAnswer`.
- The runner (`run.mjs policy`) bundles `spawnSession`, `decidePermission` and `canonicalPath` from `src/` with esbuild and keeps subjects under `$SPIKE_SUBJECTS`.

## Spec Change Log

## Review Triage Log

Pass 1 (blind hunter 13, edge-case hunter 14, verification gap 3 plus other findings). Bypass claims were reproduced by running `decidePermission` with a stub canonicaliser; every one returned `allow`. No intent_gap or bad_spec: the spec was clear where the code deviated (system dirs as arguments), so that routes to patch rather than a re-derivation.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | `<<` inside quotes or `$((1<<2))` opens a phantom heredoc, later lines dropped unscanned (blind, edge, gap) | high | reproduced: `echo "a <<EOF"\ncat /etc/passwd` allowed | patch |
| 2 | Unquoted heredoc body containing `$(...)` or backticks is dropped though the shell runs it (edge) | medium | reproduced | patch |
| 3 | Relative or `~` Glob pattern is not bounded (blind, edge, gap) | medium | reproduced: `../../**/*.pem` allowed | patch |
| 4 | Paths glued to an option: `of=/etc/x`, `--output=/etc/x`, `-o/etc/x` (blind, edge) | medium | reproduced | patch |
| 5 | `$(...)` or backticks inside double quotes, and `$'/etc/passwd'`, hide a literal outside path (edge) | medium | reproduced | patch |
| 6 | System directories exempt as arguments, not only as the command word: `rm -rf /opt/homebrew`, `cp x /usr/local/bin/y` (edge) | medium | reproduced; the matrix says "as a command" | patch |
| 7 | `cd` with no argument, `cd -`, `pushd` or an expansion target leaves the tracked cwd wrong; a closed subshell keeps its cwd (blind, edge) | medium | reproduced: `cd && echo x > leaked.md` allowed | patch |
| 8 | Default `userData` and `homedir()` wiring in the real composition is never exercised (gap) | medium | the electron mock has no `app`; a wrong default would still pass | patch |
| 9 | Header comment says no turn is ever left waiting, but a request with no `request_id` is dropped (blind, edge) | low | true; the CLI always sends an id, so a comment fix | patch |
| 10 | The stated limits are not all written down in the policy header (blind) | low | the limits list omits glued forms before this change, relative links, dangling links, in-project protected files | patch |
| 11 | `/dev/stdin`, `/dev/zero`, `/dev/urandom`, `/dev/fd/N` denied (edge) | low | reproduced: `head -c 4 /dev/urandom` denied | patch |
| 12 | A word starting with `/` is a path even in a regex or search string: `sed -n '/x/p'`, `grep "/api/users"` denied (edge, executor risk 4) | medium | reproduced; the persona sees the denial and can rephrase | defer |
| 13 | No protection for `.claude/settings*`, `.claude/skills`, `.git/hooks` inside the project (blind) | low | real, but Bash is allowed, so a persona can do the same by other means; not a sandbox | defer |
| 14 | Whole `userData` directory open to read and write (blind) | medium | real; Sherif's decision named `userData`; the harness itself writes there, so sessions may not need it | defer |
| 15 | `WebFetch` and `WebSearch` are network egress (blind) | medium | decision flagged at the checkpoint and approved; risk not yet written down | defer |
| 16 | Dangling link or `missing/../out/x` in `canonicalPath` resolves as a missing tail (blind, edge) | low | requires a pre-existing link to outside; creating one via Bash is denied | defer |
| 17 | Relative symlink through a Bash argument (`cat out/secret`, `cd out`) not caught (blind, edge) | low | requires a pre-existing in-project link to outside; within the stated limit | defer |
| 18 | No decision log (blind) | low | feature gap, not a defect of this change | defer |
| 19 | Request and answer types declared in two modules (blind) | false | by design: Source cannot import fold (layer rule), the spec says so; the registry assignment is type-checked | reject |
| 20 | macOS-biased `SYSTEM_DIRS`, no Windows handling, `toBeGreaterThan` in one test (blind) | false | macOS only in v1; the assertion is lazy-read proof enough | reject |


## Design Notes

Policy table, as built (decisions of mine, flagged at the checkpoint for the human):

- Reads are bounded like writes (root and `userData`), because "deny elsewhere" was the decision and the CLI only prompts for reads outside its working directory anyway. Writes to `userData` are allowed because that is where the harness keeps transcripts and logs; nothing there is a project file.
- `WebFetch` and `WebSearch` are allowed: no filesystem effect, and the research skills use them. Subagent launch (`Task`/`Agent`), `Skill`, `TodoWrite`, `ToolSearch` are allowed for the same reason. Everything else, `mcp__*` included, is denied until a story needs it.
- System executable directories allowed as Bash targets: `/bin`, `/usr`, `/opt/homebrew`, `/Library/Developer`, `/System`, `/dev/null`, `/dev/stdout`, `/dev/stderr`, `/dev/tty`.
- The Bash scan reads tokens that begin `/`, `~`, `$HOME`, `${HOME}`, or contain a `..` segment, and every redirect or `tee` target. It cannot see paths built by expansion or by a script's own logic. A script the persona runs (`uv run`, `python3`) can touch anything; the boundary is a guard against the obvious case, not a sandbox.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: all green
- `node _bmad/spikes/spike-product-argv-check-evidence/run.mjs` against the new argv (see Finding 5) -- expected: no denials on activation, inside write succeeds, outside write denied

**Manual checks (if no CLI):**
- The `Write` outside the project: the persona's reply states the denial and the reason.

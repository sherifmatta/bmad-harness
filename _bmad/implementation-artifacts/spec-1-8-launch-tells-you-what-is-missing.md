---
title: 'Launch tells you what is missing'
type: 'feature'
created: '2026-09-29'
status: 'done'
baseline_commit: '35584f37c319c02382be81bf1a688ebddaca5122'
baseline_revision: '35584f37c319c02382be81bf1a688ebddaca5122'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      A BMad install (or its resolver script) created while the window is open on a no-agents screen is not noticed until relaunch.
    evidence: |-
      The install watcher's set is the config TOML files and a watched path whose immediate parent is missing at launch is never picked up (measured in Story 1.7, chokidar 4.0.3). The no-agents message tells the user to install BMad into this project; the window stays on that screen until relaunch. Closing it means watching the project root or the scripts directory, a watcher change beyond this story.
    location: >-
      src/main/sources/install/watch-install.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** A project that cannot open still opens. With `claude` or `uv` absent, or a project whose BMad install resolves no agents, the window shows a bare roster preview and, at best, a resolver error line — the empty room AD-17 exists to prevent, which reads as broken rather than unconfigured. Nothing yet checks `claude` at all.

**Approach:** Main checks the three prerequisites — `claude` (on `PATH`, signed in), `uv` (present, resolving Python 3.11+), and the roster Story 1.7 already resolves (at least one agent) — and folds the failures into the install snapshot as a `preflight` list of named `{ code, message, detail? }` errors, each with its remedy in `message`. The renderer opens the room preview only when `preflight` is empty and the roster is not; otherwise it shows those lines and nothing else.

## Boundaries & Constraints

**Always:**
- **Two distinct messages per tool check, and one code each** (FR7): `preflight/claude-missing`, `preflight/claude-unauthenticated`, `preflight/uv-missing`, `preflight/uv-python-old`; plus `preflight/no-agents` (FR8) and `preflight/check-failed` for a check that could not conclude (timeout, unreadable answer, a spawn error other than `ENOENT`). The `message` strings are fixed, lower-case, mono, `·`-separated, no terminal punctuation, and each names the fact **and** its remedy (`EXPERIENCE.md:270-278`): `claude · not on path · install the claude cli`; `claude · not signed in · run claude once to sign in`; `uv · not found · install uv`; `uv · resolves no python 3.11 or newer · install a 3.11+ toolchain for uv`; `<claude|uv> · check did not complete` (`detail` from the closed vocabulary `exceeded <n>ms`, `exit <n>`, `signal <name>`, `spawn <ERRNO>`, `output was not json`, `output was not the expected shape`). `uv-python-old` carries `detail` `python <major.minor[.patch]>` (validated `^\d+\.\d+(\.\d+)?$` from what `uv` printed) or `no python found`. Never stderr, never a stack, never a path.
- **The no-agents message states all four things in `message`, visibly, not behind a disclosure** (FR8, `EXPERIENCE.md:280-282`): what was looked for (`agents`), where (`this project`, `--setting-sources project,local`), why a correct install can still resolve none (`a user-scoped install rather than a project-scoped one`), and what would change it (`install bmad into this project, or open one that has it`). Exactly: `no agents · looked for agents in this project, under --setting-sources project,local · a bmad install scoped to the user rather than the project resolves none there · install bmad into this project, or open one that has it`. It never reads "no agents found".
- **`claude` check is one process:** `claude auth status` (JSON default) from a neutral cwd. Spawn `ENOENT` → `claude-missing`. Exit 0 with `loggedIn: true` → pass; exit 0 with `loggedIn: false` or exit 1 → `claude-unauthenticated` (observed: an unauthenticated config dir exits 1 printing `loggedIn: false`). Any other exit, timeout, or exit-0 output that is not JSON with a boolean `loggedIn` → `check-failed`. It reads no credential and never prints the account.
- **`uv` check is up to two offline processes** (neither downloads anything): `uv python find --no-project --show-version >=3.11` from a neutral cwd — exit 0 → pass, spawn `ENOENT` → `uv-missing`, timeout or another spawn error → `check-failed`; a non-zero exit → `uv python find --no-project --show-version` (any interpreter) to name what it did find → `uv-python-old`.
- **Both tool checks run once per window**, in parallel, before the first resolve, each timeout-bounded by a named constant (15 s); their outcome is memoized for the window's life (a renderer reload re-asks a warm projection). A failed tool is fixed by relaunching; the harness adds no retry control.
- **If `uv` did not pass, the resolvers are not run** — spawning them could only produce a second, noisier form of the same fact. The roster stays empty, `errors` stays empty, and no `no-agents` line is added (the cause is known and named). If `uv` passed and `claude` did not, the roster still resolves so that all of a window's failures show together.
- **`no-agents` triggers on exactly `agents.length === 0 && errors.length === 0` after a refresh with `uv` passing** (the trigger Story 1.7 recorded). A resolver failure with no last good roster is *not* `no-agents`: it keeps its named `resolver/*` error, which the preflight screen shows. A project whose `_bmad/scripts/resolve_config.py` does not exist has no resolver to ask and therefore no agents: `resolveRoster` answers `{ ok: true, agents: [] }` without spawning (an `access` check on that one script path; the file is never read, and no TOML file is touched).
- **One snapshot carries it.** `InstallSnapshot` gains `preflight: HarnessError[]` (order: claude, uv, no-agents), part of the renderer-visible content that decides emission and `revision`, so preflight and roster arrive in one frame and the stale-push rule covers it. A roster that later gains agents (config edited under the watcher) clears `no-agents` and opens the room with no reload.
- **The room gate is a pure function** — `roomState(snapshot, failure)` in `install-state.ts`: `pending` (no snapshot, no failure), `blocked` (a failure with no snapshot, or a snapshot with `preflight.length > 0` or `agents.length === 0`), else `open`. `app.tsx` renders **nothing** for `pending` (no spinner, no sentence — as today), the project path plus every `preflight` line then every `errors` line then the failure line for `blocked`, and today's preview for `open`. No setup step, wizard or question appears in any state (FR9).
- **Layering holds:** the tool checks are a new source (`src/main/sources/preflight/`), the fold into the snapshot is the existing projection, the bridge only injects; `src/shared/install.ts` stays types only; nothing under `src/renderer/` reaches main; `HarnessApi` keeps exactly `getProjectPath`, `getInstall`, `onInstallChanged`.

**Never:**
- Never parse the `claude` account, read `~/.claude`, `settings*.json`, or any credential; never run `claude` with a prompt, `--print`, or anything that starts a session; never run `uv` with `run`, `pip`, `python install` or anything that downloads or writes.
- Never widen `HarnessApi`, add a channel, add a dependency, add a token, a stylesheet rule, a `z-index`, motion, a role, `aria-live`, an `Arrow*` literal, the CSS focus-stroke word anywhere under `src/`, or a `style={{ }}` literal.
- Never a button, retry, "check again", wizard, checklist, progress or "what would you like to do" affordance; never a spinner or a sentence doing one's job; never a persona speaking for a preflight failure.
- Never build the shell, topbar, tiles, live region, or the 1:1 view (Stories 1.9–1.10); the gate wraps the existing preview scaffold and nothing else. Never announce preflight failures politely — that needs the live region Story 1.9 mounts (`EXPERIENCE.md:512`, already recorded in Story 1.7).
- Never route Dock-launch `PATH` repair into the harness: a `claude` or `uv` missing from a minimal GUI `PATH` is reported as not on path, exactly as it is; the remedy text is the specified one.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| All pass | `claude auth status` exit 0 `loggedIn: true`; `uv python find` exit 0; roster has agents | `preflight: []`, `roomState` `open`, preview opens directly | None |
| `claude` absent | spawn `ENOENT` | `preflight/claude-missing` | Others still evaluated |
| `claude` signed out | exit 1, or exit 0 `loggedIn: false` | `preflight/claude-unauthenticated`, message distinct from the above | — |
| `claude` unreadable | timeout / exit 2 / stdout `garbage` / `{}` | `preflight/check-failed`, `claude · check did not complete`, `detail` from the closed vocabulary | Blocks the room; process killed on timeout |
| `uv` absent | spawn `ENOENT` | `preflight/uv-missing`; resolvers not run; `errors: []` | No `no-agents` line |
| `uv`, Python 3.9 only | `>=3.11` find exits 2; unconstrained find prints `3.9.6` | `preflight/uv-python-old`, `detail: python 3.9.6`; resolvers not run | — |
| `uv`, no Python at all | both finds exit non-zero | `preflight/uv-python-old`, `detail: no python found` | — |
| `uv` unreadable | timeout on the first find | `preflight/check-failed`, `uv · check did not complete`, `detail: exceeded 15000ms`; resolvers not run | — |
| Both tools bad | `claude` absent and `uv` absent | two lines, claude first | — |
| No agents | `agents: {}`, or no `[agents.*]` | `agents: []`, `errors: []`, `preflight: [no-agents]` (all four parts in `message`) | `blocked` |
| No BMad scripts | `_bmad/scripts/resolve_config.py` absent | `agents: []`, no process spawned for roster, `preflight: [no-agents]` | `blocked` |
| Resolver fails, no last good | roster resolver exit 1 first time | `agents: []`, `errors: [resolver/invocation-failed]`, **no** `no-agents` | `blocked`; error line shown |
| Roster gains agents | config edited so an agent resolves | `no-agents` gone, revision +1, room opens without reload | — |
| Failure before snapshot | `getInstall()` rejects | `roomState` `blocked`: path + the failure line only | — |
| Pending | nothing yet | nothing rendered | — |

</intent-contract>

## Code Map

Edits across `src/shared/install.ts`, `src/main/projections/install.ts`, `src/main/sources/install/resolvers.ts`, `src/main/install-bridge.ts`, `src/renderer/ui/install/install-state.ts`, `src/renderer/ui/app.tsx`; new `src/main/sources/preflight/` and `src/renderer/ui/install/preflight.tsx`. No new token, stylesheet, dependency, channel or preload method.

**Contract read from where it was verified.**
- `epics.md:769-806` (the story), FR7–FR9 `:37-39`; `ARCHITECTURE-SPINE.md:180-184` (AD-17) and `:190` (AD-18, the `--setting-sources project,local` flag); `EXPERIENCE.md:270-282` (preflight table, the four-part rule, forbidden setup steps), `:512` (polite announcement — Story 1.9's). `bmad-install-contract.md:85-98`.
- **Observed on this machine:** `claude auth status` exits 0 printing JSON with `loggedIn: true`; with `CLAUDE_CONFIG_DIR` pointed at an empty directory it exits **1** printing `loggedIn: false, authMethod: none`. `claude --version` is unnecessary — one process answers presence *and* sign-in. `uv python find --no-project --show-version '>=3.11'` prints `3.14.7` exit 0; `'>=3.99'` exits **2**; unconstrained `--show-version` on a Python-3.9-only machine would print `3.9.6`. `uv python list --only-installed` here shows 3.14.7 and `/usr/bin/python3` 3.9.6, so the below-3.11 case is real on macOS. `uv python find` never downloads.
- `_bmad/scripts/resolve_config.py:65-70`: a `ConfigError` (missing *or* unparseable TOML) is exit 1 with no way to tell them apart — why a missing-config project is a named `resolver/invocation-failed` (1.7) and only a missing *resolver script* is treated as "no agents".

**The code this lands in.**
- `src/main/sources/install/run-command.ts:1-90` — `runCommand` (own process group, stderr dropped, `CommandResult` classification) is reused as is; both tool checks take an injected `CommandRunner` like `createInstallSource` does. `stdout` is only present on success, which is why "exit 1" alone must mean signed out for `claude`.
- `src/main/sources/install/resolvers.ts:60-125` — `createInstallSource`, `failureOf` (the detail vocabulary to reuse: `exceeded`, `spawn`, `exit`, `signal`), `resolveRoster`. Add the `access` short-circuit here, injectable (`exists?`) so tests need no filesystem.
- `src/main/projections/install.ts:62-190` — `content()`, `resolveAll()`, `run()`; `lastEmitted` compares `JSON.stringify(content())`, so putting `preflight` in `content()` is what makes emission and `revision` cover it. `resolveAll` replaces `errors` wholesale each run, so `preflight` recomputed the same way is cleared by the next success. Today an empty roster with `errors: []` is silent — that is the exact state `no-agents` names.
- `src/main/install-bridge.ts:34-95` — `serviceFor` builds the projection lazily; add an injectable `createChecks` beside `createSource` and pass it through. The three startup suites never call `install:get`, so they still spawn nothing.
- `src/renderer/ui/install/install-state.ts` — pure pieces already tested without a DOM; `roomState` joins them. `src/renderer/ui/app.tsx:99-158` — the render to gate; existing assertions in `tests/persona.test.ts:793-829` pin its portrait rows, `<Initials`, `PREVIEW_*` text and the `<ErrorLine` mounts; keep every one true.
- `src/renderer/ui/install/error-line.tsx` + `.css` — reuse for every preflight line; no stylesheet for the new component (a list of `ErrorLine`s needs none). Existing sweeps that must stay green: `tests/tokens.test.ts:848-865` (no inline style), `tests/accessibility.test.ts` (whole-tree focus word, `aria-live`, `role`, `Arrow*`), `tests/layering.test.ts`, `tests/install-contract.test.ts` (source-text guards: no file both imports `node:fs` and names `.toml`; `.toml` literals only in `watch-install.ts`; no `readdir`/`glob` under `sources/install/`; message register; `detail` never contains `/`).
- Existing literals typed `InstallSnapshot` that gain `preflight: []`: `tests/bridge-contract.test.ts:100,117`, `src/renderer/ui/install/install-state.test.ts:7`, and any in `src/main/install-bridge.test.ts` / `projections/install.test.ts` that use `toEqual` on a whole snapshot.

## Tasks & Acceptance

**Execution:**
- `src/shared/install.ts` -- add `preflight: HarnessError[]` to `InstallSnapshot` with a doc comment (empty means every prerequisite passed) -- the one type all three sides hold; still types only
- `src/main/sources/preflight/tools.ts` -- new: `createPrerequisiteChecks({ run?, timeoutMs?, cwd?, env? })` returning `{ checkClaude(): Promise<ToolCheck>, checkUv(): Promise<ToolCheck> }`, `ToolCheck = { ok: true } | { ok: false; kind: 'claude-missing' | 'claude-unauthenticated' | 'uv-missing' | 'uv-python-old' | 'check-failed'; detail?: string; diagnostic: string }`, exported `PREFLIGHT_TIMEOUT_MS = 15_000`; argument vectors and classification exactly as in *Boundaries*; the version printed by `uv` is regex-validated before it becomes `detail`; env and cwd injectable (default `process.env`, `os.tmpdir()`) so the live tests can aim at an empty `PATH` or a fake config dir -- one module owns "is this tool usable", and it is where the closed detail vocabulary is enforced
- `src/main/sources/install/resolvers.ts` -- `createInstallSource` gains `exists?: (path) => Promise<boolean>` (default `fs.promises.access`); `resolveRoster` returns `{ ok: true, agents: [] }` without running anything when `<root>/_bmad/scripts/resolve_config.py` does not exist -- "no resolver" is "no agents", and a spawn that can only exit non-zero would name the wrong fault
- `src/main/projections/install.ts` -- `createInstallProjection` takes optional `checks?: { checkClaude; checkUv }` (types from the source), awaited once and memoized; `content()` gains `preflight`; `resolveAll` skips both resolvers when `uv` did not pass and derives `preflight` (claude, uv, then `no-agents` on `agents.length === 0 && errors.length === 0` with `uv` passing) into a per-run list assigned with `errors`; messages, codes and the four-part text are named constants here, `diagnostic` goes to `onDiagnostic` as `<code> · <diagnostic>` and never into `message`/`detail`; with no `checks` supplied both tools count as passing -- the degrade rules stay in one place and the projection stays Electron-free
- `src/main/install-bridge.ts` -- `InstallBridgeDeps.createChecks?: () => PrerequisiteChecks` (default `createPrerequisiteChecks()`), passed to the projection -- lazy per sender exactly as the source is, so no suite that does not call `install:get` spawns `claude` or `uv`
- `src/renderer/ui/install/install-state.ts` -- add `roomState(snapshot, failure): 'pending' | 'blocked' | 'open'` per *Boundaries* -- pure, so the gate is testable with no DOM
- `src/renderer/ui/install/preflight.tsx` -- new `<Preflight snapshot={…} failure={…} />` rendering, in order, each `snapshot.preflight` then each `snapshot.errors` then the failure, every one through `<ErrorLine>` with a stable key; no wrapper role, no heading text of the harness's own, no stylesheet -- the four-part message must be the whole explanation, so the component adds nothing that could stand in for it
- `src/renderer/ui/app.tsx` -- call `roomState(snapshot, installFailure)`; `pending` → keep the null render; `blocked` → `<p>{projectPath}</p>` then `<Preflight>`; `open` → today's preview with its own `snapshot.errors` lines kept (menu-level errors still show beside a working room). Add the comment `Story 1.8 gate: the room opens only when preflight passes; the 1:1 view proper is Story 1.9.` above the block -- the running window is where a human confirms a failing project explains itself
- `src/main/sources/preflight/tools.test.ts` -- fake runner: exact argument vectors (no shell, `claude auth status`, `uv python find --no-project --show-version >=3.11` then the unconstrained form), every matrix row for both tools, the version regex refusing `3.9.6\nrm` and a path, stderr text absent everywhere, both `cwd` neutral -- the taxonomy without a process
- `src/main/sources/install/resolvers.test.ts` -- absent resolver script → `agents: []` with the runner never called and no `.toml` access; present → unchanged
- `src/main/projections/install.test.ts` -- scripted source and scripted checks: all-pass gives `preflight: []`; each tool failure in the right order with the right code; `uv` failure means neither resolver runs and `errors: []` with no `no-agents`; `claude` failure alone still resolves the roster; empty roster with no errors gives exactly the four-part message; a resolver failure with no last good gives no `no-agents`; gaining an agent clears it and bumps `revision`; identical refresh emits nothing; tool checks run once across many refreshes; `JSON.stringify(snapshot())` for every failure contains no `stderr` text, no `/`, no `.toml`; existing whole-snapshot expectations updated for the new field
- `src/main/install-bridge.test.ts` -- injected `createChecks` reaches the projection, is not called until the first `install:get`, and a failing tool arrives in the reply's `snapshot.preflight`
- `src/renderer/ui/install/install-state.test.ts`, `src/renderer/ui/install/preflight.test.tsx` -- `roomState` for null/null, null/failure, preflight non-empty, empty agents, resolver error with empty agents, healthy, healthy with a stale failure; `renderToStaticMarkup` of `<Preflight>`: order, the full four-part text present verbatim and outside any `<details>`, `detail` only inside `<details>`, no `role`/`aria-live`/`style=`/`<button`/`<a `/`<input`
- `tests/preflight-contract.test.ts` -- live, real processes, no dependence on login: `checkUv` against this machine passes (uv is a stated prerequisite, no skip); `checkClaude` with `env.PATH` an empty directory is `claude-missing`; with `CLAUDE_CONFIG_DIR` an empty temp directory (and no API-key variable) is `claude-unauthenticated` when `claude` is installed; a `uv` shim script on a temp `PATH` (exit 2 for `>=3.11`, prints `3.9.6` otherwise) gives `uv-python-old` with `detail: python 3.9.6` through the real spawn path; `checkUv` with an empty `PATH` is `uv-missing`; the spec's source-text guards: no `src/` file names `auth`-credential paths (`.claude/`, `settings.json`, `credentials`), `preflight/` never calls `uv run`/`--print`/`-p`, `HarnessApi` still has three methods, the preflight `message` strings are lower case with no terminal punctuation and no path -- the only check that proves the argument vectors against the real tools
- `tests/persona.test.ts`, `tests/bridge-contract.test.ts` -- add the `preflight: []` field to snapshot literals; in the `app.tsx` preview assertions add that it calls `roomState(`, mounts `<Preflight`, and that the preview rows sit only under the `open` branch -- the gate's mount is asserted from source, as every renderer claim is until Story 1.9 brings a DOM

**Acceptance Criteria:**
- Given `claude` is not on `PATH`, when the window opens, then `snapshot.preflight` holds one `preflight/claude-missing` line naming that and its remedy; and given `claude` is present but signed out, then it holds a different code and a different message naming that and its remedy
- Given `uv` is absent, then `preflight/uv-missing` and no resolver process is spawned; and given `uv` resolves only a Python below 3.11 (or none), then `preflight/uv-python-old` with a different message, `detail` naming what it found, and again no resolver is spawned
- Given a project whose BMad resolves no agents (`agents: {}`, no `[agents.*]`, or no `_bmad/scripts/resolve_config.py`), when `uv` passes, then `preflight` holds `preflight/no-agents` whose `message` contains all four parts — the word `agents`, `this project` with `--setting-sources project,local`, `user` scoped versus project scoped, and `install bmad into this project` — and does not contain `found`
- Given any preflight failure or an empty roster, when the renderer draws, then it shows the project path and the named lines only: no portrait, tile, menu, initials, run-note or preview row is rendered, and nothing in the window reads as a room with no personas
- Given all three checks pass, when the renderer draws, then today's preview opens directly, with no setup step, wizard, button, checklist or question anywhere in the tree
- Given a check that cannot conclude (timeout, unreadable answer), then `preflight/check-failed` names which tool and carries a `detail` from the closed vocabulary, and the timed-out process group is dead afterwards
- Given any failure crossing the bridge, then no `message` or `detail` contains subprocess stderr, a stack trace, a `.toml` path, or any filesystem path
- Given the source tree, when swept, then nothing under `src/` reads a Claude credential or settings file, `HarnessApi` has exactly the three named methods, `outline` appears only in `design/focus.css`, `aria-live` only in `a11y/live-region.tsx`, no `Arrow*` outside `a11y/`, `--z-` names exactly two tokens, and `package.json` gains no dependency
- Given the three startup suites, when `npm test` runs, then none spawns `claude`, `uv` or a watcher, and they pass unchanged
- Given `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, when each runs on a clean checkout, then all four exit zero, `tests/layering.test.ts` is untouched and green, and the suite is larger than the 587 tests Story 1.7 left behind

## Spec Change Log

## Review Triage Log

### 2026-09-29 — Review pass
- verdicts: 34 findings — high 0, medium 3, low 28, false 3, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind Hunter: `claude auth status` may not match how sessions run (Bedrock, Vertex, `apiKeyHelper`) and block a working `claude` — refuted by running it: `ANTHROPIC_API_KEY` reports `loggedIn: true, authMethod: api_key` and `CLAUDE_CODE_USE_BEDROCK=1` reports `third_party`, both exit 0 (`false`, checked).
  - `[low]` `[reject]` Blind Hunter and Edge Case Hunter: any exit 1 from `claude` is read as signed out, so a crashed or too-old CLI is told to sign in — true, but exit 1 is the observed signed-out signal and `runCommand` drops stdout; a version gate is more machinery than a direct correction and the case is unlikely.
  - `[medium]` `[patch]` Blind Hunter, Edge Case Hunter and Verification Gap: a signal-killed first `uv python find` (kind `exit`, no code) falls through to the "no python 3.11" path — real; now inconclusive (`check-failed`, `signal <name>`) and pinned by a test.
  - `[low]` `[patch]` Edge Case Hunter: constrained find fails but the unconstrained one prints a version at or above 3.11, giving "no python 3.11 or newer" with `detail: python 3.14.7` — patched to `check-failed`, tested.
  - `[low]` `[reject]` Blind Hunter and Edge Case Hunter: `exit unknown`, `spawn failed` and an unvalidated `signal <name>` fall outside the spec's listed detail vocabulary — the same words the accepted Story 1.7 resolver source uses, all harness-built from Node values; no unsafe text can reach `detail`.
  - `[low]` `[reject]` Blind Hunter: the tool verdict is memoized including a transient `check-failed`, so a slow cold start blocks the window until relaunch — the spec states relaunch as the fix and rules out a retry control; a retry is a design change.
  - `[low]` `[reject]` Blind Hunter and Edge Case Hunter: two sequential 15 s `uv` finds could leave the window blank for 30 s — the second find runs only after the first exits non-zero (a timeout is inconclusive and stops), so the worst case needs a fast failure followed by a hang.
  - `[low]` `[reject]` Blind Hunter: a Dock-launched app on a minimal `PATH` is blocked with "not on path" — the spec's Never rules out `PATH` repair and the story asks only that the absence be named; the item is recorded in the Story 1.7 deferred work.
  - `[low]` `[defer]` Blind Hunter and Edge Case Hunter: installing BMad (or its resolver script) while the window is open is not noticed, because the watcher's set is the config TOML files and a missing `_bmad` parent is never picked up — pre-existing (Story 1.7 measured and recorded it); the no-agents screen is now where a user meets it, and relaunch resolves it.
  - `[low]` `[reject]` Blind Hunter: no test kills a real timed-out process for the new checks — the checks reuse `runCommand`, whose real-process timeout tests (including a `uv run` group kill) already cover it.
  - `[low]` `[reject]` Blind Hunter: the gate test slices `app.tsx` source and one `Preflight` assertion is weak — the whole renderer is asserted as source text until Story 1.9 brings a DOM; the pure `roomState` and `renderToStaticMarkup` tests carry the behaviour.
  - `[low]` `[reject]` Blind Hunter: the live contract test runs `claude --version` at collection and skips silently without `claude` — the spec allows the skip; the other three live cases need only `uv`.
  - `[low]` `[reject]` Blind Hunter: the blocked screen has no landmark or live announcement — Story 1.9 owns the live region (recorded in Story 1.7); no third surface exists to hang it on.
  - `[low]` `[reject]` Blind Hunter: spec bookkeeping (status, `oversized`, pinned line numbers, test-count criterion, non-macOS shims) — the fix is to edit this build's spec; macOS only in v1.
  - `[low]` `[reject]` Edge Case Hunter: `resolveAll` throwing leaves tool errors out and a stale `preflight` — no source can reject (`runCommand` and the parsers never throw), so no input reaches it.
  - `[low]` `[reject]` Edge Case Hunter: `access` failing with `EACCES` or `ENOTDIR` reads as no agents — `ENOTDIR` really is no resolver, and an unreadable `_bmad` is not a case anything produces.
  - `[false]` `[reject]` Edge Case Hunter: a missing working directory makes `spawn` report `ENOENT` for the binary — `false` for the product: the cwd is `os.tmpdir()`, which exists.
  - `[false]` `[reject]` Edge Case Hunter: a `uv` failure after a good roster leaves agents and menus in place — `false`: the verdict is memoized from the first refresh, so `uv` failing means no resolver has ever run.
  - `[low]` `[reject]` Edge Case Hunter: a tool verdict in flight during `dispose()` writes a diagnostic after teardown — one stderr line for a developer; a branch for a cosmetic effect.
  - `[low]` `[reject]` Edge Case Hunter: prerelease or suffixed version strings fail the version regex — a real too-old prerelease is not a case uv prints; the result is `check-failed`, which still blocks and names the tool.
  - `[medium]` `[patch]` Verification Gap: the real `pathExists` default is never run against a missing script, so the headline no-`_bmad` case could ship with the wrong message unnoticed — test added over a real temp directory with no injected `exists`.
  - `[medium]` `[patch]` Verification Gap: `preflight = tools.errors` on the resolver-failure branch is unpinned — two cases added (claude failing beside a failed roster; `no-agents` cleared by a later failure).
  - `[low]` `[patch]` Verification Gap: the production default for `createChecks` is unpinned — a source-text assertion added that the bridge builds `createPrerequisiteChecks(` and passes `checks` to the projection.
  - `[low]` `[reject]` Verification Gap: the signed-out live test skips without `claude` — same as above.
  - `[low]` `[reject]` Verification Gap: the `app.tsx` gate is verified by source text, not a mount — same as above.
  - `[low]` `[reject]` Intent Alignment: `sprint-status.yaml` is not updated by the diff — repo practice is a separate "mark story done" commit after the feature commit, and this workflow does not own it.
  - `[low]` `[reject]` Intent Alignment: "1:1 view opens directly" is satisfied only by the existing preview — the 1:1 view is Story 1.9's; the gate wraps the scaffold by design.
  - `[low]` `[reject]` Intent Alignment: window-level "no empty room" is asserted by `roomState`, `Preflight` markup and source text, with the running window left to the manual checks — no DOM exists until Story 1.9.
  - `[low]` `[reject]` Intent Alignment: the spec adds `check-failed`, a timeout, memoization and the `access` short-circuit beyond the story's user-level text — needed to make "never an empty room" hold for unreadable tools and for a project with no BMad.
  - `[low]` `[reject]` Intent Alignment: the readings R2–R4 (sprint bookkeeping, workflow trigger, other document) — descriptive; no reading changes what the diff must do.
  - `[low]` `[reject]` Intent Alignment: `claude-unauthenticated` is proven live only where `claude` is installed, and `uv-python-old` through a shim — the spec says so; a real 3.9-only machine is not available here.
  - `[low]` `[reject]` Intent Alignment: the `exit 1` mapping rests on one recorded observation — recorded in the spec and re-observed this pass.
  - `[low]` `[reject]` Intent Alignment: existing `resolvers.test.ts` and `install-contract.test.ts` fixtures now inject `exists` — required by the new no-script rule; the live contract test runs the real default.
  - `[low]` `[reject]` Intent Alignment: preflight tests build fixtures and message strings apart — descriptive only.

## Design Notes

**Why the failures ride the install snapshot instead of a channel of their own.** A second `preflight:get`/`preflight:changed` pair would add two entries to a bridge whose whole rule is "explicitly enumerated", a second revision to reconcile, and a second frame in which the renderer could hold a roster from one and a verdict from the other. The verdict *is* a function of the roster (check 3) plus two facts about tools, so it belongs in the read model that already owns the roster and already emits exactly once per change. The cost is a field named for a concern the type's name does not mention; the doc comment carries it.

**Why `claude auth status` and not `--version` plus something.** One process answers both questions, and it answers the second with an exit code, which survives `runCommand` dropping stdout on failure. Reading a credential file or `~/.claude` would answer the same thing by reaching into the user's home, which nothing here has a contract with. The exit-0-with-`loggedIn: false` branch is defensive: the observed behaviour is exit 1, and a CLI that changes that must not turn "signed out" into "signed in".

**Why `uv python find` and why it can be stricter than reality.** The resolvers declare `requires-python >=3.11`, and `uv run` will *download* a managed interpreter if none qualifies, so a machine with uv and only the system 3.9 could in practice run them. The story states the check as "`uv` resolves a Python below 3.11" and the UX table names the remedy "install a 3.11+ toolchain for it" — and a check that quietly downloads a runtime on first launch is a network side effect the harness's own promises (no network service, nothing written) rule out. So the check is the offline `find`, and the remedy is the specified one. If that proves too strict in practice, loosening it is a decision about downloads, not a bug in this story.

**Why "no resolver script" is an empty roster.** Exit 1 from `resolve_config.py` cannot tell "no config" from "broken config", and a broken config must stay a named resolver error (Story 1.7). But a project with no `_bmad/scripts/resolve_config.py` has nothing to ask at all, and the answer to "which agents does this project resolve" is none — with the four-part explanation being exactly right for it (install BMad here). It is one `access` on a path the source already composes, not a read of any configuration.

**What is deliberately left for later.** Polite announcement of preflight failures needs the live region Story 1.9 mounts (`EXPERIENCE.md:512`). Re-checking tools without a relaunch, and repairing a minimal GUI `PATH`, are not in the story: the Dock-launch case (`deferred-work.md`, Story 1.7) is now *named* — `not on path` — which is what that item asked of this story, and nothing more. The visible layout of the failure screen is deliberately unstyled scaffolding on the existing error-line treatment: the shell that will frame it is Story 1.9.

## Verification

**Commands:**
- `npm test` -- expected: all green, well over 587 tests; `tests/preflight-contract.test.ts` spawns the real `claude` and `uv`
- `npm run lint && npm run typecheck && npm run build` -- expected: all exit zero; `typecheck:node` proves `sources/preflight/` and the projection compile with no DOM type, `typecheck:web` proves `preflight.tsx` and `app.tsx` resolve against `src/shared/install.ts`
- `grep -rnE 'settings\.json|credentials|\.claude/|--print|uv run' src/main/sources/preflight` -- expected: no output outside comments
- `grep -rnE '<button|<input|role=|aria-live|style=' src/renderer/ui/install/preflight.tsx` -- expected: no output
- `git status --short` after `npm run dev` has resolved once -- expected: unchanged

**Manual checks (what no test covers):**
- `npm run dev -- <a directory with no _bmad/>`: the window shows the path and one line stating all four things about agents — never an empty room, never a roster.
- `PATH=/usr/bin:/bin npm run dev -- .`: a `claude · not on path` line and a `uv · not found` line, nothing else.
- `npm run dev -- .` on this project: the preview opens directly with the five colleagues; no extra line, button or question.

## Auto Run Result

Status: done

**What was implemented.** Launch now names what is missing. Main checks `claude` (`claude auth status`: not on path, or signed out), `uv` (`uv python find`: not found, or no Python 3.11+, naming what it did find), and the roster Story 1.7 already resolves. Failures are folded into the install snapshot as a `preflight` list of named `{ code, message, detail? }` lines, each carrying its remedy. A project with no agents gets one line stating all four things FR8 requires, and a project with no BMad resolver script counts as having no agents. If `uv` fails, the resolvers are not run. The renderer's `roomState` opens the room preview only when `preflight` is empty and the roster is not; otherwise it shows the project path and the named lines and nothing else. Nothing is rendered while pending.

**Files changed.**
- `src/shared/install.ts` — `preflight` on `InstallSnapshot`.
- `src/main/sources/preflight/tools.ts` — the `claude` and `uv` checks with their closed detail vocabulary.
- `src/main/sources/install/resolvers.ts` — a missing resolver script answers an empty roster without spawning.
- `src/main/projections/install.ts` — asks each tool once, folds the failures and the no-agents line into the snapshot, skips resolvers when `uv` fails.
- `src/main/install-bridge.ts` — injectable `createChecks`, built lazily with the projection.
- `src/renderer/ui/install/{install-state.ts,preflight.tsx}`, `src/renderer/ui/app.tsx` — `roomState`, the `<Preflight>` list, and the gate.
- Tests: `tools.test.ts`, `preflight.test.tsx`, `tests/preflight-contract.test.ts` (real `claude` and `uv`), and additions to the projection, bridge, resolver, install-state, persona and contract suites.

**Review findings.** 34 findings across four layers — 0 high, 3 medium, 28 low, 3 false. Patched (5 entries): a signal-killed first `uv` find is now inconclusive rather than "too old"; a contradictory 3.11+ version from the unconstrained find is inconclusive; the real missing-script default is tested over a real temp directory; the resolver-failure `preflight` assignment is pinned by two cases; the bridge's production default for the checks is pinned. Deferred: a BMad install created while the window is open is not noticed until relaunch (the watcher gap Story 1.7 measured). Rejected with reasons: `claude auth status` for API-key and Bedrock auth (false, run and observed `loggedIn: true`), exit 1 always meaning signed out, detail words outside the listed vocabulary, memoized transient failures, sequential 15 s `uv` bounds, Dock `PATH`, missing-kill test (covered by `runCommand`'s own), source-text gate assertions, blocked-screen accessibility framing (Story 1.9), spec bookkeeping, unreachable throws and `access` errors, and the descriptive intent-alignment rows.

**Follow-up review recommended: true.** Three medium entries were patched on a first pass. The unverified risk: nothing has seen the running Electron window — the blocked and open screens, the four-part line as a human reads it, and `claude` as a Dock-launched app finds it are proved only by source-text checks, `renderToStaticMarkup` and live checks of the two binaries. Patched counts by verdict: high 0, medium 3, low 2.

**Verification.** `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` all exit zero; the suite is **665 tests across 27 files** (587 across 24 before this story). The spec's greps are clean. The I/O matrix audit found every row covered by a passing test.

**Residual risks.** The three manual checks were not run: opening a directory with no `_bmad/`, `PATH=/usr/bin:/bin npm run dev -- .`, and opening this project. The `exit 1` means signed-out mapping rests on the observed behaviour of `claude` 2.1.274. `uv python find` can be stricter than reality, since `uv run` would download a managed Python.

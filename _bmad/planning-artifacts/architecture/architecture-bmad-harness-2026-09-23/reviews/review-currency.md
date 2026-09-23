# Currency & Reality Review — ARCHITECTURE-SPINE.md

**Target:** `../ARCHITECTURE-SPINE.md`
**Reviewer role:** verification — was every committed technical decision actually researched or
reality-checked, or asserted from training data?
**Date:** 2026-09-23
**Method:** npm registry queries on this machine, a live run of the installed `claude` CLI
(2.1.267) against this project, the local spike record, vendor docs and release notes.

## Verdict

**The claims about the Claude Code CLI, Anthropic's SDK terms, and Electron security are
genuinely researched and hold up under independent check — several are backed by a real
measured spike in this repo. The Stack table is not.** Every row was verified to *exist* and to
be the npm `latest` tag, but the set was never verified to *install and build together*. One
pairing (electron-vite 5 + Vite 8) is flatly unsatisfiable, and two more (TypeScript 7.0,
chokidar 5) carry unaddressed ecosystem consequences.

The Stack table's own header states the method and, inadvertently, the defect:

> Verified against the npm registry on 2026-09-23.

That is a currency check, not a compatibility check. All nine npm rows are confirmed current
and none is deprecated or yanked — so the check that *was* run was run correctly. The gap is
that "latest of everything" was treated as equivalent to "a working toolchain."

---

## 1. Stack table — row-by-row

Queried directly via `npm view <pkg> version` / `dist-tags` / `engines` /
`peerDependencies` on 2026-09-23.

| Row | Spine | npm `latest` | Exists | Current | Deprecated/yanked | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Electron | 44.4.5 | 44.4.5 | yes | yes | no | correct |
| Node (via Electron 44) | 24 | — | — | — | — | correct (24.18.1) |
| Chromium (via Electron 44) | 152 | — | — | — | — | correct (152.0.7977.54) |
| React | 19.3.0 | 19.3.0 | yes | yes | no | correct |
| TypeScript | 7.0.2 | 7.0.2 | yes | yes | no | current, but see §2b |
| Vite | 8.3.0 | 8.3.0 | yes | yes | no | current, but see §2a |
| electron-vite | 5.0.0 | 5.0.0 | yes | yes | no | current, **incompatible** — §2a |
| electron-builder | 26.15.3 | 26.15.3 | yes | `latest` tag, see below | no | fine for this project |
| chokidar | 5.0.0 | 5.0.0 | yes | yes | no | current, but see §1a |
| markdown-it | 15.0.2 | 15.0.2 | yes | yes | no | correct |
| DOMPurify | 3.4.16 | 3.4.16 | yes | yes | no | correct, see §5b |

Nothing in the table is stale, yanked, deprecated, or superseded by a different package. The
choices are all the maintained mainstream option for their job. Electron's own release notes
confirm 44.0.0 ships Chromium 152.0.7977.54, V8 15.2 and Node v24.18.1, so the two derived rows
are right and were not guessed.

### 1a. chokidar 5 / Electron 44 — the Node floor is fine; the module format is the problem

The brief asked specifically whether chokidar 5 being ESM-only and needing Node 20+ is
compatible with the named Electron version. Split answer:

**The Node floor is satisfied, comfortably.** Confirmed from the registry:

```
chokidar@5.0.0  engines: { node: ">= 20.19.0" }   type: "module"
```

Electron 44 bundles Node 24.18.1. No conflict. chokidar 5 shipped 2025-11-25 and raised the
floor to 20.19 precisely because that is where `require(esm)` landed.

**The module format is not addressed anywhere in the spine, and it is the real risk.**
chokidar 5 declares `"type": "module"` with a single `exports` entry and no CJS build.
electron-vite's default main-process output is CommonJS, and its `externalizeDepsPlugin`
externalises `dependencies` rather than bundling them — so `import chokidar from 'chokidar'`
in `src/main/sources/` is emitted as `require('chokidar')` against a package that has no CJS
entry point. That is exactly the failure documented in electron/electron#43532
(*"[ERR_REQUIRE_ESM]: require() of ES Module … is not supported"*), which was **closed as
"not planned"** — the reporter's stack was Vite transpiling `import` to `require()` against an
ESM-only dependency, which is this stack.

Electron 44's Node 24 very likely inherits Node's unflagged `require(esm)`, which would make
this work; but Electron patches the module loader, the project's own ESM tutorial still frames
main-process ESM as "use an `.mjs` entry or `type: module`" and warns that **sandboxed preload
scripts cannot use ESM imports at all**, and I could not find a statement confirming
`require(esm)` is supported in Electron 44 main. So the honest status is *unproven*, not
*broken* — which is precisely the kind of thing a spine should name rather than leave to be
discovered at first `npm run dev`.

This is load-bearing, not cosmetic: the *State — watcher* convention commits to atomic
temp-file rename handling and ~400ms coalescing, and AD-2 makes the watcher the sole authority
for the entire outputs rail. The spine should state which of the three resolutions it takes:

1. build the main process as ESM (electron-vite supports it; then AD-13's preload must stay
   CJS/bundled because sandboxed preloads have no ESM context), or
2. remove chokidar from `externalizeDepsPlugin` so it is bundled into the main chunk, or
3. load it via dynamic `import()` behind the `sources/fs` adapter boundary — which the layering
   already makes cheap, since nothing above `sources/` touches it.

Option 3 costs the least and fits the existing seams. Any of the three is fine; silence is not.

### 1b. electron-builder 26.15.3 — correct pick, minor tag oddity

`npm view electron-builder dist-tags` returns:

```
latest: 26.15.3   next: 27.0.0-alpha.8   v26: 26.16.1
```

So `26.15.3` is genuinely the `latest` tag, but `26.16.1` (2026-09-07) is a newer v26 release
sitting under a separate tag. The delta is a macOS **signing** fix: 26.15.6 introduced a
keychain bug where `app-builder-lib` created a temp keychain with a random password but passed
the `.p12` password to `set-key-partition-list`; 26.16.1 fixes it. The spine explicitly defers
signing and notarization and builds unsigned local packages, so this does not bite. **Low.**

electron-builder 26 does support Electron 44. Worth knowing, though not a defect here: Electron
44 removed Windows ia32 and Linux armv7l targets and electron-builder 26 fails fast on a
request for them — irrelevant while the spine is macOS-only, and it becomes relevant if the
deferred "Windows and Linux support" item is ever taken up.

---

## 2. Compatibility between pinned versions

### 2a. CRITICAL — electron-vite 5.0.0 cannot be used with Vite 8.3.0

This is the one finding that stops a build before it starts. Straight from the registry:

```
electron-vite@5.0.0        peerDependencies: { vite: "^5.0.0 || ^6.0.0 || ^7.0.0", ... }
electron-vite@6.0.0-beta.1 peerDependencies: { vite: "^6.0.0 || ^7.0.0 || ^8.0.0", ... }
```

**Vite 8 is not in electron-vite 5's supported peer range.** Vite 8 support arrives only in
electron-vite 6, which is still `beta` (`dist-tags: latest 5.0.0, beta 6.0.0-beta.1`).

This is not a cosmetic peer warning that `--legacy-peer-deps` waves away. Vite 8 (stable
2026-03-12) replaced the Rollup + esbuild split with a single Rust bundler, Rolldown:

- Rollup is no longer in the dependency tree at all — there is nothing to fall back to.
- `build.esbuildOptions` was removed; config flows through `build.rolldownOptions`.
- Several Rollup plugin hooks are gone: `shouldTransformCachedModule`, `resolveImportMeta`,
  `renderDynamicImport`, `resolveFileUrl`.
- The object form of `output.manualChunks` is unsupported and the function form deprecated.

electron-vite exists to drive three Rollup-shaped builds (main, preload, renderer) and to
inject its own plugins into them. It also still carries `esbuild: "^0.25.11"` as a direct
dependency — the bundler Vite 8 dropped. A wrapper this deep into the build pipeline is the
least likely thing to survive a bundler swap untested, which is why its own maintainer gated
Vite 8 behind a new major.

**The conflict is also unsatisfiable at install time, from the other side.** The renderer needs
a React plugin, and the current one has narrowed to Vite 8 only:

```
@vitejs/plugin-react@6.1.1      peerDependencies: { vite: "^8.0.0", ... }
@vitejs/plugin-react-swc@4.3.3  peerDependencies: { vite: "^4 || ^5 || ^6 || ^7 || ^8" }
```

So with `@vitejs/plugin-react`, electron-vite 5 demands Vite ≤7 while the React plugin demands
Vite 8 — no single Vite version satisfies both, and npm will refuse the install rather than
warn.

**Two coherent resolutions; the spine must pick one and say so:**

| Option | Change | Cost |
| --- | --- | --- |
| A — hold Vite back | Vite `7.3.6` (the `previous` dist-tag) + electron-vite `5.0.0` + `@vitejs/plugin-react-swc@4.3.3` | Every version is stable and in-range. Forgoes Rolldown build speed. **Recommended.** |
| B — move electron-vite forward | Vite `8.3.0` + electron-vite `6.0.0-beta.1` + `@vitejs/plugin-react@6.1.1` | In-range, but the build tool is a beta on a project whose own deployment section is "one developer's macOS machine" — survivable, but a beta build tool is a poor place to spend risk when the real risk budget belongs to AD-18's stop semantics. |

Option A is the better trade here. Nothing in the spine depends on Vite 8; the renderer is a
single small React surface and build speed is not a named concern anywhere in the document.

**Severity: critical.** Not because it is subtle — it is the first thing `npm install` will
say — but because it is the exact class of error the Stack table's "Verified against the npm
registry" line claims to have ruled out, which means the verification method itself needs
correcting, not just this row.

### 2b. HIGH — TypeScript 7.0.2 has no programmatic compiler API, and the spine's testing plan needs one

TypeScript 7.0 is real, stable, and correctly described: GA on 2026-07-08 as 7.0.2, the first
stable build of the Go-native compiler, 8–12x faster full builds, type-checking semantics
structurally identical to 6.0. The version is not asserted from training data — it checks out.

What the spine does not account for is the API hole that shipped with it. **TypeScript 7.0 does
not expose a public programmatic compiler API** (`ts.createProgram`, `ts.transform`,
`ts.factory`). That API is planned for 7.1, whose iteration plan (2026-07-31) targets a **beta
in October 2026** — after this spine's date. Everything that imports the compiler as a library
is blocked on 7.0:

- **typescript-eslint** type-aware linting
- **ts-jest**, **ts-morph**
- the template type-checkers behind Vue, Svelte, Astro (not relevant here)

Why this matters for *this* spine specifically, rather than generically:

- AD-4 makes `fold/` pure functions and says *"Determinism is asserted in tests."* AD-16 says
  the same for portraits. There is a real test suite implied, and no runner is named. If it is
  Vitest, fine — Vitest transpiles via esbuild/oxc and does not need the TS API. If anyone
  reaches for ts-jest, it does not run on 7.0.
- AD-14 declares *"A literal colour, dimension, radius or font stack in a component is a
  defect."* That is a lint rule waiting to be written, and the layering rules in the Design
  Paradigm (*"Nothing in `ui/` may reach `sources/`"*, *"No arrow points upward"*) are the
  classic case for `eslint-plugin-boundaries` or typescript-eslint. Import-path boundary rules
  can be done without type information; anything type-aware cannot, on 7.0.

`tsc` itself for typechecking is fine, and Vite never invokes `tsc` anyway. The workaround if
type-aware lint is wanted before 7.1: alias TypeScript 6.0 for the tooling via the compat
package while `tsc` stays on 7. Either way the spine should name the decision rather than pin
`7.0.2` and leave the consequence to be found.

**Severity: high** — not a broken build, but a committed decision with a real, currently
unresolved ecosystem cost that the document shows no evidence of having weighed.

### 2c. React 19.3 — fine

`react@19.3.0` and `react-dom@19.3.0` are both `latest`; `react-dom@19.3.0` peers
`react: "^19.3.0"`; `@types/react@19.3.0` matches. No issue with either Vite 7 or Vite 8 — the
constraint is on the *plugin*, covered in §2a. AD-15's requirement (coalesce deltas in main,
commit to one node per animation frame, never drive React state from an individual
`input_json_delta`) is sound React 19 practice and independent of version.

### 2d. electron-builder 26 with Electron 44 — fine

Supported. Covered in §1b.

---

## 3. Claude Code CLI claims (AD-18, AD-5, AD-6)

**This section is the strongest part of the document.** The claims are not asserted — most
trace to a real, dated spike in this repo
(`/Users/sherifmatta/Learnings/bmad-harness/_bmad/spikes/spike-skill-execution-model.md`) with
measured numbers, and they survive independent re-verification against the installed CLI.

### 3a. The flags — all five verified present, and exercised live

Installed CLI: `claude 2.1.267` at `/opt/homebrew/bin/claude`. Every flag in AD-18 exists in
`claude --help`:

| Flag | Status | Help text |
| --- | --- | --- |
| `--output-format stream-json` | present | choices `text`, `json`, `stream-json`; print mode only |
| `--input-format stream-json` | present | choices `text`, `stream-json`; *"realtime streaming input"*, print mode only |
| `--include-partial-messages` | present | *"only works with --print and --output-format=stream-json"* |
| `--verbose` | present | *"Override verbose mode setting from config"* |
| `--setting-sources project,local` | present | *"Comma-separated list of setting sources to load (user, project, local)"* |

I then ran the real thing in this project:

```
claude -p "/bmad-agent-pm" --output-format stream-json --include-partial-messages \
  --verbose --setting-sources project,local --permission-prompts none --tools "Read"
```

214 stream rows, `rc=0`. AD-18's three "load-bearing" flags behave as claimed:

- `--include-partial-messages` produced **165 `stream_event` / `content_block_delta` rows**.
  Without it there would be no incremental prose, exactly as AD-18 says — CAP-5 has no stream.
  Confirmed, not assumed.
- `--setting-sources project,local` resolved the project's skills (see §3c for a correction to
  the *reasoning*, though the flag itself works).
- `--input-format stream-json` — not exercised in my run; AD-18's description of it as "what
  keeps the session alive" matches the documented realtime-streaming-input semantics and the
  long-lived-session pattern, and is the correct read.

### 3b. `-p "/bmad-agent-<x>"` activates the agent skill — VERIFIED LIVE

This is the single most load-bearing claim in the spine (AD-18 makes the persona session the
unit of interaction; AD-9, AD-10, AD-11 and CAP-2/3/4/8 all hang off it), so I ran it rather
than reasoned about it. It works. The run returned John, the PM persona, in character, and the
response independently corroborates three *other* invariants:

- AD-8 (resolution, not raw TOML): the reply reports it checked
  `_bmad/custom/bmad-agent-pm.toml` and `.user.toml` for overrides, found none, and therefore
  treated base `customize.toml` as the resolved block — i.e. the resolver layering AD-8
  mandates is BMad's real behaviour, not an invention.
- AD-9 (menu entries): it printed the numbered menu with `Code` and `Description` columns and a
  skill per row, matching AD-9's `code` / `description` / `skill`-or-`prompt` shape.
- AD-10 (roster from config): it resolved project identity and the planning-artifacts path from
  config.

BMad is installed at **project scope** here — `<project>/.claude/skills/bmad-agent-pm/` and 28
sibling `bmad-*` skills — which is what makes `--setting-sources project,local` sufficient.

### 3c. MEDIUM — AD-18's justification for `--setting-sources project,local` is stated backwards

The flag is right. The stated reason for it is not, and the wrong reason hides a real failure
mode. AD-18 says:

> `--setting-sources project,local` is what makes the subprocess discover the *target project's*
> `.claude/skills/` and nothing of the harness's (CAP-1's mechanism; omitting it leaks harness
> skills into the user's project)

The subprocess is spawned with the **target project as cwd**. Project and local setting sources
are resolved relative to that cwd, so the harness's own `.claude/` was never in scope and could
not leak in regardless of this flag. What `project,local` actually does, relative to the CLI
default, is **exclude the `user` source** — `~/.claude/skills/`, `~/.claude/CLAUDE.md`, and
user-level output styles. (Per the setting-sources semantics: these gate filesystem discovery
of CLAUDE.md, skills and output styles, not just `settings.json` merging.)

That is a legitimate thing to want — it keeps the user's personal skills out of a BMad persona
session, which serves CAP-1's determinism. But it produces a failure the spine has not
considered: **if BMad is installed at user scope (`~/.claude/skills/`) or as a plugin rather
than at project scope, `/bmad-agent-pm` resolves to nothing** and every persona tile is dead.
AD-17's preflight checks `claude` on PATH and authenticated, and `uv` + Python 3.11+ — it does
**not** check that the agent skills the roster names are actually resolvable under the setting
sources the harness passes.

Concrete remedy, cheap and in keeping with AD-17's "name what is missing" rule: after resolving
the roster from `_bmad/config.toml` (AD-10), verify that at least one named agent skill resolves
under `project,local` before presenting persona tiles; if not, report *"BMad agent skills were
not found at project scope"* with the remedy, rather than opening to an empty room — the exact
outcome AD-17 exists to prevent.

Rewrite the AD-18 clause to say what the flag does: *pins discovery to the target project and
excludes the user's own `~/.claude/`, so a persona session is reproducible across machines.*

### 3d. SIGINT `rc=0` in ~250ms — grounded in a real measurement, and honestly scoped

Traced to source. `_bmad/spikes/spike-skill-execution-model.md` (Run C, 2026-09-23) records:

> SIGINT sent to `claude -p` immediately after the third tool call was announced:
> - Process exited **rc=0 within 250ms**.
> - Final `result`: `subtype: "error_during_execution"`, `is_error: true`,
>   `stop_reason: "tool_use"`, with `duration_ms`.
> - The in-flight tool got `tool_result` with `is_error: true` — *"The user doesn't want to
>   proceed with this tool use. The tool use was rejected"*.
> - `doc.md` on disk was **byte-for-byte the last successful write**: 3,373B, §1 and §2
>   complete, §3 absent.

This is measured, not asserted. It also independently supports AD-5 (confirm on `tool_result`,
never `tool_use` — Run C proved an announced `Write` can fail to land) and AD-12 ("a stopped
run's partial file is already byte-for-byte the last successful write, so there is nothing to
revert").

**And the spine is honest about the limit of that evidence**, which is the behaviour this review
exists to reward. AD-18's *Open risk* and the Open Items entry both say the spike measured
killing a one-shot `claude -p` **process**, and that interrupting one turn of a long-lived
`--input-format stream-json` session without ending it is **unverified**. The `.memlog.md` says
the same. That is the correct status, correctly surfaced, with the correct consequence named
(if impossible, stopping costs the session and the trade is shown to the user, never hidden).
No change needed — but it remains the right first spike, as Open Items already says.

### 3e. `result` row fields — VERIFIED LIVE, plus one field the spine should know about

My live run's terminal `result` row carried, among others:

```
subtype, is_error, stop_reason, duration_ms, num_turns, terminal_reason,
total_cost_usd, usage, session_id, subagent_stats, permission_denials
```

On a clean finish: `subtype: "success"`, `is_error: false`, `stop_reason: "end_turn"`. The
spike's stopped-run counterpart was `subtype: "error_during_execution"`, `is_error: true`,
`stop_reason: "tool_use"`. So AD-18's rule — *"`subtype: "error_during_execution"` with
`is_error: true` and a `stop_reason` marks stopped or failed, its absence marks finished"* — is
confirmed at the field level from both directions. `stop_reason` is present on success too, so
the discriminator is `subtype`/`is_error`, not the mere presence of `stop_reason`; the spine's
phrasing reads as requiring all three together, which is fine, but `fold/run` should key off
`subtype` and treat `stop_reason` as detail.

**Worth adding:** the row also carries **`terminal_reason`**, which the spine does not mention.
Before `fold/run` is written, check whether it is a cleaner single terminal discriminator than
the `subtype` + `is_error` pair — it would simplify AD-18's rule and CAP-12's fold. **Low**, but
free to check.

AD-18's *"Exit code is **not** the signal"* is well-founded: my clean run and the spike's
SIGINT'd run both exited `rc=0`. Correct and non-obvious.

### 3f. MEDIUM — AD-6 and the `--forward-subagent-text` flag

AD-6 says: *"Anything carrying `parent_tool_use_id` belongs to a subagent. Only main-thread
`text_delta` may render as a persona turn."*

The marker is right — current docs confirm *"Messages from within a subagent's context include a
`parent_tool_use_id` field."* But the installed CLI has a flag AD-18's command line omits:

```
--forward-subagent-text   Forward subagent text and thinking blocks as assistant/user
                          messages with parent_tool_use_id set (only works with --print
                          and --output-format=stream-json)
```

Two consequences, one reassuring and one not:

- **Reassuring:** without the flag, subagent *text* is not forwarded at all, so AD-6's negative
  rule is safe by default. The persona-voice violation AD-6 guards against cannot occur unless
  someone adds the flag. AD-6 should say so — a defensive invariant is stronger when it records
  that the default already holds, because that stops a future contributor adding
  `--forward-subagent-text` for debugging and silently breaking CAP-3's illusion.
- **Not reassuring:** AD-6's *positive* requirement — *"Subagent activity renders on the card
  from `system/task_progress` (description, tokens, `last_tool_name`, duration)"* — rests on a
  single spike observation. My live run emitted `system/init`, `system/status` and
  `system/thinking_tokens` but **no `system/task_progress`** (no subagents ran, so this is not
  disconfirming). The *State — dead air* convention makes this load-bearing: the parallel
  subagent phases are named as *the* risk window, and `task_progress` plus `.memlog.md` are the
  only things filling it. Re-confirm `system/task_progress` still emits under CLI 2.1.267 in the
  same spike that settles the SIGINT question — one run covers both.

---

## 4. The Anthropic terms claim (Deferred — "The Agent SDK as the runtime")

The spine rejects the Agent SDK on this basis:

> Rejected on authentication, not ergonomics: Anthropic's terms require third-party products
> built on the Agent SDK to use API-key auth rather than the user's claude.ai login, and
> spawning the `claude` binary the user already authenticated does not.

**Accurate, as of now.** Anthropic's Legal and Compliance documentation added an
"Authentication and credential use" section on **2026-02-19** stating that developers building
products or services that interact with Claude's capabilities, **including those using the Agent
SDK, should use API key authentication** through Claude Console or a supported cloud provider;
that OAuth authentication on Free/Pro/Max is intended exclusively for Claude Code and
Claude.ai; and that using those OAuth tokens in any other product, tool or service — the Agent
SDK included — violates the Consumer Terms. Anthropic also does not permit third-party
developers to offer claude.ai login for their products without prior approval.

The second half of the spine's sentence — that spawning the already-authenticated `claude`
binary sits outside that — is **also supported**, not merely convenient reasoning. Anthropic's
position is that running the Claude Code CLI on your own computer is unchanged: it is
Anthropic's own product, built for scripted and automated use, and the Consumer ToS exempts it
from the prohibition on automated access. The spike reached the same conclusion for the same
reason and recorded it as a constraint, not a preference.

One nuance the spine could add, cheaply, at the point where it is actually relevant. The
exemption is clearest for *the user running it on their own machine* — which is precisely this
project's stated deployment ("One environment: a developer's own macOS machine"), so the
rejection is sound as written. The grey zone opens only if the harness is ever **distributed**:
a third-party GUI shipped to other people that drives their CLI to route Pro/Max credentials
starts to resemble "offering claude.ai login for their product," independent of whether the
Agent SDK is involved. The Deferred entry's revisit trigger is *"only if the harness ever ships
carrying its own key"* — worth widening to *"if the harness is ever distributed to users other
than its author, revisit the auth posture regardless of which runtime it uses."* That also
aligns it with the Deferred "Signing, notarization and distribution" entry, whose revisit
trigger is already *"when someone other than the author is meant to install it."* **Low** —
a precision improvement to a correct decision, not a correction.

---

## 5. Electron security (AD-13)

### 5a. `contextIsolation` / `nodeIntegration` / `sandbox` — correct, current, and the right shape

AD-13's *"`contextIsolation` on, `nodeIntegration` off, `sandbox` on"* is exactly the current
recommended baseline and has been the Electron default since 20.0.0. The full 2026 secure
baseline is `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`,
`webSecurity: true`, `allowRunningInsecureContent: false` — the three AD-13 names are the three
that matter, and the other two are defaults that nothing in this design turns off.

Two things AD-13 gets right that checklists usually miss, and that indicate this was researched
rather than copied:

- **`contextIsolation` alone is necessary but not sufficient.** Effective isolation needs a
  minimal preload surface and an IPC allowlist enforced in *main*, not the renderer. AD-13
  states exactly that: *"Every privileged capability crosses one narrow, explicitly enumerated
  preload API — no generic `invoke(channel, …)` passthrough."* The `{ code, message, detail? }`
  error convention and *"Raw subprocess stderr never reaches the renderer"* close the usual
  information-leak seam on the same boundary.
- **The structural claim is enforced, not just asserted.** *"`REND` and `DOC` have no edge to
  `FS`, `CLI` or `INST`. That absence is AD-13."* Tying the invariant to the process diagram is
  the right way to make it reviewable.

One additive note, consistent with AD-13's own logic: `sandbox: true` means **sandboxed preload
scripts run as plain JavaScript with no ESM context and cannot use ESM imports**. Whatever is
decided for chokidar in §1a, the preload build must stay CJS/bundled. Worth one clause in AD-13
so the two decisions are not made independently.

### 5b. markdown-it + DOMPurify — a sound pairing, with the right caveats

Sound, and appropriately belt-and-braces for Chromium 152. Both packages are current
(`markdown-it@15.0.2`, `dompurify@3.4.16`, both `latest`, neither deprecated; markdown-it keeps
a `v14-legacy` tag, which the spine correctly does not use). The layering:

- `markdown-it` with `html: false` — AD-13 says *"HTML disabled"* — escapes raw HTML in the
  source rather than passing it through, so the primary injection vector is closed before
  DOMPurify sees anything.
- markdown-it's built-in `validateLink` already blocks `javascript:`, `vbscript:` and `file:`
  URLs by default, covering the vector that survives `html: false`.
- DOMPurify then catches what a custom renderer rule, a plugin, or a future `html: true`
  regression would let through, and handles link `target`/`rel` hygiene.

Three caveats worth recording in AD-13 rather than leaving implicit:

1. **Order matters and should be stated.** Sanitize the *rendered HTML string* immediately
   before insertion — AD-13 says *"sanitized with DOMPurify before insertion"*, which is right;
   keep it that way rather than sanitizing markdown source.
2. **DOMPurify needs a DOM.** It must run in the renderer against the window it is sanitizing
   for. That is compatible with `sandbox: true` (DOMPurify is pure JS, no Node APIs), but it
   means sanitization cannot be moved into main "for safety" later without a jsdom dependency.
   Given AD-13 already routes document content main → renderer, note that the renderer is the
   correct home for this step.
3. **`dompurify@3.4.16` was published 2026-09-23 — the same day as this spine.** Pinning a
   same-day release is a small, avoidable risk (3.4.15 is 2026-09-06). Not a defect; consider a
   caret range or the prior patch if the build wants a settled floor. **Low.**

Given `html: false` plus `validateLink`, DOMPurify here is defence in depth rather than the
primary control — which is the correct posture for untrusted project content, and matches
AD-13's framing that *project content is untrusted*.

---

## Findings, by severity

| # | Severity | Finding | Where |
| --- | --- | --- | --- |
| 1 | **critical** | `electron-vite@5.0.0` peers `vite ^5\|\|^6\|\|^7`; the spine pins Vite `8.3.0`. Vite 8 support exists only in `electron-vite@6.0.0-beta.1`. Compounded: `@vitejs/plugin-react@6.1.1` peers `vite ^8.0.0` only, so no Vite version satisfies both — the install fails, it does not merely warn. Vite 8 also swapped Rollup for Rolldown wholesale (Rollup gone from the tree; `build.esbuildOptions` removed; four Rollup hooks dropped), and electron-vite 5 still depends on `esbuild@^0.25`. Fix: Vite 7.3.6 + electron-vite 5 + `@vitejs/plugin-react-swc@4.3.3` (all stable, all in range), or accept a beta build tool. | Stack, §2a |
| 2 | **high** | TypeScript `7.0.2` ships without a public programmatic compiler API (planned for 7.1; beta targeted Oct 2026). typescript-eslint type-aware linting, ts-jest and ts-morph cannot run on it. AD-4 and AD-16 both commit to asserted-in-tests determinism and the Design Paradigm's layering rules are lint-shaped, but no runner or linter is named and the constraint is unacknowledged. `tsc` itself is fine. | Stack, §2b |
| 3 | **high** | chokidar `5.0.0` is ESM-only (`"type": "module"`, no CJS entry). The Node floor is fine — Electron 44 bundles Node 24.18.1, above chokidar's 20.19 — but electron-vite's default CJS main output with externalised deps emits `require('chokidar')`, the documented `ERR_REQUIRE_ESM` path (electron/electron#43532, closed "not planned"). Unproven rather than proven-broken, and unaddressed either way, while AD-2 makes the watcher the sole authority for the whole rail. Pick one: ESM main, bundle it, or dynamic `import()` inside `sources/fs`. Related: `sandbox: true` preloads cannot use ESM at all. | Stack, §1a, §5a |
| 4 | **medium** | AD-18's justification for `--setting-sources project,local` is backwards. The subprocess's cwd is the target project, so harness skills were never in scope; what the flag actually excludes is the `user` source (`~/.claude/skills/`, `~/.claude/CLAUDE.md`). The flag is correct — verified working, BMad is project-scoped here — but a user-scoped or plugin-scoped BMad install would resolve *no* agent skills, and AD-17's preflight does not check skill resolvability. That is AD-17's own "empty room" failure, unguarded. | §3c |
| 5 | **medium** | AD-6's subagent handling has a gap at each end. The CLI's `--forward-subagent-text` gates forwarding of subagent text/thinking — so AD-6's negative rule is safe by default, which AD-6 should record to stop a contributor adding the flag and silently breaking CAP-3. Conversely AD-6's positive requirement (`system/task_progress` feeding the card) rests on one spike observation and was not reproduced in my run; the *dead air* convention makes it load-bearing. Re-confirm it in the same spike that settles SIGINT. | §3f |
| 6 | low | `result` rows also carry `terminal_reason`, unmentioned in AD-18; may be a cleaner single terminal discriminator than `subtype` + `is_error` for `fold/run`. Also: `stop_reason` is present on success too, so `subtype` is the real discriminator. | §3e |
| 7 | low | `dompurify@3.4.16` was published the same day as this spine. Pinning a same-day release is avoidable risk; 3.4.15 is 2026-09-06. | §5b |
| 8 | low | electron-builder `latest` is `26.15.3`, but `26.16.1` exists under the `v26` tag with a macOS signing keychain fix. Irrelevant while signing is deferred; relevant if the deferred distribution item is taken up. | §1b |
| 9 | low | The Agent SDK rejection is correct for a personal build. Widen its revisit trigger from "if the harness ever ships carrying its own key" to "if the harness is ever distributed to anyone but its author" — matching the distribution entry's existing trigger. | §4 |

## Verified sound — no action

- All nine npm rows exist, are the current `latest`, and none is deprecated, yanked or
  superseded. Electron 44 → Node 24.18.1 → Chromium 152 is correct.
- React 19.3.0 / react-dom 19.3.0 / @types/react 19.3.0 are mutually consistent.
- electron-builder 26 supports Electron 44.
- All five AD-18 flags exist in the installed CLI 2.1.267 and were exercised in a live run;
  `--include-partial-messages` produced 165 `content_block_delta` rows, confirming CAP-5's
  premise empirically.
- `-p "/bmad-agent-pm"` activates the agent skill — verified live. The response independently
  corroborates AD-8 (resolver layering), AD-9 (menu shape) and AD-10 (roster from config).
- `result` row fields `subtype` / `is_error` / `stop_reason` confirmed from both a success run
  (live) and a stopped run (spike).
- SIGINT `rc=0` in ~250ms with `subtype: "error_during_execution"`: measured in a real spike in
  this repo, and the spine correctly scopes the evidence and flags the untested part as an open
  risk with a named consequence.
- The Anthropic Agent SDK API-key claim is accurate as of the 2026-02-19 policy, and the
  local-CLI exemption genuinely supports the rejection's reasoning.
- AD-13's `contextIsolation` / `nodeIntegration` / `sandbox` settings are the current correct
  baseline, and the narrow-enumerated-preload and main-side-allowlist requirements go beyond a
  copied checklist.
- markdown-it (`html: false`, default `validateLink`) + DOMPurify is a sound layered
  sanitization pairing for Chromium 152.

## Recommended edits

1. **Fix the Stack table's build-tool rows** — Vite `7.3.6`, electron-vite `5.0.0`, and name
   `@vitejs/plugin-react-swc@4.3.3` explicitly, since the plugin choice is now load-bearing.
2. **Change the Stack table's verification note** from *"Verified against the npm registry"* to
   a statement that the set was resolved together — e.g. *"Peer ranges resolved with a clean
   `npm install` on 2026-09-23"* — and actually run it. The wording is what let finding 1
   through.
3. **Add a line to the Stack table or AD-4** recording the TypeScript 7.0 programmatic-API gap
   and what it costs (no type-aware lint, no ts-jest, until 7.1).
4. **Name the chokidar module-format decision** in the *State — watcher* convention, and add a
   clause to AD-13 that the preload build stays CJS because sandboxed preloads have no ESM
   context.
5. **Rewrite AD-18's `--setting-sources` clause** to say what the flag does (pins discovery to
   the target project, excludes the user's `~/.claude/`), and **extend AD-17's preflight** to
   verify at least one rostered agent skill resolves under those sources.
6. **Add to AD-6** that subagent text is not forwarded by default and
   `--forward-subagent-text` must not be added, and mark `system/task_progress` for
   re-confirmation in the SIGINT spike.

---
title: 'A running application on the pinned stack'
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
baseline_commit: '45878f2d1d9a1f69bd8ab683b12d8cb327a196ca'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository holds only planning artifacts — no `package.json`, no `src/`, no build. Every remaining Epic 1 story assumes a working, correctly layered Electron application on an exact dependency set, and no starter template exists for it, so without this scaffold each later story renegotiates the stack.

**Approach:** Hand-roll an `electron-vite` + React + TypeScript application against the NFR11 set installed as a set, lay down the prescribed six-layer source tree, make the layering rule a lint error rather than a convention, and prove the four verbs in the story title — builds, runs, tests, packages — each with a command.

## Boundaries & Constraints

**Always:**
- The twelve NFR11 rows resolve to those exact versions, installed as one set, no unmet peers.
- The prescribed tree exists in full: `src/main/{sources,fold,projections,windows}`, `src/preload/`, `src/shared/`, `src/renderer/{ui,design}`, `fixtures/runs/`.
- `contextIsolation` on, `nodeIntegration` off, `sandbox` on; the preload exposes an enumerated API, no `invoke(channel, …)` passthrough.
- Main builds CJS with externalised deps — the reason chokidar is held at 4.x.
- `kebab-case.ts` filenames; one exported concept per `fold/` module; `fold/` takes no I/O and no wall clock except as an injected value.
- macOS-only calls live in `src/main/windows/` and nowhere else.
- **Decided:** the project path arrives as a CLI argument when one is supplied (`npm run dev -- <path>`, `open -a <app> --args <path>`); with no argument the app opens the native macOS folder chooser. Closing a project window returns to the chooser rather than quitting; cancelling the chooser quits. One window per project, always.

**Never:**
- No tokens, colours, dimensions or stylesheet of any kind — `tokens.css` is Story 1.3, and a literal visual value in a component is a defect. The placeholder renderer ships unstyled.
- No bridge contract, domain events or IPC beyond what the window needs to exist — `src/shared/` stays empty (Story 2.2).
- No watcher, resolver invocation, preflight check or persona anything (Stories 1.5–1.8).
- No signing, notarization, auto-update channel, installer matrix or non-macOS target.
- `fixtures/runs/` is created empty; the corpus is recorded later.
- Nothing is written inside the project root being viewed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Layering violation | a file under `renderer/ui/` importing from `main/sources/`, `main/fold/` or `main/projections/` | `npm run lint` exits non-zero | reported as an ESLint error, never a warning |
| Upward import | a file under `main/fold/` importing from `main/sources/` | `npm run lint` exits non-zero | as above |
| Legal import | `renderer/ui/` importing from `renderer/design/` or `src/shared/` | lint passes | N/A |
| Elapsed derivation | `startedAt` epoch ms, injected `now` | non-negative elapsed ms | `now` before `startedAt` clamps to 0 rather than returning negative time |
| Launch with a path | a directory path as the first CLI argument | exactly one window opens for that project, no chooser shown | a path that is not an existing directory is a named startup error, not a silent fallback to the chooser |
| Launch with no path | no CLI argument | native folder chooser opens; the chosen directory opens one window | cancelling the chooser quits the app |
| Window closed | the project window is closed | the chooser reopens | N/A |

</frozen-after-approval>

## Code Map

Greenfield — every path below is new. Nothing in the repository is modified.

- `_bmad/planning-artifacts/epics.md:533-559` -- the seven ACs this story answers. Read-only.
- `.../architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md` -- `:230-249` stack table with a "why this pin" column; `:281-295` binding tree; `:42-65` layer order and prohibitions; `:212-226` naming conventions. Read-only; the source for `DEPENDENCIES.md`.
- Registry facts verified during planning, so the AC's three hold-back reasons are confirmed rather than assumed: all twelve pins resolve; `typescript-eslint@8.70.1` peers `typescript >=4.8.4 <6.1.0`; `electron-vite@5.0.0` peers `vite ^5||^6||^7` and `@swc/core ^1.0.0`; `chokidar@5` is `type: module`; `vitest@5.0.1` peers `vite ^6.4||^7||^8` and `@types/node ^22||>=24`. Node 24.19.0 / npm 11.17.0 satisfy every `engines` field.
- Unpinned by NFR11, chosen here and recorded in `DEPENDENCIES.md` as such: `eslint` 10.11.0 (inside typescript-eslint's peer range), `eslint-plugin-react-hooks` 7.1.1, `@types/react` and `@types/react-dom` 19.3.0, `@types/node`, `@types/markdown-it` 14.2.0.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `package-lock.json` -- install the twelve pins as exact versions in one `npm install` invocation, plus the type packages and lint toolchain; scripts `dev`, `build`, `test`, `lint`, `typecheck`, `package`; no `"type": "module"` so main stays CJS -- the set installs together or not at all
- [x] `scripts/check-pins.mjs` -- assert each NFR11 row's resolved version in `package-lock.json`, exit non-zero on drift; wire it into `npm run lint` or its own script -- the pin set is verifiable by command, not by reading
- [x] `DEPENDENCIES.md` -- record each of the three hold-backs with its verified reason, note the unpinned additions, and state that the set is bumped together or not at all -- the AC's "note in the repository"
- [x] `electron.vite.config.ts`, `vitest.config.ts`, `tsconfig.json` + per-target tsconfigs -- three build targets with `@vitejs/plugin-react-swc`; renderer root pointed at `src/renderer/` so the prescribed tree is not bent to the tool's default `src/renderer/src/`; Vitest configured separately from the electron-vite build -- the tree is binding, the tool is not
- [x] `eslint.config.mjs` -- typescript-eslint flat config; per-directory `files` blocks with `no-restricted-imports` patterns encoding the layer prohibitions at severity `error`, covering both relative and aliased specifiers -- lint fails the build rather than warning
- [x] `src/main/index.ts`, `src/main/windows/main-window.ts` -- app entry and the single project window with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` -- window creation is the only macOS-aware code
- [x] `src/main/windows/choose-project.ts` -- resolve the project path: first CLI argument if present and an existing directory, otherwise `dialog.showOpenDialog({ properties: ['openDirectory'] })`; wire `window-all-closed` and `activate` to reopen the chooser, and a cancelled chooser to quit -- the only launch surface, and it stays inside `windows/` with the other macOS-aware code
- [x] `src/preload/index.ts` -- `contextBridge` exposing exactly one named method, `getProjectPath(): Promise<string>`, and nothing else; no channel passthrough -- the narrow bridge, established before anything needs to cross it, and the only way the renderer learns the path
- [x] `src/renderer/index.html`, `src/renderer/ui/app.tsx`, `src/renderer/ui/main.tsx` -- React 19 mount rendering the resolved project path as plain text, unstyled -- proves the app runs without pre-empting Story 1.3
- [x] `src/main/fold/elapsed.ts`, `src/main/fold/elapsed.test.ts` -- `elapsedMs(startedAt, now)`, a pure one-concept fold module with the clock injected, and its unit test covering the matrix row -- gives `npm test` something real to run and sets the `fold/` pattern
- [x] `src/main/sources/.gitkeep`, `src/main/projections/.gitkeep`, `src/shared/.gitkeep`, `src/renderer/design/.gitkeep`, `fixtures/runs/.gitkeep` -- create the remaining prescribed directories -- the tree exists in full from day one
- [x] `electron-builder.yml`, `.gitignore` -- unsigned macOS target only, no notarization, no publish channel, no installer matrix; ignore `node_modules/`, `out/`, `dist/` -- packaging is a local build, not a release pipeline

**Acceptance Criteria:**
- Given a clean checkout, when `npm install` runs, then every NFR11 row resolves to its exact pinned version and npm reports no unmet peer dependency.
- Given the prescribed tree, when the repository is listed, then all nine directories exist and `src/renderer/` holds no stylesheet.
- Given a window is created, when its `webPreferences` are inspected, then `contextIsolation` is true, `nodeIntegration` false and `sandbox` true, and the preload exposes named methods only.
- Given the dev command with a project path, when the app launches, then exactly one window opens naming that project and closes cleanly with no error on the way out.
- Given the dev command with no project path, when the app launches, then the native folder chooser opens, and the directory chosen there opens exactly one window for that project.
- Given `npm run package`, when it completes, then an unsigned macOS artifact is produced with no notarization step, no publish configuration and no second platform.
- Given `npm run build`, `npm run typecheck` and `npm test`, when each runs on a clean checkout, then all three exit zero.

## Implementation Notes

**The layering rule needed a third spelling.** The Design Notes' patterns
(`**/main/sources/**`) catch the cross-branch spelling a `renderer/ui/` file
uses, but not the sibling spelling a `main/fold/` file actually writes:
`../sources/x` has no `main/` segment, so the second matrix row passed lint
silently on the first attempt. `eslint.config.mjs` now generates three spellings
per forbidden directory — parent-qualified, `@scope/`-aliased, and
purely-relative at up to three levels of `../`. The relative patterns all begin
with `..`, so they can only ever match a relative specifier and never a package
name. Both matrix rows were then watched failing before the violation files were
deleted.

**`npm run dev -- <path>` needed the dev script to end in `--`.** electron-vite's
dev command is `cli.command('[root]')`, so a bare positional argument would be
taken as the Vite root rather than forwarded. With `"dev": "electron-vite dev --"`,
`npm run dev -- <path>` becomes `electron-vite dev -- <path>`, cac puts the path
in `options['--']`, and electron-vite spawns `electron . <path>`. The decided
invocation in Boundaries works unchanged.

**`src/preload/harness-api.d.ts` carries the bridge type.** `src/shared/` stays
empty until Story 2.2, so the `HarnessApi` interface and the `Window`
augmentation live in a preload declaration file that both tsconfigs include.
`src/preload/index.ts` imports it as a type and satisfies it; the renderer needs
no import at all, so no layer edge is created. The channel name is duplicated by
hand in `src/main/index.ts` and `src/preload/index.ts` with a comment saying
why — the alternative was populating `src/shared/` early.

**`@types/node` is 24.19.0, not the newest.** Electron 44 depends on
`@types/node ^24.9.0`. Declaring 24.19.0 at the root keeps one copy in the tree
and matches the Node 24.18.1 runtime Electron bundles; the newest (26.x) would
have nested a second copy under `electron`.

**The window is given no size.** `BrowserWindow` is constructed without `width`
or `height` so that no dimension literal exists anywhere before Story 1.3 lands
`tokens.css`. `page-title-updated` is prevented so the window keeps the project
name rather than the document's `<title>`.

**`npm ls --all | grep -c 'UNMET|invalid'` does not return 0 on any platform.**
It counts the `UNMET OPTIONAL DEPENDENCY` lines for `@swc/core` and `esbuild`'s
prebuilt binaries for the platforms this machine is not — `optionalDependencies`
npm correctly declines to install, not peer dependencies. The check that answers
the AC is the same command with `| grep -v 'UNMET OPTIONAL DEPENDENCY'`, which
returns nothing. This is recorded in `DEPENDENCIES.md` so the next reader does
not re-derive it.

**`mac.target: dir`** — the packaged artifact is `dist/mac-arm64/BMad Harness.app`
with `identity: null`, so electron-builder reports "skipped macOS code signing".
The bundle carries the ad-hoc linker signature every arm64 Mach-O binary needs
in order to execute at all; there is no developer identity, no notarization, no
publish configuration and no second platform. A `dmg` target was rejected as an
installer.

**Matrix test audit — six of seven rows had no automated coverage.** The
implementation verified the layering and launch rows by hand, which does not
count: a check nobody can re-run is a check that decays. Three test files were
added — `tests/layering.test.ts` (rows 1–3, running the real ESLint config over
in-memory probes at layer paths, asserting `severity === 2` so a downgrade to
`warn` fails), `src/main/windows/choose-project.test.ts` (rows 5–6, with
`electron` mocked) and `src/main/index.test.ts` (row 7, reopen-on-close and
quit-on-cancel). `vitest.config.ts` and `tsconfig.node.json` were extended to
include `tests/`. Suite went 4 tests → 16, and 17 once the startup-error test landed.

Each was mutation-checked rather than trusted for going green: severity
`error`→`warn` failed 2 layering tests; `window-all-closed` quitting instead of
reopening failed the reopen test; a silent fall back to the chooser on a bad
path failed the named-startup-error test. All three mutations were reverted and
the files verified identical to their pre-mutation state.

**A bad project path blocked instead of failing (found in verification, fixed).**
The implementation reported `electron . /bad/path` exiting 1 without lingering.
It did not: `dialog.showErrorBox` is modal, so a mistyped
`npm run dev -- <path>` hung forever on a panel nothing could dismiss, and
`app.exit(1)` was never reached. A `ProjectPathError` can only come from a
command-line argument, so the terminal is the channel the user is watching:
`src/main/index.ts` now writes `<code> · <message>` to stderr and exits 1, with
no modal. Re-verified on the built app — `exit=1`, the code and the offending
path on stderr, no window, no lingering process. `src/main/startup-error.test.ts`
pins it, in its own file so the module-level "use the argument for the first
window" state is untouched.

Worth noting for later stories: `electron .` runs `out/`, not `src/`. The first
retest of this fix passed its unit test while the app still hung, because the
bundle was stale. Rebuild before believing a launch observation.

## Spec Change Log

## Review Triage Log

Review found thirteen problems. All thirteen fixed; each fix is asserted by a
test that was watched failing against the unfixed code.

**Packaging shipped the repository.** `electron-builder.yml` used an exclusion
list, so the bundle carried 299 entries nobody named - `.claude/` and
`.bmadshow/paths.json`, the latter with a machine-local absolute path in it.
Replaced with an allowlist (`out/**`, `package.json`); electron-builder adds the
production dependency tree itself. The asar is now 161 entries with nothing
outside those three roots.

**Three holes in the layer rule.** (a) `src/preload/`, `src/main/windows/` and
`src/main/*.ts` were unconstrained outbound. (b) The guard was blind to dynamic
`import()`. (c) `RELATIVE_DEPTHS` stopped at three `../`, so a probe four levels
down escaped. Fixed together by restructuring the config: the glob patterns
became one regular expression per layer (any `../` depth, any spelling), a
`no-restricted-syntax` selector over `ImportExpression` covers dynamic imports,
and two *process-level floors* (`src/main/**`, `src/renderer/**`) sit under the
six layers so a directory nobody named inherits a rule rather than escaping.
The renderer half is now forbidden the whole of `src/main`, not an enumerated
three of its subdirectories - which is what AD-13 actually says.

**The layering test asserted two of six configurations.** Now table-driven over
the exported `LAYER_GRAPH`: every (layer x forbidden layer x spelling) pair,
with spellings covering sibling-relative, deep-relative, root-qualified,
aliased and dynamic `import()` - 163 assertions. It also asserts the graph
outright, because shrinking a forbidden list would otherwise shrink the table
silently, and asserts that every source directory is governed.

**Four things constructed but asserted by nothing.** The security posture
(flipping `sandbox` to `false` left the suite green), the `project:path` bridge
on both sides, the `ipcMain.handle` callback, and the entire
`app.whenReady().then(...)` block (both existing tests mocked `whenReady` as a
never-settling promise, so deleting startup left everything passing). Now
covered by `src/main/windows/main-window.test.ts`, `tests/bridge-contract.test.ts`
and `src/main/startup.test.ts`. The startup test records into plain arrays
rather than `vi.fn()` counters: the launch happens while the module is being
imported, and Vitest clears mock call counts before the first test body runs.

**`npm run dev -- .` opened the chooser.** `projectPathArgument` filtered out
every argument equal to `.`, including one the user typed. The dev entry
placeholder is at a known position, so it is dropped by index now. `""` was
worse than useless - `resolve('')` is the harness's own working directory - and
is now a named startup error.

**Unhandled rejections and a raw errno.** `.then(openProjectWindow, onRejected)`
handled only `whenReady`'s own rejection, and `window-all-closed` / `activate`
called it bare with `void`. All three call sites now `.catch(reportStartupFailure)`.
`directoryFromArgument` wraps a `statSync` failure (EACCES, a broken symlink) in
`ProjectPathError` instead of letting the errno escape as a stack trace.

**Four one-liners and two config lines.** `elapsedMs` returned `NaN` for a
non-finite input despite promising a non-negative number; `basename` is empty
for a root path, so the window named no project; `app.tsx` called the bridge
with no guard, so a preload that failed to load rendered a blank window saying
nothing; `npm run lint` lacked `--max-warnings 0`, so a rule at `warn` severity
would have passed silently against this story's "fails the build rather than
warning"; `vitest.config.ts` globbed `.tsx` under `src/` but not under `tests/`;
and there was no `.npmrc` with `save-exact=true` to stop the next
`npm install <pkg>` writing a caret range into an exactly-pinned set.

**`tsconfig.node.json` gained `allowJs`** (with `checkJs` off) so the layering
test can read `LAYER_GRAPH` out of `eslint.config.mjs`. The flat config is
linted, not typechecked.

| verdict | finding | evidence |
|---|---|---|
| high | `electron-builder.yml`'s exclusion list is a blocklist, so the bundle ships `.claude/` and `.bmadshow/paths.json` | Confirmed: `asar list` on the built `.app` returns 299 entries under `/.claude` and `/.bmadshow`, including `paths.json` with the machine-local `customOutputPath: /bmad-harness/_bmad/`. A blocklist leaks again with every new dotfile directory. → **patch** (positive allowlist) |
| high | The layer rule leaves `src/preload/`, `src/main/windows/` and `src/main/*.ts` unconstrained outbound | Confirmed by running the project's own config on probes: `src/preload/probe.ts` importing `../main/sources/x` and `../renderer/ui/app`, `src/main/windows/probe.ts` importing `../../renderer/ui/app`, and `src/main/probe.ts` importing `./sources/x` produce **0** `no-restricted-imports` violations. The config header calls these "outside the stack"; that is enforced one way only. → **patch** |
| high | The layer rule is blind to dynamic `import()` | Confirmed: `export const a = async () => import('../sources/x')` in `src/main/fold/` produces 0 `no-restricted-imports` violations. `require()` is caught only incidentally by `@typescript-eslint/no-require-imports`, a different rule. → **patch** (same root cause as the row above) |
| high | `RELATIVE_DEPTHS` stops at three `../`, so a fourth level escapes | Confirmed: `src/main/fold/a/b/c/probe.ts` importing `../../../../sources/x` produces 0 violations. The comment's claim that three levels suffice holds only while no layer is nested that deep. → **patch** (same root cause) |
| medium | `tests/layering.test.ts` asserts 2 of the 6 generated layer configurations and no alias spelling | Confirmed by reading: it probes VIEW→{sources,fold,projections} and FOLD→sources. `layer(DESIGN/BRIDGE/PROJECTIONS/SOURCES, …)` and the `@*/…` patterns are generated but never linted. Same root cause as the three rows above — a hand-enumerated rule with unprobed corners. → **patch** |
| medium | The security posture (`contextIsolation`/`nodeIntegration`/`sandbox`) is constructed but asserted by nothing | Pre-verified by the verification-gap layer: `browserWindowConstructed` is only ever checked for call count, never for its options argument; flipping `sandbox` to `false` leaves the whole suite green, and no lint rule mentions these keys. AC3 is unasserted. → **patch** |
| medium | The `project:path` bridge is never executed on either side, and the channel name is hand-duplicated | Pre-verified: `ipcMain.handle` is stubbed in both main tests so the callback is recorded and never invoked; `src/preload/index.ts` is imported by no test. Renaming one of the two string literals keeps lint, typecheck, build and all tests green while the window renders an error body. → **patch** |
| medium | The startup wiring (`app.whenReady` → first window) and the `activate` handler are never executed | Pre-verified: both main tests mock `whenReady` as a never-settling promise, so neither callback can run. Deleting the entire `whenReady` block leaves all tests passing while the shipped app launches with no window. → **patch** |
| medium | `npm run dev -- .` silently opens the chooser instead of the current directory | Confirmed by reading `projectPathArgument`: the filter drops *every* argument equal to `.`, not just electron-vite's placeholder, and also drops any path beginning with `-` and accepts `""`. An existing directory being silently ignored is the silent fallback the matrix forbids. Raised independently by all three layers. → **patch** |
| medium | A rejection inside `openProjectWindow` is unhandled at both call sites | Confirmed by reading: `app.whenReady().then(openProjectWindow, onRejected)` handles only `whenReady`'s own rejection, and `window-all-closed`/`activate` call `void openProjectWindow()` bare. `directoryFromArgument` also lets a raw `EACCES` from `statSync` escape instead of naming it. Result: a windowless app with nothing reported. → **patch** |
| low | `npm run lint` has no `--max-warnings 0` | Confirmed: any rule at `warn` severity passes silently, against the story's own "fails the build rather than warning". Counts are 0/0 today, so the flag is free now and not later. → **patch** |
| low | `vitest.config.ts` globs `src/**/*.test.tsx` but `tests/**` only for `.ts` | Confirmed by reading the config. A future `tests/**/*.test.tsx` would never run and `npm test` would still exit zero. → **patch** |
| low | `elapsedMs` returns `NaN` for a non-finite input | Confirmed: `Math.max(0, NaN - n)` is `NaN`, which is neither non-negative nor clamped, contradicting the function's stated contract. Treated as a direct correction of an incorrect implementation, not an added guard. → **patch** |
| low | `src/renderer/ui/app.tsx` assumes `window.harness` exists | Confirmed by reading: if the preload fails to load, `window.harness.getProjectPath()` throws synchronously in `useEffect` and the window renders blank with nothing in the terminal — the same silent-failure class the startup-error fix removed on the main side. → **patch** |
| low | `basename(projectPath)` is empty for a root path, so the window names no project | Confirmed by reading `main-window.ts:19`. Direct correction (`|| projectPath`). → **patch** |
| low | No `.npmrc` with `save-exact=true`, so the next `npm install <pkg>` writes a caret range | Confirmed absent. One line, and it protects the exact-pin ethos the story is built on. → **patch** |
| medium | A renderer load failure wedges the app invisibly | Real: if `loadURL`/`loadFile` rejects (dev server down, `out/renderer` missing), `ready-to-show` never fires, so the window never shows and `window-all-closed` never fires. Not caused by a defect in the diff so much as a policy the story never specified, and the fix adds a handler plus a decision about what to do. → **defer** |
| medium | The placeholder renderer has no test, and the suite has no DOM environment to run one in | Confirmed: no test imports `app.tsx`; `vitest.config.ts` sets `environment: 'node'` and no `jsdom`/`happy-dom` is in the pinned set. Closing it means adding a dependency outside NFR11. The verification-gap layer filed it as defer for that reason, and Story 1.3 brings the first real renderer surface. → **defer** |
| medium | `scripts/check-pins.mjs` is itself unverified and duplicates `DEPENDENCIES.md` | Real: a missing or `lockfileVersion 1` lockfile produces a stack trace rather than the drift report; no test asserts the checker exits non-zero on drift; the version list is hand-copied between the script and the Markdown table; and only top-level lock entries are inspected, so `DEPENDENCIES.md`'s "one copy in the tree" claim is unenforced. The fix needs a fixture harness, which is more than a patch. → **defer** |
| medium | Nothing runs `npm run lint` except a human choosing to | Confirmed: no `.github/`, no `.husky/`. The pinned-set guarantee the story frames as "verifiable by command" depends on someone typing the command. CI is outside this story's intent. → **defer** |
| medium | "One window per project, always" is stated but not enforced | Confirmed: `main-window.ts` keys its map window→path, never path→window, so nothing would prevent a second window on the same project once a second window becomes reachable. Unreachable today (one window per process). → **defer** |
| low | `app.on('activate', …)` is macOS-only and sits in `src/main/index.ts`, outside `windows/` | The Boundaries say macOS-only calls live in `windows/`. But the spine's examples are shell escapes (`open -R`, `open -a`), and `activate` is an Electron event that is simply inert elsewhere, not an OS branch — a port stays additive. Fix would mean moving wiring, more than a direct correction. → rejected |
| low | `ELECTRON_RENDERER_URL` set to an empty string would fail `loadURL` | Real but the variable is set by electron-vite itself, never by hand; the guard adds a branch for a state never shown reachable. → rejected |
| low | The `choosing` re-entrancy guard silently drops a concurrent request | Real, but the guard is deliberate and the dropped case is a second chooser request while one is already open; a queue is added complexity for a state the single-window app cannot reach. → rejected |
| low | `src/main/startup-error.test.ts` leaves `process.stderr` stubbed if `beforeAll` throws before `restoreStderr` is assigned | Real but confined to a test-harness failure path that only occurs when the test file is already broken. → rejected |
| low | `check-pins.mjs` should parse `DEPENDENCIES.md` as the single source of truth | A design preference, not a defect; the fix restructures the script rather than correcting it. Grouped with the deferred check-pins row. → rejected |
| false | `choose-project.test.ts` indexes `mock.calls[0][0]` without first asserting the call happened | Refuted: the line immediately above it is `expect(showOpenDialog).toHaveBeenCalledTimes(1)`. → rejected |
| false | Spec frontmatter `in-review` disagrees with sprint-status `in-progress` | Normal mid-workflow state — the sprint file syncs to `review` at presentation, not during review. The same finding was raised and refuted in Story 1.1. → rejected |
| false | `## Spec Change Log` and `## Review Triage Log` ship empty | By design: the change log is written only on a `bad_spec` loopback, and the triage log is this table. → rejected |
| low | The spec's Verification section records "16 passing across 4 files"; the suite is 17 across 5 | Accurate catch — the number was written before `startup-error.test.ts` was added. Rejected as a finding because its fix edits this build's spec, which triage forbids; corrected as ordinary bookkeeping instead. → rejected |

## Design Notes

The layer rule is enforced by scoping `no-restricted-imports` to each layer's own `files` glob, so the constraint reads as the dependency graph rather than as a list of exceptions:

```js
{ files: ['src/renderer/ui/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [
    '**/main/sources/**', '**/main/fold/**', '**/main/projections/**'] }] } },
{ files: ['src/main/fold/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: ['**/main/sources/**'] }] } },
```

Patterns must match the relative form (`../../main/sources/x`) and any alias form, so either configure no path aliases in v1 or restrict both spellings. A layering rule nobody has watched fail is a rule nobody knows is wired up — hence the verification step.

`electron-vite`'s renderer default is `src/renderer/src/`, which the prescribed tree does not have; set the renderer `root` explicitly rather than reshaping the tree around the tool.

## Verification

**Commands:**
- `npm ls --all 2>&1 | grep 'UNMET\|invalid' | grep -v 'UNMET OPTIONAL DEPENDENCY'` -- expected: prints nothing. The filtered-out lines are `@swc/core`/`esbuild` prebuilt binaries for other platforms — `optionalDependencies` npm declines on this machine, not peer dependencies. (The original `grep -c ... == 0` form was wrong and could never pass; see `DEPENDENCIES.md`.)
- `node scripts/check-pins.mjs` (a small script this story adds) -- expected: exits zero, printing nothing; it reads `package-lock.json` and asserts each of the twelve NFR11 rows resolves to its exact pinned version
- `npm run lint && npm run typecheck && npm run build && npm test` -- expected: all exit zero
- `npm test` -- expected: 17 passing across 5 files. `tests/layering.test.ts` runs the project's own ESLint config over in-memory probes, so no violating file is ever written to disk; `src/main/windows/choose-project.test.ts` and `src/main/index.test.ts` cover the three launch rows.
- `npm run package` -- expected: an unsigned macOS artifact under `dist/`; `grep -iE 'notarize|publish|win|linux' electron-builder.yml` finds nothing

**Manual checks (what no test covers):**
- The native panel is a folder chooser and cancelling it quits. Automated coverage asserts the branch is taken and `app.quit()` is called on a cancelled result, but the macOS panel itself was never driven — `osascript` assistive access was denied in this environment.
- `src/preload/index.ts` exposes `getProjectPath` and nothing else; no `invoke(channel, …)` and no `ipcRenderer` reaching the renderer.
- Launching twice against two project paths yields two independent windows, each naming its own project. Closing one returns that instance to the chooser; cancelling there quits it, leaving the other untouched.

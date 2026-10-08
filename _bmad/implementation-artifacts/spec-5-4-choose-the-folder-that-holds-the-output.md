---
title: 'Story 5.4: Choose the folder that holds the output'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'c3e2f810f63fdfc8108715bdc3122848db03edee'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad/planning-artifacts/epics.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The harness spells `_bmad/` as both the BMad install and the output tree. The install is fixed; the output folder is BMad's own configuration (`core.output_folder`) and may be elsewhere, so a project installed with another output folder shows an empty rail. The user also has no way to say where the output is when the harness cannot tell.

**Approach:** One pure resolution function (stored choice, BMad's resolved `output_folder`, what is on disk) yields the watched folder `F`; main holds it per project window and every output-tree surface (rail watcher, document boundary, empty state, document foot, room summary destination and button) reads `F` from it. Then the Outputs head (`F`, `change…`, one state line), the per-project `userData` store, and a project-window File menu choose, remember and forget it. The authoritative acceptance text is `### Story 5.4` in `_bmad/planning-artifacts/epics.md`; `DESIGN.md` → Outputs head and `EXPERIENCE.md` → Output folder give the appearance and rules. Decisions to confirm are taken at their defaults: `.git`/`node_modules` refused; an open document window keeps its file; the chooser allows creating a folder; the project File menu has no accelerators; the party summary follows `F`.

## Boundaries & Constraints

**Always:** `F` is project-relative, POSIX, with a trailing `/` when shown. Order of use: the stored choice if it is an existing folder inside the project's real path, not the project itself, not `.git`/`node_modules` or inside either; else BMad's `core.output_folder` (`{project-root}` replaced, same usability test); else `_bmad/`. BMad's value comes through the install resolvers (`resolve_config.py --key core.output_folder`, output is a literal dotted key `{"core.output_folder": "..."}`), validated like every resolver's output; a failure or a wrong shape leaves `_bmad/` with no new error. A config change re-resolves through the existing install watcher (FR5) and re-points in one frame, touching no session, run, transcript, card or open document window. Re-pointing must not raise persona rail notes (re-baseline the persona rail seed). The choice is stored per project path under `userData`, never written into the project; a stored choice whose folder is missing is kept, not applied, and applies again when the folder returns. The install, preflight and resolvers keep reading `_bmad/` exactly as before (`resolvers.ts`, `watch-install.ts` and their tests are unchanged). Resolver access is a new method (`resolveOutputFolder`), not a second key on `resolveRoster`. New channels and preload methods are enumerated in `src/shared/channels.ts` and pinned in the contract tests; the folder state rides the existing `rail:changed` snapshot; the refusal reason rides the command reply and is announced once through the window's one polite live region. All colours, dimensions and fonts through tokens; harness strings lower case, mono, `·`-separated, no terminal punctuation.

**Never:** No first-launch prompt, banner or setup step; nothing written into the project (`_bmad/`, `_bmad/custom/`, dotfiles); no second watched folder; no folder outside the project can be chosen; no recommendation or claim that a folder is right; no redirection of any skill's writes; no colour, icon, badge or sound on the head or state line; File menu items have no accelerators; the Welcome and document windows' menus gain neither item; no new generic `invoke`; no change to persona, session, conversation or run channels; `src/renderer/` and `src/main/` carry no spelling of the output tree where `_bmad` does not mean the install.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Derived | no choice; BMad `{project-root}/docs/out` exists | `F = docs/out/`; rail rows from it; no state line | — |
| Default | no choice; resolver failed / value unusable / absent | `F = _bmad/` | silent |
| Chosen, same | choice equals BMad's folder | `F` = choice; no state line | — |
| Chosen, different | choice ≠ BMad's known folder | `F` = choice; line `bmad writes to · <bmad folder>` | — |
| Chosen, missing | stored folder gone | rail on BMad's (or `_bmad/`); line `<chosen> · folder missing`; returns when folder returns | — |
| Refused choice | outside project / project root / in `.git` / in `node_modules` | nothing changes; once `not changed · <reason>`, announced; clears at next choice | reasons: `outside this project`, `the project folder itself`, `inside .git`, `inside node_modules` |
| Cancelled chooser | dialog cancelled | nothing changes, no line | — |
| Forget | File ▸ Use BMad's Output Folder | choice removed, rail returns to BMad's folder; item dimmed while no choice | — |
| Symlink out of `F` | document path inside `F` lexically, real path outside | refused as today | `doc/invalid-path` family unchanged |

</intent-contract>

## Code Map

- `src/main/fold/output-folder.ts` (new, pure) -- the resolution function over `{stored, bmad, onDisk}` → `{folder, state}` (derived, chosen+same, chosen+different, chosen+missing, bmad unusable, resolver failed) and `checkChoice(real project, real target)` → ok or a refusal reason; reuse `isInside` from `src/main/sources/project/resolve-document.ts`.
- `src/main/sources/persistence/output-folder-file.ts` (new) -- `<userData>/output-folders.json` `{version:1, folders:{[projectKey]: relFolder}}`, sync, atomic tmp+rename, never throws; model on `recent-file.ts` / `theme-file.ts` (key name `projectKey`, not `projectPath`/`projectRoot`, because `tests/negative-surface.test.ts:358-375,2055-2090` forbid those in persistence sources). Tolerant parse in the fold.
- `src/main/sources/install/resolvers.ts`, `schema.ts` -- add `resolveOutputFolder()` to `InstallSource` (own `run` call, same failure kinds, `parseOutputFolder` validator in `schema.ts`). Read-only: the `_bmad/scripts` path (:90) and `resolveRoster`.
- `src/main/output-folder-model.ts` (new) -- per-window registry (`webContents.id` → current `F`, state, choose/forget handles), like `src/main/install-model.ts`; `doc-bridge.ts` and the menu read it.
- `src/main/rail-bridge.ts`, `sources/project/watch-artifacts.ts` -- `watchArtifacts` takes a `folder` option (project-relative, multi-segment); `underWatchedDir` becomes a prefix test admitting the root, ancestors of `F`, `F` and its contents; the bridge owns the watcher per window, rebuilds the projection/watcher on a change of `F`, rebinds `annotator`, and re-seeds `personas.seedRail`; `RailSnapshot` (`src/shared/rail.ts`, `src/main/projections/rail.ts` `commit()` dedupe key) gains `folder`, `bmadFolder?`, `state?` so rows and head land in one frame.
- `src/main/install-bridge.ts` / `projections/install.ts` -- trigger folder re-resolution on the existing install watcher's firing (the install `content()` does not carry the folder, so hook beside it, not into it).
- `src/main/sources/project/resolve-document.ts` (+ `doc-bridge.ts:82,188`, `watch-document.ts` comments) -- `resolveDocument(projectRoot, path, folder)`: lexical rule is "starts with `F`'s segments and strictly deeper", realpath boundary is `join(projectRoot, F)`; the invalid-path message becomes `doc · not a document under <F>`; an open window keeps its captured boundary. `src/shared/document.ts` `DocSnapshot` gets `folder` (set in `projections/document.ts`) so `renderer/ui/doc/foot-text.ts:11` (`outside <F> · not opened`) reads it.
- `src/shared/room-destination.ts` (`PARTY_DIR`) -- `roomDestination(openedAt, topic, folder)` → `<F>party/<date>-<slug>.md`; callers `conversation-state.ts:388` (`roomSummaryAsked`), `use-conversation.ts:432`, `party/room-panel.tsx:57`; `party/party-header.tsx:67` → `Write summary to {folder}`; `party-view.tsx`, `app.tsx` pass `rail.folder`. Filename rules unchanged.
- `src/renderer/ui/outputs/outputs.tsx`, `outputs.css`, `row-groups.ts` (`ROOT_DIR` dead → remove), `shell/shell.tsx` `RailHalf` (trailing slot) -- Outputs head: `F` in `meta` mono `dim`, `change…` button (`accent`, one tab stop before the list's) calling the new preload method, state line only while a state exists (`dim`, `panel`, `5px 11px`, `line-soft` rule), empty state `no files under <F> yet` + full path; refusal announced via `App`'s `Announcer`. DESIGN.md `components.outputs-head`, mockup `mockups/output-folder.html` classes `.head/.where/.chg/.state`.
- `src/main/windows/choose-project.ts` -- sibling `chooseOutputDirectory(parent, defaultPath)`: title `choose the bmad output folder`, button `choose`, `openDirectory`+`createDirectory`.
- `src/shared/channels.ts`, `src/preload/index.ts`, `harness-api.d.ts`, the bridge (`output-folder-bridge.ts`, new) -- one command channel + `chooseOutputFolder()` returning a reply with the refusal reason; menu-only forget needs no method. Pin counts (channels 29→30, methods 17→18): `tests/channels-contract.test.ts:34`, `party-contract.test.ts:39,43`, `bridge-contract.test.ts:225-250,294`, `preflight-contract.test.ts:149-175`, `negative-surface.test.ts:916,1987-88,2212-14,2360`.
- `src/main/windows/app-menu.ts`, `src/main/index.ts` -- project menu gains `File` (*Output Folder…*, *Use BMad's Output Folder*, plus the OS's Close Window), no accelerators, forget dimmed while no choice; menu rebuilt per focused project window and on every choose/forget (current `install(focus)` dedupes on kind). Update `app-menu.test.ts` top-label and no-accelerator assertions.
- Pins/tests naming the literals, to update: `tests/outputs-contract.test.ts:206-212`, `tests/bridge-contract.test.ts:481`, `tests/persistence-contract.test.ts` (three writers → four), `tests/negative-surface.test.ts:358-375,706,2055-2090,2470`, `shell/negative-surface.test.tsx:161`, `doc-bridge.test.ts:224,437`, `watch-artifacts.test.ts`, `resolve-document.test.ts`, `outputs.test.tsx`, `row-groups.test.ts`, `foot-text.test.ts`, `doc-app.test.tsx`, and the `_bmad/party` tests in `room-destination`, `room-summary`, `conversation-state`, `room-panel.dom`, `party-view`, `epic-4-audit.dom`, `party-header.dom`, `app.test.tsx`, `tests/room-reload.test.ts`. `tests/party-contract.test.ts:175-181` (no `_bmad/party` in non-test sources) stays green.
- Comment-only `_bmad` spellings for the output tree to reword: `shared/document.ts`, `shared/rail.ts`, `projections/rail.ts:15`, `projections/document.ts`, `windows/macos-escapes.ts`, `windows/doc-window.ts:8`, `use-doc-open.ts:15`, `output-row.tsx:39`, `outputs.tsx:16`, `shared/room-summary.ts:2`. Install-meaning mentions (`art-params.ts`, `memlog.ts`, `memlog-tail.ts`, `resolvers.ts`, `watch-install.ts`) stay.
- Read-only: `fold/persona-state.ts` `foldRail` (class-owned rows raise notes on change), `session-run.ts` `observeMemlog` (folder-agnostic), `fold/artifact-owner.ts` (basename match), `a11y/announcer.ts`, `a11y/live-region.tsx`.

## Tasks & Acceptance

**Execution:**
- Seam A: `fold/output-folder.ts`, `resolvers.ts`/`schema.ts` `resolveOutputFolder`, `output-folder-model.ts` (+tests over the resolution table and the resolver's failure kinds) -- derive `F`
- Seam A: `watch-artifacts.ts`, `rail-bridge.ts`, `shared/rail.ts`, `projections/rail.ts`, persona re-seed, install-watcher hook (+tests, watcher project) -- the rail follows `F` and re-points in one frame
- Seam A: `resolve-document.ts`, `doc-bridge.ts`, `shared/document.ts`, `foot-text.ts`, `row-groups.ts`, `outputs.tsx` empty state, `room-destination.ts` and its callers, `party-header.tsx` -- every output-tree surface reads `F`; update/replace the `_bmad` and `_bmad/party` pins (default folder and a chosen one)
- Seam B: `output-folder-file.ts`, the choice bridge (choose/forget/store/refusal check on real paths), `choose-project.ts`, `channels.ts`, preload, contract pins -- choose it, remember it, project tree byte-identical after a choice
- Seam B: `outputs.tsx`/`outputs.css`/`shell.tsx`, announcer wiring -- the head in its four states built from the resolution function's output
- Seam C: `app-menu.ts`, `index.ts` -- File menu, forget dimmed, rebuild per window
- Audits: new test that `src/renderer` and `src/main` carry no `_bmad` except the install files and install-meaning comments; negative-surface mounts of the head (no colour, icon, badge, prompt, second folder); bridge-level test: a temp project whose config names another output folder shows rows from it with no choice, a choice moves them, an open document keeps reloading, `_bmad/scripts` resolvers still invoked.

**Acceptance Criteria:**
- Given no stored choice, then `F` is BMad's usable `output_folder` (inside the project, not the root), else `_bmad/`; a resolver failure or wrong shape leaves `_bmad/` silently; a config change moves `F` in the same frame and touches no live session.
- Given `F`, then the rail's rows and groups are the files under `F` (project-relative, first group headed by `F`), the empty state reads `no files under <F> yet` with the full path beneath, a document opens only if its real path is inside `F`'s real path (symlink out refused, open window keeps its file), and the party summary ask, destination, header button and Room panel all read `<F>party/<date>-<slug>.md` / `Write summary to <F>`.
- Given the install, preflight and resolvers, then they read `_bmad/` exactly as before whatever `F` is.
- Given the Outputs head, then it shows `F` and `change…` (one tab stop before the list's); activating it opens the chooser (`choose the bmad output folder`, `choose`, folders only, create-folder allowed, opening in `F`); an accepted real path inside the project (not the root, not `.git`/`node_modules`) re-points and is stored; a refused one changes nothing and says once `not changed · <reason>`, politely announced, cleared at the next choice.
- Given a stored choice, then it survives a relaunch, is keyed by project path under `userData`, nothing is written into the project (tree byte-identical), and a missing/unreadable/unusable value reads as no choice; when it differs from BMad's folder the line `bmad writes to · <bmad folder>` shows; when its folder is missing the line `<chosen> · folder missing` shows and the rail watches BMad's folder until it returns.
- Given a project window, then File has *Output Folder…* and *Use BMad's Output Folder* (no accelerators; forget dimmed while no choice, then rail returns to BMad's folder in one frame); the Welcome and document menus gain neither.
- Given any open of a project, a skill button or a chat turn, then nothing asks about the folder, no banner, no state line without a choice or a missing one, and the harness writes/moves/redirects nothing.
- Given the renderer and main, then no other spelling of the output tree exists, the head and line have no colour, icon, badge or sound, and `typecheck`, `lint`, `test` and `build` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 32 findings — high 0, medium 0, low 24, false 8, maybe-false 0 (blind 14, edge-case 14, verification-gap 4; the intent-alignment audit is descriptive and filed no findings)
- findings:
  - `[low]` `reject` blind: a failed store write still reports `chosen` — needs a disk-full or permission failure on `userData`, and the fix adds a new outcome on the public reply; a diagnostic is written.
  - `[low]` `patch` blind: control characters in a folder name reach the room ask, head and announcer — `normalizeFolder` now rejects control characters, with table tests.
  - `[low]` `reject` blind: the choice is keyed by the raw project path — the story says keyed by the project's path; a moved or aliased project is another project to the harness, as it is for the recent list.
  - `[low]` `patch` blind: a chosen folder such as `packages/` admits nested `node_modules` and `.git` — `admitted` now refuses any path with those segments, with a watcher test.
  - `[low]` `reject` blind: the candidate's first scan and the live watcher both feed `observeArtifact` — observations are keyed by path and identical content is re-read, so a duplicate is harmless and a swap is rare.
  - `[low]` `reject` blind: `change…` has no object in its accessible name — the story, DESIGN.md and the mockup fix the literal `change…`; adding labels is a spec change.
  - `[low]` `reject` blind: a failed `chooseOutputFolder` is swallowed — main already writes a diagnostic and a failed command reply has no user-facing state in the story; adding one is new surface.
  - `[false]` `reject` blind: the room summary is disabled until the rail answers — the destination is `F`, which is unknown until then; a default fallback could write to the wrong folder.
  - `[false]` `reject` blind: an unusable stored choice cannot be seen or forgotten — the story says a stored value that is not a usable folder reads as no choice, silently.
  - `[false]` `reject` blind: every install-watcher firing spawns the resolver, even for a skill file — the install watcher fires only for `config.toml`, `config.user.toml` and `custom/*.toml`; refreshes queue singly by design.
  - `[low]` `patch` blind: the menu stays stale after a project window closes — destroying the window now notifies the menu, with a test (same cause as the edge-case row).
  - `[low]` `reject` blind: tests that grep source text for `_bmad` and `swept.length > 150` — the story asks for exactly this audit ("no other spelling"); brittle only on a deliberate edit and a failure names its cause.
  - `[low]` `reject` blind: a redundant `next !== 'refused'` condition and two exports — developer-only, typing-driven, no behaviour.
  - `[false]` `reject` blind: the spec records no review or verification evidence — it is written at finalize, below.
  - `[low]` `patch` edge: `first()` after the window is destroyed starts a watcher nothing closes — `first` now returns when `gone`, with a test.
  - `[low]` `reject` edge: an unhandled rejection if `follow`/`refresh` throws — `watch` and the resolver paths catch their own failures; no throwing path was shown.
  - `[low]` `reject` edge: a transient resolver failure moves the rail to `_bmad/` and back — the story's table makes `resolver failed` mean `_bmad/`, silently; keeping the last good value is a different rule the story does not ask for.
  - `[low]` `reject` edge: a picked folder with a backslash or newline reports `chosen` and is dropped on read — a name no BMad output folder has; the fix adds a refusal reason the story does not list.
  - `[false]` `reject` edge: an unusable stored choice is invisible and cannot be forgotten — same as above: the story says it reads as no choice.
  - `[low]` `reject` edge: a click on a row still shown from the old folder is refused during the candidate scan — a window of one scan, and the refusal is the same as for any path outside `F`.
  - `[false]` `reject` edge: two windows on one project do not see each other's choice — `main-window.ts` allows one window per project path and raises it.
  - `[low]` `reject` edge: a folder or ancestor named `*.tmp` or `.DS_Store` is ignored — the noise rule applies to a folder named so; no BMad output folder is.
  - `[low]` `patch` edge: the menu stays enabled for a destroyed focused window — patched with the row above.
  - `[low]` `reject` edge: `rebaseRail` runs when only `awaiting` changed — files observed between the last snapshot and the rescan then raise no note; a note is raised only for owned files that changed in that moment.
  - `[low]` `reject` edge: `bmadFolderOf` accepts other placeholders as a literal — BMad's resolver substitutes only `{project-root}` and the value then fails the on-disk check as missing.
  - `[low]` `patch` edge (claim): a newline in a folder name breaks the summary ask's shape — covered by the control-character patch.
  - `[false]` `reject` edge (claim): the rail does not watch BMad's folder while a choice is missing — the story says BMad's folder, or `_bmad/`; the code does exactly that.
  - `[low]` `reject` edge (claim): a failed refresh drops a good BMad folder — see the transient-failure row; the story's table decides.
  - `[low]` `patch` gap: File-menu wiring in `index.ts` is verified by no test — `index.test.ts` now asserts the fourth argument and its delegation and the stderr line.
  - `[low]` `reject` gap: `follow()` could throw synchronously in `watch` on a move — no throwing path shown; the first-ask path already routes it.
  - `[low]` `reject` gap: a failed candidate scan is swapped in as empty rows — `ready` rejects only if the watcher itself fails, which the first path also treats as a diagnostic.
  - `[false]` `reject` gap: `hasChoice` reads the view not the store — the story says an unusable value reads as no choice.
  - Intent-alignment audit (descriptive): reads the intent as build, commit and close in tracking; the closing surfaces (`sprint-status.yaml`, the spec at `done`, the commit) are done at finalize, below. It notes the head, chooser and menu were not seen in a running window.

## Design Notes

The resolution is pure and total over its inputs so the head's four states can be built from its output in tests rather than by hand. Rows already carry project-relative paths, so groups headed by `F` mostly fall out of `groupRows`; the watcher is rooted at the project so a folder created later is seen, and only its `ignored` rule changes from a first-segment test to a prefix test. The document boundary is captured per open window already, which gives "keeps its file and keeps reloading" for free once the lexical rule and the new-open boundary take `F`.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no warnings
- `npm test` -- expected: all pass
- `npm run build` -- expected: three preload bundles and three page entries emitted

**Manual checks (if no CLI):**
- `npm run dev` on a project whose BMad config names another output folder: the rail shows its files; `change…` and the File menu choose and forget; the head's state lines read as specified.

## Auto Run Result

Status: done

**Summary.** The rail now watches the project's real output folder. A pure resolution (stored choice, else BMad's `core.output_folder` through its resolver, else `_bmad/`) gives one folder `F` per project window; the rail watcher, document boundary, empty state, document foot and the room summary (ask, destination, header button, Room panel) all read it. The Outputs head shows `F` and `change…` with a state line (`bmad writes to · …`, `… · folder missing`, `not changed · <reason>`); the choice is checked on real paths, stored per project under `userData` and never written into the project; a project-window File menu holds *Output Folder…* and *Use BMad's Output Folder*. A config change re-points the rail in one frame through the install watcher without touching any session, run or open document.

**Files changed.**
- `src/main/fold/output-folder.ts`, `src/shared/output-folder.ts` -- the resolution, choice check and tolerant store helpers.
- `src/main/output-folder-bridge.ts`, `output-folder-model.ts`, `sources/persistence/output-folder-file.ts`, `windows/choose-project.ts` -- per-window folder state, the chooser channel, the store.
- `src/main/sources/install/resolvers.ts`, `schema.ts`, `install-bridge.ts` -- `resolveOutputFolder` and the re-resolution hook.
- `src/main/rail-bridge.ts`, `sources/project/watch-artifacts.ts`, `projections/rail.ts`, `fold/persona-state.ts`, `projections/personas.ts` -- watcher follows `F`, swap on a move, persona notes re-baselined.
- `src/main/doc-bridge.ts`, `sources/project/resolve-document.ts`, `projections/document.ts`, `src/renderer/ui/doc/*` -- document boundary and foot read `F`.
- `src/shared/room-destination.ts`, `chat/conversation-state.ts`, `use-conversation.ts`, `party/*` -- summary destination and button follow `F`.
- `src/renderer/ui/outputs/outputs-head.tsx`, `outputs.tsx`, `outputs.css`, `shell/shell.tsx`, `app.tsx`, `design/tokens.css` -- the head, its states and the refusal announcement.
- `src/main/windows/app-menu.ts`, `src/main/index.ts`, `src/shared/channels.ts`, `src/preload/*` -- File menu, one channel and one preload method (30 and 18).
- Tests: new `output-folder*.test.ts` files, `tests/output-folder-contract.test.ts` (audit and bridge-level test), `tests/output-folder-head.test.tsx`; existing pins and `_bmad` / `_bmad/party` expectations updated.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- story 5.4 marked done.

**Review.** 32 findings: low 24, false 8, high 0, medium 0. Patches applied: 5 entries (7 rows), all low: no watcher started after the window is destroyed during the first resolve; the menu dims when the focused window is destroyed; control characters rejected in folder names; nested `.git`/`node_modules` not walked under a chosen folder; test for the File-menu wiring in `index.ts`. Deferred: 0. Rejected: 27, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high, no medium patched).

**Verification.** `npm run typecheck`, `npm run lint` (with `check-pins`), `npm test` (195 files, 4688 tests, plus 64 watcher tests) and `npm run build` pass, run again after the patches. Matrix rows are covered by the fold's table tests, the bridge tests for refused and cancelled picks, the forget path and the contract test's symlink and bridge-level cases.

**Residual risks.** `npm run dev` (a project whose BMad config names another folder, `change…`, the File menu, the head's four states) was not run, so none of it has been seen in a window. Only the `{project-root}/<path>` form of `core.output_folder` was exercised against the real resolver output; other forms are unit-tested. A transient resolver failure on a refresh falls back to `_bmad/` and returns when it recovers, as the story's table says. The epic-5 context was not recompiled: the only planning change since it was written was an apostrophe in DESIGN.md.

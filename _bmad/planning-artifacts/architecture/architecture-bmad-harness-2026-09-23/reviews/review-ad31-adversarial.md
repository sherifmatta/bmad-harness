---
title: Adversarial review of AD-31 and its 2026-10-20 amendments
reviewed: ARCHITECTURE-SPINE.md (updated 2026-10-20): AD-31; AD-1, AD-2, AD-3, AD-13 amendments; platform convention row; process diagram; capability map; Open Item "cost of a 2s status read"
against: epics.md Story 9.3, FR142; src/main/sources/project/branch.ts, resolve-document.ts, watch-document.ts, src/main/doc-bridge.ts, src/main/install-bridge.ts, src/main/sources/install/run-command.ts, src/main/sources/preflight/login-path.ts, src/main/windows/doc-window.ts, src/main/projections/document.ts, src/shared/document.ts, tests/contract.test.ts
date: 2026-10-20
method: build two units one level down that each obey every AD to the letter, and show where they still clash
---

# Adversarial review: AD-31 (git changes source) and the 2026-10-20 amendments

## Verdict

**Sound in intent but not buildable as written.** The single command, the closed union and the two-admission rule are the right shape. But six seams let two builders who both follow the letter produce incompatible units. One of them, the document watcher's boundary, breaks Story 9.3's main acceptance criterion on day one. A second, the trailing slash, kills the whole list for an ordinary repository layout. The AD also over-claims on the developer-tools prompt: it closes the `/usr/bin/git` path, but not every path from a git process to a `/usr/bin` stub.

Severity key: **High**: the build fails an AC or a stated guarantee, or two compliant units cannot be joined. **Medium**: compliant builds diverge visibly, or a guarantee has a real hole. **Low**: wording, or a hole unlikely to be hit.

---

## H1. The document window still reads through the output-folder boundary (doc-bridge vs AD-13's second admission)

**Unit A (doc-bridge admission), compliant with AD-13 as amended:** it adds the snapshot admission before `resolveDocument`'s lexical tier. It checks the real path against the project's real path and opens the window.

**Unit B (document watcher and projection), compliant with AD-13 and NFR8 as they stand:** `doc-bridge.ts` passes `boundary: resolvePath(projectRoot, folder)` to `watchDocument`. `readDocument` re-checks containment against that boundary on every read and returns `refused` outside it. `createDocumentProjection` takes `folder` and `refused`. `DocSnapshot.folder` is "the output folder the document was opened under", and `refused` is documented as "resolves outside the output folder" (`src/shared/document.ts:23`).

**Clash:** neither AD-31 nor AD-13's amendment says which boundary the watcher re-checks for a Changes-admitted document, or what `folder` and `refused` mean for one. So a builder can obey both and still get this result. Every Changes row outside `_bmad/<output>/` (the whole point of FR142, "what the run touched outside `_bmad/`") opens a window and shows `refused`. `resolveDocument`'s lexical tier (`documentSegments(path, folder)`) also returns `doc/invalid-path` for any such path, with the message `doc · not a document under <folder>`. That message is false for a Changes refusal. The amendment adds an admission without saying it replaces both tiers and the per-read boundary.

**Fix:** state in AD-13 that a document's boundary is fixed at open, by the admission that admitted it. It is the output folder for the first admission and the project root for the second, and `refused`, the foot's `folder` and the refusal message all follow that boundary.

## H2. The fold's validation rejects ordinary porcelain output, so the "all or nothing" rule turns it into a permanently blank half

AD-31 says each path is validated "as `readBranch` validates a branch name", and that "any record the fold does not recognise fails the whole read". Read literally, three common cases fail the whole read:

1. **Spaces.** `BRANCH_NAME` in `branch.ts` is `[^\s\x00-\x1f…]`, so it rejects every whitespace character, including a plain space and U+00A0. A builder who reuses it per segment, the natural reading of "as `readBranch` validates", fails the read for any repository holding `My notes.md`. Another builder, reading the parenthetical list ("no `..` or empty segment, no control, bidi or zero-width character"), allows spaces. The two folds differ on the commonest file names there are.
2. **Untracked directories that git will not descend into.** With `--untracked-files=all`, git still reports an untracked nested repository (a cloned tool or a stray `git init`) as one `? dir/` record with a **trailing slash**. Split on `/`, that is an empty last segment, so validation fails and the half reads `changes not read · …` until the directory is removed or ignored.
3. **Record kinds outside the six states.** Two examples: a type change (`1 .T …` or `1 T. …`, a file replaced by a symlink or the reverse), and a copy (`2 C…`), which the repository's own `status.renames=copies` can produce. AD-31 names six states, and says nothing of the porcelain `XY` table. That leaves the `1 AD` (added, then deleted in the worktree), `2 RM`, `2 RD`, `1 MD` and `1 DM` combinations to each builder. One maps `AD` to `added` (and the row then opens a `missing` file). Another maps it to `deleted`, and a third fails the read.

Submodule records (`1 .M S.M. …`) also go unmentioned, though Story 9.3 decides "a submodule is one row".

**Fix:** put the mapping table in AD-31. It should cover every `XY` pair and record kind (`1`, `2` with `R` only, `u`, `?`), with `T` and `C` named. Pin `-c status.renames=true` in the command. Define the path rule as its own regex that allows spaces. Fold `? dir/` into a non-openable `untracked` directory row instead of failing.

## H3. "Not a git repository" is inferred from an exit code that also means "corrupt", "dubious ownership" and more

`runCommand` drops stderr, and git exits 128 for every fatal error. The spine's evidence ("exit 128 from a subfolder with the ceiling at the root") is how a builder learns to map 128 to `not a git repository`. The same 128 comes from:

- `safe.directory` / dubious ownership (a project on an external disk or cloned by another user);
- a corrupt or unreadable index;
- an unsupported repository extension (a newer `extensions.*` than the installed git knows).

Each of those shows the user `not a git repository`, a wrong fact (AD-20). A second builder who maps 128 to `changes not read · exit 128` contradicts the first. The AD's own sentence ("a project inside a larger repository reads `not a git repository`") gives no way to tell these apart.

**Fix:** decide `not a git repository` before spawning, from the absence of `<root>/.git` (a directory or a `gitdir:` file, exactly as `readBranch` reads it). Map any non-zero exit when `.git` is present to `changes not read · git exit <code>`. This also means no process is spawned for a project that is not a git repository.

## H4. The focus rule cannot be built from "the subscription `install-bridge.ts` uses"

`subscribeWindowFocus` (install-bridge.ts:44) subscribes to `focus` only, and it does so on the renderer's first `install:get`, which arrives after the window has already been shown and focused. Two compliant builders:

- **Unit A** reuses it as named. The first `focus` has already fired, so nothing is read until the user leaves the app and comes back. The Changes half also has nothing to say in the meantime (see M1). It has no `blur`, so "on `blur` it stops" needs a second subscription the AD does not name.
- **Unit B** checks `isFocused()` at subscribe time and adds `blur`. That is correct, but it is a different seam from the one the AD names. A test written against the `subscribeFocus` dependency shape for Unit A does not fit Unit B.

AD-31 also does not say what happens on `focus` while a read that started before `blur` is still in flight. One builder drops the focus read ("never two reads in flight"); another queues one to follow. The difference is visible: on a slow repository the first shows a snapshot taken before the window went to the background.

**Fix:** name a new dependency, `subscribeFront(sender, { onFront, onBack }) → stop`. It calls `onFront` immediately when the window is already focused. A `focus` that arrives during a read schedules exactly one read after it.

## H5. The prompt is guarded at the spawn, but git can still reach a `/usr/bin` stub itself

The locator closes the obvious route. The executable is never bare `git`, and a candidate whose real path is `/usr/bin/git` or `/usr/bin/xcrun` is skipped. That includes a symlinked candidate, because the check is on the real path, and a `PATH` entry of `/usr/bin` itself, because `/usr/bin/git` resolves to itself. That part holds. It does not prevent the prompt in four cases:

1. **Shim scripts.** asdf and mise put a shell script at `~/.asdf/shims/git` or `~/.local/share/mise/shims/git`, inside the login path. Its real path is the script, so the check passes. With no managed git installed, the script falls through to the system `git`, which is `/usr/bin/git`, and the prompt appears. A user's own `~/bin/git` wrapper (`exec xcrun git "$@"`) does the same. A real-path check cannot see through an `exec`.
2. **Copies.** A copy of the `/usr/bin/git` stub elsewhere (some installers and bundles do this) has its own real path.
3. **Helpers the repository's config starts.** `git status` runs **clean filters** for any file whose stat data is stale (this is why `git status` is slow with git-lfs). A repository whose `.gitattributes` and config name a filter such as `python3 tools/clean.py` makes git spawn `/usr/bin/python3` through the inherited `PATH`. On a Mac without the developer tools, that is a stub that raises the same prompt. `core.fsmonitor=false` closes one helper and leaves this one open. The AD's "Prevents" clause claims "lets the repository's config start a helper process" is prevented, which is not true.
4. **Submodules.** Default status recurses into submodules with child git processes. These use git's own exec path, so they are safe for the prompt. But AD-1's "no other git command is run" is false, and the clean-filter route above repeats in every submodule.

Relative `PATH` entries (`.`, `bin`) are also not excluded. A builder who resolves them against the git working directory (the project) would execute a file named `git` in the project.

**Fix:** accept a candidate only when its first bytes are a Mach-O magic, and skip non-absolute `PATH` entries. Run git with a `PATH` that leaves out `/usr/bin`, or else write the clean-filter and submodule routes into AD-31 as accepted, untestable residuals and soften FR142's "never".

## H6. The snapshot admission plus the project-root real-path check still lets a renderer read an ignored secret

AD-13's stated reason for the second admission is that a renderer "could read `.env`". Suppose any writer the harness does not control (a persona's Bash step, a script) creates an untracked symlink, `notes/env-link -> ../.env`. Git lists `notes/env-link` as `untracked`, because git records the link and not its target, so the path is in the snapshot. Its real path is `<root>/.env`, inside the project's real path. The window opens and the watcher (with the project root as its boundary, which H1 forces) reads `.env`. The same happens without a symlink in the snapshot: AD-13 lets a window already open keep reading after its file leaves the list. A file admitted once, then replaced by a link to an ignored file, is re-checked only against the project root.

**Fix:** require that the file's real path, made project-relative, is itself a non-deleted path in the snapshot, both at open and on every read. Then a link opens only when its target is itself an uncommitted file.

---

## Medium

### M1. The snapshot union has no "not read yet" state

The union is: list, `no uncommitted changes`, `not a git repository`, `git not available`, `changes not read · <reason>`. `changes:get` must answer on connect, before the first read (and, with H4's Unit A, long before it). Builder A answers `no uncommitted changes`, a false fact (AD-20). Builder B answers `changes not read · not yet`, which tells the user something went wrong. Builder C returns `null`, which is not in the union. **Fix:** add a `reading` member, drawn as an empty half with no line.

### M2. AD-3's amendment and Story 9.3 disagree on whether this is a contract change

AD-3 calls `changes:changed` an event added "additively" to the contract. Story 9.3 says "the conversation contract is untouched" and "no new event is pushed to the conversation". `tests/contract.test.ts` pins `COMMANDS` at 8 and channels at 36, and AD-3's 2026-10-20 Story 8.7 note repeats "36 channels are unchanged". One builder adds `changes:changed` to `src/shared/events.ts`, changing the 17-event count. Another declares it in `channels.ts` only, as `install:changed` is. Both follow the letter of one document. Story 9.3's own split channel takes channels from 36 to 39. **Fix:** say in AD-3 that these are bridge channels like `install:*`, not domain events, and that the pinned channel count moves to 39.

### M3. The rule says "oversized → `not shown`", and the existing projection truncates

AD-13 now says a binary or oversized file "opens to one `not shown · …` line through a bounded read". `readDocument` and `DocSnapshot` carry `truncated: true` and show the first `DOC_MAX_BYTES`. That is the shipped behaviour for output-folder markdown. The amendment does not scope its rule to Changes-admitted files, so a builder may change what a large PRD shows. **Fix:** scope "oversized → not shown" to non-markdown text, or state that both admissions keep the existing truncation.

### M4. A renamed row has two paths in the snapshot

"Exactly a path in the Changes snapshot" admits either the row's path, or the path and its `from` path. That is a second rename question beside H2's. Builder B admits the old path, which is usually `missing` and may since have been recreated as something else. **Fix:** admit only the `path` of a non-`deleted` row, and say the `from` path is display only.

### M5. FR142's "within about two seconds" has no bound on the read itself

Latency is read time + 2s + read time in the worst case (a write lands just after a read samples it). `--untracked-files=all` together with `--no-optional-locks` means git **cannot write the untracked cache**, so every read is a full untracked walk. That is the costliest form of status, every 2s, while focused. No timeout value is named either: `runCommand` needs `timeoutMs`, and too low a value gives a permanent `changes not read · timeout` on a large repository. `MAX_BUFFER_BYTES` is a fixed 4 MiB, so an un-ignored `node_modules` gives `output-too-large`. The Open Item names the cost but not these two failure modes. **Fix:** name the timeout (for example 10s) and say that a timeout or an oversized output is `changes not read · too slow` or `· too many files`. Measure on this repository before build.

### M6. Environment hygiene removes three `GIT_*` variables and leaves the rest

`GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT/KEY_n/VALUE_n`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY` and `GIT_OPTIONAL_LOCKS=1` can all be inherited when the harness is launched from a terminal inside a git context (`npm run dev` from a hook or an IDE task). `GIT_COMMON_DIR` alone redirects which repository is read. **Fix:** remove every variable whose name starts with `GIT_`, then set `GIT_CEILING_DIRECTORIES`.

---

## Low

- **L1. Race between `doc.open` and a refresh.** A click on a row, then a refresh that drops the row (just committed), then `doc.open` arriving. The refusal is correct, but it gets the output-folder message (H1). With M1, a click before the first read is refused too. Name the refusal (`doc · no longer uncommitted`).
- **L2. Two project windows on one project** poll independently. That is fine, read-only and per window, but "one projection per project window" means each window's snapshot admits only its own rows. Confirm that the doc-bridge looks up the snapshot by the **sender's** window, through a named seam (`changesSnapshotFor(webContentsId)`), and not by project path.
- **L3. Worktrees and the ceiling.** A `.git` file with `gitdir:` outside the ceiling is fine: the ceiling limits discovery only, and discovery stops at the working directory. A non-real project path (`/tmp` → `/private/tmp`) makes git resolve the ceiling on every call, which costs a little. Pass real paths for both.
- **L4. Non-UTF-8 file names.** `runCommand` decodes stdout as lossy UTF-8. A path containing U+FFFD then names nothing on disk and opens `missing`. Reject U+FFFD in the fold, and say whether that fails the read.
- **L5. One hostile file name blanks the half.** Under "any record fails the whole read", a single file named with a bidi or control character, which a model can create, removes the Changes list for that project until the file goes. This is a defensible choice, but state it as intended.
- **L6. Spine hygiene.** The source-tree comment for `sources/` and `projections/` does not list `project` (git) or `changes`. CAP-7's row does not list AD-1, though the doc window now reads beyond the output folder. The platform row puts developer-tools paths outside `src/main/windows/` "beside `readBranch`", which is fine, but the first half of the row ("no OS branch elsewhere") still reads as absolute.
- **L7. Locator caching** is unspecified. If the locator is resolved once at startup, installing the developer tools while the app is open keeps `git not available` until restart. If it is resolved per read, it stats every `PATH` directory every 2s. Pick one: resolve per `focus`.

## Does AD-31 meet Story 9.3 and FR142?

| Clause | Met? | Why |
|---|---|---|
| Lists staged, unstaged and untracked-not-ignored files, project folder only | Partly | Yes for the command. No for directories with a trailing slash, type changes, copies and names with spaces (H2). |
| "within about two seconds while the window is in front" | Partly | Missed first focus (H4). No bound on read time (M5). |
| "reads nothing in the background" | Yes, nearly | The read in flight at `blur` finishes, which is allowed. The rule holds if `blur` is subscribed (H4). |
| Opens the file read-only; outside the project's real path opens nothing | **No as written** | The watcher boundary is still the output folder (H1). The symlink-to-ignored-file hole (H6). |
| One fact when there is nothing to list | Partly | A wrong `not a git repository` (H3). No pre-read state (M1). |
| "never causes the developer-tools prompt", proved by a test | **Over-claimed** | The spawn is guarded. Shim scripts, clean filters and copies are not, and a fake-runner test cannot see them (H5). |
| Contract untouched, channels tied to preload literals | Contradicts AD-3 | M2. |

## Does it prevent the macOS developer-tools prompt?

It prevents the route that caused the original concern: the harness spawning `/usr/bin/git`, directly or through a symlink. The real-path test is right for symlinks, and a `PATH` entry of `/usr/bin` is handled. It does not prevent the prompt in four cases:

- a shim script that falls through to the system git (asdf, mise or a hand-written wrapper);
- a copy of the stub;
- a repository-configured clean filter whose command resolves to a `/usr/bin` stub such as `python3`;
- the same filter in any submodule.

The first two are closed by requiring a Mach-O header. The last two need git's `PATH` to leave out `/usr/bin` or an explicit accepted residual. The unit test the AD promises (fake runner, fake file system) can prove only the spawn-site guarantee, so FR142's "never" should be scoped to it.

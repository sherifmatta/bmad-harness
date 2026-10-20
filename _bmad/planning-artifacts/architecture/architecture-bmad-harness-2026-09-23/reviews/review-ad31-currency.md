# Currency / reality-check review: AD-31 and the 2026-10-20 amendments to AD-1 and AD-13

Reviewed 2026-10-20 against `ARCHITECTURE-SPINE.md` (AD-1 rule amendment, AD-13 amendment, AD-31), the current git-scm.com reference pages, and published descriptions of the macOS `/usr/bin` developer-tools shims. The only `git` on this machine's `PATH` is `/usr/bin/git` (the shim), so per instructions no git command was run. The code read was `src/main/sources/install/run-command.ts`, `src/main/sources/preflight/login-path.ts` and `src/main/sources/project/branch.ts`.

**Verdict:** the core claims are correct. They are: `--no-optional-locks` suppresses the index write, `-c` overrides repo `core.fsmonitor`, the ceiling semantics, and the v2 record grammar. But AD-31 and AD-1 claim more than the one command delivers. Repository config can still start programs (clean/process filters, submodule recursion, lazy fetch in partial clones), and some of those can write under `.git/`. The environment is scrubbed by denylist, which is too narrow. The fold's "unrecognised record fails the read" collides with records that repo config legitimately produces (`C` copies). None of these needs the decision reversed. Each needs a sentence and, in places, one more override.

---

## Claim-by-claim

### (1) Plain `git status` may write `.git/index`; `--no-optional-locks` prevents it. HOLDS.
git-status "BACKGROUND REFRESH": "By default, git status will automatically refresh the index, updating the cached stat information from the working tree and writing out the result … Scripts running status in the background should consider using `git --no-optional-locks status`." git(1): `--no-optional-locks` is "equivalent to setting the GIT_OPTIONAL_LOCKS to 0". Because it is an env var, it propagates to child `git` processes (submodule status). The untracked-cache update is part of the same optional index write, so it is skipped too.
Sources: https://git-scm.com/docs/git-status#_background_refresh , https://git-scm.com/docs/git#Documentation/git.txt---no-optional-locks

**Consequence the spine doesn't state:** because the index is never refreshed, any stat-dirty entry is re-hashed by git on every read, every 2s, forever. Examples are files touched but not changed, or files checked out by another tool. A clean filter runs on each such re-hash (see 6a). This turns the open question at line 461 ("cost of a 2s status read") into a known amplifier, not just an unknown.

### (2) `-c core.fsmonitor=false` disables a repo-configured hook or daemon. HOLDS.
git-config: `core.fsmonitor` is either a boolean (`true` uses the built-in daemon) or a hook pathname that git executes. `-c` "will override values from configuration files". `false` covers both forms. `core.fsmonitorHookVersion` is then irrelevant. Because `-c` values travel to children via `GIT_CONFIG_PARAMETERS`, the override also reaches submodule `git status` children.
Sources: https://git-scm.com/docs/git-config#Documentation/git-config.txt-corefsmonitor , https://git-scm.com/docs/git#Documentation/git.txt--cltnamegtltvaluegt

### (3) `GIT_CEILING_DIRECTORIES` = project parent. HOLDS, with one macOS caveat.
git(1): the list names "directories that Git should not chdir up into while looking for a repository directory … It will not exclude the current working directory". With cwd = project root, git still checks `<root>/.git`, whether that is a directory or a `gitdir:` file (the ceiling governs only the upward walk, not where a gitfile points). It does not step into the parent. So a project inside a larger repo exits 128. The spine's recorded check ("exit 128 from a subfolder with the ceiling at the root") is the same geometry and is consistent.

Caveat (medium): git compares ceiling entries against the **real** cwd, resolving symlinks in the entries by default. If the project path the harness holds goes through a symlink, `dirname(projectPath)` can resolve to a directory that is not an ancestor of the real cwd. Examples: `~/work/proj` → `/Volumes/X/proj`, or `/tmp` → `/private/tmp`. In that case the ceiling never matches and the parent repository is discovered, which is the exact thing AD-31 says it prevents. Fix: set the ceiling to `dirname(realpath(projectFolder))` and spawn with `cwd = realpath(projectFolder)`.

Also: exit 128 is also what git returns for `safe.directory` refusals (repo owned by another user) and for a corrupt index. With stderr dropped, all of these collapse into `not a git repository`. That is acceptable, but the spine should say the state means "git would not read it", not literally "no repository".
Source: https://git-scm.com/docs/git#Documentation/git.txt-GITCEILINGDIRECTORIES , https://git-scm.com/docs/git-config#Documentation/git-config.txt-safedirectory

### (4) Porcelain v2 `-z` records. HOLDS, but the fold's closed set is too closed.
Verified grammar (git-status "Porcelain Format Version 2"):
- `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
- `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><NUL><origPath>`. With `-z` the two paths are NUL-separated, not TAB-separated, so a rename consumes **two** NUL-terminated fields. `<X>` is `R` **or `C`**.
- `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
- `? <path>`; `! <path>` appears only with `--ignored`, which is not passed.
- `#` headers appear only with `--branch` or `--show-stash`, which are not passed.

Issues:
- **`C` records.** `status.renames=copies` (or `diff.renames=copies` when `status.renames` is unset) in repo or user config makes git emit `2 … C<score>` records. Under "any record the fold does not recognise fails the whole read", a user's ordinary config permanently breaks the list. Conversely, `status.renames=false` silently turns renames into `D`+`?`/`A`. Fix: pin `-c status.renames=true` on the command (it is deterministic and removes the `C` case). Alternatively, accept `C` and map it to `added`, keeping the origPath.
- **XY alphabet.** v2 uses `.` for unchanged and the letters `M T A D R C U`. `T` (typechange, e.g. file ↔ symlink) has no explicit home among the six states. The spine should map it to `modified` explicitly, so the closed-shape rule doesn't reject it.
- **`<sub>` field.** Submodule entries are ordinary `1` records with `<sub>` = `S<c><m><u>`. They fold fine, but see 6c.
- **`core.quotePath=false` is redundant.** With `-z` "pathnames are printed as-is and without any quoting". It is harmless, but the spine shouldn't imply it is load-bearing.
- **Encoding.** `runCommand` decodes stdout as UTF-8. A non-UTF-8 filename becomes U+FFFD, then fails to open via the AD-13 snapshot admission (the path in the snapshot isn't the path on disk). Add U+FFFD to the path validator's rejected characters, so that case fails loudly instead of producing an unopenable row.
- **`--untracked-files=all` is right** for a per-file tree (`normal` collapses untracked directories into one `dir/` entry, which the fold would have to special-case). It overrides `status.showUntrackedFiles` in config, which is good. Cost: it enumerates every file in a large un-ignored directory, for example an un-ignored `node_modules`. The 4 MiB `MAX_BUFFER_BYTES` will trip first and give `changes not read · output-too-large`. That is a correct failure, but it should be named in the open question about cost.
Source: https://git-scm.com/docs/git-status#_porcelain_format_version_2 , https://git-scm.com/docs/git-config#Documentation/git-config.txt-statusrenames

### (5) Absolute real git never raises the install prompt; which other shims exist. MOSTLY HOLDS.
`/usr/bin/git` is a small stub that defers to `xcrun`/libxcselect to find the active developer directory. If none exists, it raises the "install command line developer tools" dialog. JGit shipped the same avoidance (commit "FS_POSIX: avoid prompt to install the XCode tools on OS X"). The real binaries under `/Library/Developer/CommandLineTools/usr/bin/` and `/Applications/Xcode.app/Contents/Developer/usr/bin/` are not stubs and don't consult xcode-select. Homebrew's git (`/opt/homebrew/bin/git`, `/usr/local/bin/git`) is a normal build and doesn't call `xcrun` at runtime. Realpath-checking against `/usr/bin/git` and `/usr/bin/xcrun` is correct for symlinks.

Gaps:
- **Wrapper scripts are not caught by realpath.** A `git` in a login-path directory that is a shell script or version-manager shim, which itself execs `git` from `PATH`, has a realpath that is not `/usr/bin/git` but still reaches the stub. On a machine without CLT, `/usr/bin` is the only `git` on a launchd-style `PATH`. Fix: order the candidates with the two developer-tools paths and the Homebrew prefixes first, and reject any candidate that is not a Mach-O binary. A cheap check is the magic bytes `cf fa ed fe` / `ca fe ba be`, read via `fs`, not by running it.
- **Children of git resolve programs through `PATH`.** Filter and process drivers (6a), `git-lfs`, hooks run by other code, and `sh -c` commands from config all inherit `process.env.PATH`. `login-path.ts` builds that from the login shell, the app's own PATH, and the usual directories, so it includes `/usr/bin`. The `/usr/bin` stubs include `git`, `xcrun`, `make`, `cc`/`clang`/`gcc`, `python3`, `swift`, `lldb` and others. A repo filter that invokes `python3` or `make` on a CLT-less Mac can therefore still raise the prompt. Git's own sub-git calls use its exec-path, not `PATH`, so submodule recursion is safe on this point.
- **Xcode-only installs with an unaccepted license.** Unverified whether running `Xcode.app/.../usr/bin/git` directly enforces the license. The license check is generally reported as an xcrun/shim behaviour. Treat this as an open item rather than a claim.
Sources: https://developer.apple.com/forums/thread/672087 , https://git.jakstys.lt/motiejus/jgit/commit/9fe54061197c42faedc9417bdc70797681aa06d6 , https://inventivehq.com/knowledge-base/macos/xcrun-invalid-active-developer-path-fix

### (6) Other config that makes `git status` execute a program. THE SPINE OVERCLAIMS.
AD-31's "Prevents" says the command cannot let "the repository's config start a helper process". With only `core.fsmonitor` overridden, that is not true:

a. **Clean / process filters (high).** When git must re-hash a stat-dirty worktree file to decide whether it changed, it runs it through the `.gitattributes`-selected `filter.<driver>.clean` or `filter.<driver>.process` from config. Git LFS is the common case. git-lfs issue #4983 documents `git status` reading every LFS file back through the filter. LFS's clean step writes objects into `.git/lfs/objects/`, which breaks AD-1's amended "includes `.git/`". Per (1), with no index refresh this repeats every 2s. There is no generic `-c` override because driver names are arbitrary. Options:
   - (i) Accept it under AD-13's "project code is trusted" principle, and amend AD-1 and AD-31 to say a configured filter may run and may write where that filter writes.
   - (ii) Read `.git/config` in-process for `filter.*` keys and pass `-c filter.<name>.clean= -c filter.<name>.process= -c filter.<name>.required=false` for each. This changes the result: filtered files would compare raw, so they may show as modified.

   Recommend (i) plus a sentence, since (ii) yields wrong answers. Source: https://git-scm.com/docs/gitattributes#_filter , https://github.com/git-lfs/git-lfs/issues/4983

b. **Lazy fetch in partial clones (medium).** In a `--filter=blob:none` clone, git can fetch missing objects on demand. That spawns a network transport (`ssh` via `core.sshCommand`, credential helpers) and writes into `.git/objects`. Fix: set `GIT_NO_LAZY_FETCH=1` in the child env (documented in git(1), git ≥ 2.44/2.45). Older gits ignore it harmlessly. Source: https://git-scm.com/docs/git#Documentation/git.txt---no-lazy-fetch

c. **Submodule recursion (low/medium).** By default, status runs a child `git status` in every populated submodule, using that submodule's own config. `GIT_OPTIONAL_LOCKS` and `-c` propagate, so writes and fsmonitor are covered, but filters in submodules are not. That multiplies the 2s cost. Fix: add `--ignore-submodules=dirty`. Gitlink commit changes still show and no child process starts. Rows are still `1` records with `<sub>` = `S…`. Source: https://git-scm.com/docs/git-status#Documentation/git-status.txt---ignore-submodulesltwhengt

d. **Not applicable (confirmed non-issues):** `core.hooksPath` and hooks (status runs no hook), `diff.<driver>.textconv` and `diff.external` (diff-only, never used by status), `core.pager`/`pager.status` (stdout is a pipe), `core.editor`, `gpg.*`, and `credential.*` (only reachable via 6b). `include.path`/`includeIf` read files but execute nothing.

e. **Environment is scrubbed by denylist (medium).** `runCommand` passes `env` straight through, and in a terminal launch (`npm run dev`) that is the developer's whole shell env. Besides `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`, the following steer what git reads or writes:
   - `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES` and `GIT_NAMESPACE` change which repository is read.
   - `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`/`_KEY_n`/`_VALUE_n`, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` inject config, including filters and fsmonitor ahead of or around the `-c` flags.
   - `GIT_TRACE*` "set to an absolute path … will try to append the trace messages to it", which is a file write possibly inside the project.
   - `GIT_DISCOVERY_ACROSS_FILESYSTEM` also matters.

   Fix: build the child env from an allowlist (`PATH`, `HOME`, `LANG`/`LC_*`, `TMPDIR`, `USER`) plus `GIT_CEILING_DIRECTORIES`, `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1` and `GIT_TERMINAL_PROMPT=0`, and drop every other `GIT_*` variable. Source: https://git-scm.com/docs/git#_environment_variables

### AD-13 amendment
There are no external-currency claims here beyond the above. One consequence follows from (3): if the snapshot's paths are relative to a symlinked project path while admission compares real paths, the "inside the project folder's real path" check is right. It does depend on resolving the project root once, consistently, which is the same fix as in (3).

---

## Suggested command after fixes

```
<abs real git> --no-optional-locks \
  -c core.fsmonitor=false -c core.untrackedCache=false -c status.renames=true \
  status --porcelain=v2 -z --untracked-files=all --ignore-submodules=dirty
cwd = realpath(project)
env = allowlist + GIT_CEILING_DIRECTORIES=dirname(realpath(project)) GIT_OPTIONAL_LOCKS=0 GIT_NO_LAZY_FETCH=1 GIT_TERMINAL_PROMPT=0
```

`core.untrackedCache=false` is optional. Its writes are already suppressed, so it only avoids reading a stale cache. `core.quotePath=false` can stay or go.

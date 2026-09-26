# Dependencies

**The set is bumped together or not at all.** These versions were verified
against the npm registry as a set that installs together, with no unmet peer
ranges. Three rows are deliberately held below their newest published version,
and each hold-back is a constraint imposed by another row — so bumping any one
of them individually breaks the set rather than improving it.

`node scripts/check-pins.mjs` (also run by `npm run lint`) asserts every row
below resolves to its exact version in `package-lock.json`. If you change a
version, change it there and here in the same commit. `.npmrc` sets
`save-exact=true`, so the next `npm install <pkg>` cannot quietly write a caret
range into an exactly-pinned set.

## The pinned set (NFR11)

| Name | Version | Why this pin |
| --- | --- | --- |
| Electron | 44.4.5 | current stable |
| React (and `react-dom`) | 19.3.0 | current stable |
| TypeScript | 6.0.3 | **held below 7.x** — see below |
| Vite | 7.3.6 | **held below 8.x** — see below |
| electron-vite | 5.0.0 | current stable |
| `@vitejs/plugin-react-swc` | 4.3.3 | not `@vitejs/plugin-react` — see below |
| electron-builder | 26.15.3 | current stable |
| Vitest | 5.0.1 | peers `vite ^6.4 \|\| ^7 \|\| ^8`; transpile-only, so unaffected by the TypeScript pin |
| typescript-eslint | 8.70.1 | the constraint behind the TypeScript pin |
| chokidar | 4.0.3 | **held below 5.x** — see below |
| markdown-it | 15.0.2 | current stable |
| DOMPurify | 3.4.16 | current stable |

Electron 44 bundles Node 24.18.1 and Chromium 152. The `claude` CLI and
`uv`/Python 3.11+ are the developer's own installs and are not dependencies of
this package.

## The three hold-backs

**TypeScript is held at 6.0.3, not 7.x.** `typescript-eslint@8.70.1` peers
`typescript >=4.8.4 <6.1.0`, so under TypeScript 7 the project has no linter at
all — and the layer rule is a lint error, not a convention, so losing the linter
loses the layering guarantee. Revisit when typescript-eslint publishes a release
peering TypeScript 7.

**Vite is held at 7.3.6, not 8.x.** `electron-vite@5.0.0` peers
`vite ^5.0.0 || ^6.0.0 || ^7.0.0`. Vite 8 is supported only by
`electron-vite@6.0.0-beta`. Revisit when electron-vite 6 is stable — Vite and
electron-vite move together.

**chokidar is held at 4.0.3, not 5.x.** chokidar 5 is ESM-only. The main process
builds CJS with its dependencies externalised (see `electron.vite.config.ts`),
so the bundle emits `require('chokidar')` and a chokidar 5 would fail with
`ERR_REQUIRE_ESM` at runtime rather than at build time. Revisit only alongside
an ESM main build — that is one change, not two.

A fourth, related choice: `@vitejs/plugin-react-swc@4.3.3` rather than
`@vitejs/plugin-react`, whose 6.x peers `vite ^8.0.0` only. With electron-vite
pinned to Vite 7, no Vite version satisfies both, so the SWC plugin is the only
React plugin that fits the set.

## Additions this project chose

NFR11 does not pin these; they are the toolchain and type packages the pinned
set needs in order to build, lint and typecheck. They are pinned exactly for
reproducibility, but they are not part of the "bumped together" set and may be
moved on their own as long as `npm run lint`, `npm run typecheck`,
`npm run build` and `npm test` all still pass.

| Name | Version | Why |
| --- | --- | --- |
| `eslint` | 10.11.0 | inside `typescript-eslint@8.70.1`'s peer range `^8.57.0 \|\| ^9 \|\| ^10` |
| `eslint-plugin-react-hooks` | 7.1.1 | peers `eslint ... \|\| ^10.0.0`; the rules-of-hooks check for `src/renderer/` |
| `@types/react` | 19.3.0 | tracks the React pin |
| `@types/react-dom` | 19.3.0 | tracks the React pin |
| `@types/node` | 24.19.0 | satisfies Electron 44's `@types/node ^24.9.0` and Vitest 5's `^22 \|\| >=24`, and matches the Node 24 runtime Electron 44 bundles — one copy in the tree rather than two |
| `@types/markdown-it` | 14.2.0 | markdown-it 15 ships its own `.d.cts` types and wins resolution, so this is belt-and-braces only; drop it if it ever conflicts |
| `husky` | 9.1.7 | the pre-commit gate — tooling only, not part of the pinned application stack, and not shipped in any bundle |

`husky` is the one row here that nothing builds, lints or typechecks against:
it exists so that the guards this repository already owns run without anyone
choosing to run them. It is not in `scripts/check-pins.mjs`'s `PINS` — that
object is the twelve NFR11 rows and stays that — but it is pinned exactly like
everything else, because `.npmrc` sets `save-exact=true` and a hook that
behaves differently on two machines is worse than no hook.

The wiring is two pieces: the `prepare` script runs `husky` on every
`npm install`, which points `core.hooksPath` at `.husky/_`, and
`.husky/pre-commit` runs `npm run lint`, `npm run typecheck` and `npm test`.
`npm run build` is deliberately absent: it is the only one of the four that
writes to the tree (`out/`, which `npm run dev` serves from), and the only one
whose cost grows with the renderer. See the comment in `.husky/pre-commit`.
`.husky/_/` is generated and git-ignores itself, so a fresh clone has no hook
until `npm install` has run — which is the first command below.

`@swc/core` is not declared here: it is a peer of `electron-vite` satisfied
transitively by `@vitejs/plugin-react-swc`'s own dependency on it.

## Verifying the install

```
npm install
npm ls --all 2>&1 | grep 'UNMET\|invalid' | grep -v 'UNMET OPTIONAL DEPENDENCY'
node scripts/check-pins.mjs
git config core.hooksPath
```

The second command must print nothing, the third likewise, and the fourth must
print `.husky/_` — anything else means `npm install` did not run `prepare` and
this clone commits without the gate. The `UNMET OPTIONAL DEPENDENCY` lines the
second command filters out are the cross-platform prebuilt binaries of
`@swc/core` and `esbuild` (`*-linux-*`, `*-win32-*`, and the other
architectures). They are `optionalDependencies` that npm correctly declines to
install on this machine, they are not peer dependencies, and their absence is
the expected state on any single platform.

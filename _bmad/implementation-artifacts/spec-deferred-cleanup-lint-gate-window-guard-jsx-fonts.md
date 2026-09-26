---
title: 'Three deferred items: the lint gate, the window guard, and JSX font stacks'
type: 'chore'
created: '2026-09-26'
status: 'ready-for-dev'
baseline_commit: 'f791f59'
context: []
---

# Three deferred items

Three independent items lifted from `_bmad/implementation-artifacts/deferred-work.md`
and the Story 1.4 review. They share no files and can be done in any order.

Repository conventions that bind all three:
- Every dependency is declared at an **exact** version. No ranges, anywhere.
- `npm run lint` is `eslint . --max-warnings 0 && node scripts/check-pins.mjs`.
- Tests are Vitest under `environment: 'node'` — **no DOM environment exists**
  and none may be added. `tests/**/*.ts` is the node program (`types: ["node"]`,
  no DOM lib); `src/renderer/**/*.{ts,tsx}` is the web program (DOM lib, no node
  types). A `.tsx` file under `tests/` is typechecked by neither.
- House style: one exported concept per module, comments explain *why*, and a
  test's name states the defect it makes impossible.
- Verification gate for all three: `npm test`, `npm run lint`,
  `npm run typecheck`, `npm run build` must each exit zero.
- Do not add epic/story references as code comments.

---

## Item 1 — Nothing runs `npm run lint` except a human typing it

**Problem.** `.github/` and `.husky/` do not exist. `scripts/check-pins.mjs` runs
only as part of `npm run lint`, so the guarantee Story 1.2 framed as "the pin set
is verifiable by command, not by reading" holds only when someone chooses to run
the command. The same is true of every guard Stories 1.3 and 1.4 added — the
NFR23 literal sweep, the focus-ring assertions, the live-region sweep. A guard
nobody runs is a guard nobody has.

**Decision already made — do not relitigate it.** A **husky pre-commit hook**.
The alternatives (a GitHub Action, a plain `core.hooksPath` hook) were considered
and declined: the user wants the commit blocked locally, before it lands.

**Approach.**
- Add `husky` as a devDependency at an **exact** version (`9.1.7` is current).
  This is a new dependency *outside* the NFR11 pinned set. That is accepted here,
  but it must be recorded: add a row to `DEPENDENCIES.md` in the existing table's
  style, saying what it is for and that it is tooling rather than part of the
  pinned application stack. Do **not** add it to `scripts/check-pins.mjs`'s
  `PINS` — that object is the twelve NFR11 rows and must stay that.
- Add the `prepare` script husky needs, and the `.husky/pre-commit` hook.
- The hook runs the checks that are fast enough to sit in front of every commit.
  `npm test` (~0.7s), `npm run lint` and `npm run typecheck` all qualify.
  `npm run build` is the slow one — judge whether it belongs and say why either
  way in the hook or `DEPENDENCIES.md`.
- `npm install` will rewrite `package-lock.json`. That is expected. Afterwards
  `node scripts/check-pins.mjs` must still print nothing.

**Verify it actually blocks.** A hook that is installed but not wired is the
same defect one level up. Prove it: stage a change that fails one of the checks,
attempt a real commit, show it was refused, then restore. Do not leave the probe
committed, and do not use `--no-verify` to get out of it.

**Watch for.** `DEPENDENCIES.md` ends with a "Verifying the install" section
whose commands must still be true after this change.

---

## Item 2 — "One window per project, always" is a boundary nothing enforces

**Problem.** `src/main/windows/main-window.ts` keys
`projectPathsByWebContents` window→path, never path→window, so no structure
would refuse a second window opened on a project that is already open. Story
1.2 states one-window-per-project as a boundary; nothing tests it.

**Reachability, stated honestly.** Unreachable today — each process opens
exactly one window. It becomes load-bearing the moment a second window is
reachable, which is Story 1.12's document window. The value here is that the
boundary stops being prose.

**Approach.**
- Give the module a path→window index alongside the existing one, and make
  `createProjectWindow` return the **existing** window for a project already
  open rather than constructing a second one. Returning the live window is
  preferred over throwing: the caller asked for that project's window and there
  is one.
- Both indexes must be cleaned up on `closed`, or the second call after a close
  returns a destroyed window — that is the defect most likely to be introduced
  here, so test it directly.
- Do not change the security posture, the title logic, the `ready-to-show`
  behaviour or the `did-fail-load` handler.

**Tests** go in `src/main/windows/main-window.test.ts`, which already mocks
`electron` with a `BrowserWindow` class. Cover at least: a second call for the
same path returns the same window and constructs nothing new; a call for a
different path does construct a second; and after a window closes, a fresh call
for that same path constructs a new one rather than handing back the dead one.
The mock's `on()` is currently a no-op — to test the close path you will need it
to record the `closed` handler, the way `webContents.on` is already recorded.

---

## Item 3 — The inline-style guard misses camelCase font stacks

**Problem.** `inlineStyleLiteralsIn()` in `tests/literal-guard.ts` catches hex
colours, colour functions and dimensions inside `style={{ … }}` props, but the
shared `font stack` rule in `LITERAL_RULES` is
`/font(?:-family)?\s*:\s*[^;}]*[a-zA-Z][^;}]*/g` — it matches CSS's
`font-family:`, not JSX's `fontFamily:`. So
`style={{ fontFamily: 'Menlo, monospace' }}` passes the guard while
`font-family: Menlo` in a stylesheet fails it. NFR23 calls a literal font stack
in a component a defect; one spelling of it is currently undetectable.

**Approach.**
- Teach the guard the JSX spelling **without weakening the CSS rules**. The
  existing `LITERAL_RULES` array is shared with the stylesheet sweep, which is
  green across the whole tree and must stay exactly as strict as it is — do not
  loosen a pattern that stylesheets depend on.
- The `var()` per-value exemption must keep working: a JSX font stack reaching
  its value through `var(--mono)` (e.g. `fontFamily: 'var(--mono)'`) is
  **compliant** and must not be reported. The exemption logic lives in
  `literalsIn()` and treats `font stack` and `radius` specially — make sure
  whatever you add lands on the right side of it.
- While you are here, check the same class of gap for the other camelCase
  spellings a `style` prop can carry that the CSS rules name in hyphenated form
  (`borderRadius` against the `radius` rule is the obvious one). Fix what is
  genuinely missed; do not invent rules for properties the contract does not
  name.

**Tests** go in `tests/tokens.test.ts`, in the existing
`describe('the NFR23 literal guard, inside a component')` block, matching its
`it.each` probe style. Add a probe for each spelling you now catch, and a
compliant counter-probe that must stay silent. The existing probe asserting that
literals *outside* a style prop are ignored must keep passing — Story 1.6's
portrait palettes are literal hex in source by design and a blanket scan would
make them unwritable.

**Prove it bites.** For each rule you add, mutate a real file under `src/` so the
guard should fire, confirm the suite goes red, and restore. A guard nobody has
watched fail is a guard nobody knows is wired.

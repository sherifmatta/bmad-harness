---
title: 'Every person is an initials disc, and the portrait is gone'
type: 'refactor'
created: '2026-10-15'
status: 'done'
baseline_revision: '538ce797e2d12f09a60bbf5edb4054d3baf54a26'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-7-context.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The owner removed illustrated portraits from the whole product (2026-10-15, FR136, UX-DR55), but six call sites still draw one (Team tile 36px, cast card 44px, cast chooser 36px, Welcome card 44px, Agents-panel row 36px, empty-thread introduction 44px) and the code, tokens and pinned tests that carry it remain. `tests/tokens.test.ts` is already red on `--tile-height` 56px vs `DESIGN.md`'s 44px.

**Approach:** Draw each of the six as the existing `<Initials size={26}>` beside the name, make the tile a 44px row, and delete the portrait module, its parameter module, stylesheet, tokens, `DESIGN.md` keys and pinned tests together, moving `PersonaState` to `status/persona-state.ts`. Nothing replaces the portrait.

## Boundaries & Constraints

**Always:** `Initials` keeps its signature, sizes (26, 22, 20) and 20px reveal; letters come from `initialsOf` (`M J S W A` for the five core personas). Every disc is `aria-hidden` with no tab stop, carries the one `initials` class (at 26px `initials--thread`) and no `style` attribute, persona-specific class or colour; it resolves through `initials-bg`/`initials-line`/`initials-ink`, which have light twins. A tile stays one native button with `aria-label` `name, title, state`, the roving tab stop and arrows, `panel-2` hover, the `aria-current` edge, idle dimming and the hover/focus menu hint. `--tile-height` is `44px` (`DESIGN.md` `components.persona-tile.height`); the build settles padding or leading by **measuring a rendered tile in the running app** (the `run` skill; the five core personas) and writes the number into `DESIGN.md`, since a `min-height` the content overrides would pass every jsdom test and still be 56px. The cast card keeps `min-width: 148px`, default `{opacity.idle}`, hover `{opacity.hover}`, name/title/status type and its lit border, ground, glow and equaliser, and loses its ring. The Welcome card stays content only (no tab stop, hover, handler, highlight) at full opacity, its accessible name its own text. The Agents-panel row stays text, the introduction stays read-only. `PersonaState` moves to `status/persona-state.ts` beside `STATE_TEXT` and every importer is repointed; `PersonaIdentity` is deleted. `DESIGN.md`'s `portrait` block, `cast-card.portraitSize`, `welcome.portraitSize` and their "removed, kept until" comments, and every test reading them, move in **one change** (no state leaves a test reading a deleted key). `FR80` stands: roster `icon` is never drawn, and its test is kept. `CONTRACT_VERSION`, the snapshot and the roster are unchanged.

**Never:** a skill seat, live dot, `Skill Session` button or `/` disc (7.3, 7.4, 7.5); a new colour, token, size or component; any replacement identity device (image, icon, emoji, tint, per-persona colour, per-person `<svg>`); a change to what any tile, card or row does, says or orders; an edit to the Architecture Spine (AD-16's amendment is `bmad-architecture`'s; if it has not landed, say so in the Auto Run Result and do not edit it); deleting `mockups/portrait.html` or the untracked `portraits/prompts` folder; keeping a test that reads a deleted key or module.

</intent-contract>

## Code Map

Call sites (each swaps `portrait(artParamsFor(id), N, state, identity)` for `<Initials name={...} size={26}>`; read `Initials`' props in `src/renderer/ui/persona/initials.tsx:71` first):
- `src/renderer/ui/team/persona-tile.tsx:62` (36px, tile) with `team/team.css:33-37` (`.persona-tile` `min-height: var(--tile-height)`, `padding: var(--tile-padding)`, `.persona-tile .portrait` rule) -- the 44px row.
- `src/renderer/ui/party/cast-strip.tsx:40-41` and `cast-strip.css:49-58` (`.cast-portrait`, `--cast-portrait`, speaking ring `--cast-ring`) -- wrapper stays `aria-hidden`; ring rule deleted.
- `src/renderer/ui/party/cast-chooser.tsx:56` (36px), `cast-chooser.css:50` reads `--tile-height` (check it still fits 44px).
- `src/renderer/ui/welcome/lanes.tsx:39` (44px).
- `src/renderer/ui/board/board-agents-panel.tsx:28` (36px) with `shell/shell.css` `.board-agent .portrait`.
- `src/renderer/ui/shell/thread-intro.tsx:21` (44px) with `shell/thread-intro.css` `.thread-intro > .portrait`.

Deletions: `src/renderer/ui/persona/portrait.tsx` (exports `PersonaState`, `PersonaIdentity`, `portrait`), `portrait.css`, `art-params.ts`; `persona/` then holds `initials.tsx`, `initials.css` and tests only.

`PersonaState` importers (27 files import `persona/portrait`; repoint the type to `status/persona-state.ts`, find them with `grep -rln "persona/portrait\|from './portrait'" src tests`): `status/persona-state.ts`, `status/status-dot.tsx`, `team/{team,team-strip,persona-tile}.tsx`, `board/{board-view,board-agents,board-activity,board-figures,board-agents-panel}`, `shell/shell.tsx`, `chat/chat-header.tsx`, `welcome/lanes.tsx` and their tests, `tests/board-audit.dom.test.tsx`, `tests/output-folder-contract.test.ts` (check why it matches).

Tokens `src/renderer/design/tokens.css`: `--tile-height:56px` (432 -> 44px), delete `--cast-portrait` (255), `--cast-ring` (261), `--lh-none` (121, only reader was `portrait.css`; confirm by grep, else keep and say what reads it); reword the comments at ~116 and ~177 naming the portrait / "the 56px tile".

Tests to change (each read before editing; add none to the list without saying why in the log):
- Delete with the module: `tests/persona.test.ts` portrait parts (curated five, derivation, the transcription vs `mockups/portrait.html`, salted hash, tone shift, `components.portrait` visual-contract tests; `PORTRAIT_TSX`, `PORTRAIT_CSS`, `ART_PARAMS`, `MOCKUP`, `CURATED_AGENT_IDS`) and the portrait half of `src/renderer/ui/persona/persona.test.tsx`.
- Rewrite and rename `tests/persona.test.ts` -> `tests/initials.test.ts` (initials radius only; `sheets = [INITIALS_CSS]`; drop the `--lh-none` test; keep the FR80 config-glyph/collision guard; keep the "faces in the running app" assertions with a literal list of the five ids).
- `tests/tokens.test.ts`: `:515` tile height from `components.persona-tile.height`; `:527-534` become `discSize` resolving to `--initials-size-thread` on tile, cast card and Welcome, plus absence of `--portrait`, `--cast-portrait`, `--cast-ring`, `--lh-none`; add the three names to the "no component dimension" list (`:498`); **re-pin the digest of the promoted token block** (`:888`, "leaves the dark theme as it was") with the dated comment the test carries for earlier changes.
- `tests/team-contract.test.ts:135` (44px), `:409-411` (`<Initials` at 26, no `artParamsFor`; keep the chat-header half), `:275`; `tests/welcome-contract.test.ts:432` (one 26px disc per card, none dimmed); `welcome/welcome-app.test.tsx:151,164`; `welcome/personas.test.ts:17` (drop "curated faces" reason); `team/persona-tile.test.tsx:40`; `party/cast-strip.test.tsx:43`; `party/cast-chooser.dom.test.tsx:44`; `shell/thread-intro.test.tsx:28`; `shell/negative-surface.test.tsx:212-217` and `tests/board-audit.dom.test.tsx:258-259` -> "the Board draws no image at all"; `theme-audit.dom.test.tsx:15-16,173-199` (delete the portraits block if `tokens.test.ts` already pins the twins, else replace with the twin check; say which in the log); `app.test.tsx:2239` (drop `.turn--pending .portrait` from the selector).
- Keep as standing prohibitions: `epic-4-audit.dom.test.tsx`, `chat/sysline.test.tsx`, `outputs/output-row.test.tsx`, `tests/negative-surface.test.ts:956,2747`, `tests/conversation-contract.test.ts:263`.
- New source-tree test (put it in `tests/initials.test.ts`, using the comment-stripping helper the contract tests use): fails on any module named for a portrait, `portrait(`, `artParamsFor` or an import of either, the classes `portrait`, `portrait-face`, `cast-portrait`, and any `<svg>` drawn for a person under `src/renderer`. New disc test (renderer DOM, mount real Team, cast strip, Welcome, chooser, Agents panel, introduction): every disc has class `initials` (`initials--thread` at 26), no `style`, no persona-specific class, is `aria-hidden`, letters `M J S W A`; no `<svg>`/`img` on those surfaces.
- Pre-existing red to turn green: `tests/tokens.test.ts` -> "carries the status dot and the persona tile" (`--tile-height` 56px vs 44px).

Docs: `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md` -- delete the `portrait:` block (~337-370), `cast-card.portraitSize` (~551) and `welcome.portraitSize` (~571) with their comments; reword the *Portrait (removed)* note (~909) to say the code is gone too; keep `mockups/portrait.html` in `sources:` as history; write the settled tile padding/leading where *Persona tile* states the row. Dated 2026-10-15 notes citing the decision in `_bmad/specs/spec-bmad-visual-harness/SPEC.md` (CAP-3, CAP-10) and `ui-surfaces.md` -> *Portraits* (~119); epics notes for FR18, FR79, FR109, FR111, FR121, FR128, NFR28, UX-DR13-17, UX-DR26 already exist (verified), Stories 1.6, 1.10, 2.14, 4.2, 5.1, 5.2, 6.6 carry notes (verified at 914, 1076, 1740, 2646, 3006, 3522); add any that are missing. Read `EXPERIENCE.md` *Portrait* row (~172) -- already written by the ux run.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/status/persona-state.ts` and the ~27 importers -- move `PersonaState` here, repoint imports -- the module that owned it is being deleted
- the six call-site `.tsx`/`.css` pairs above -- draw `<Initials size={26}>`, drop portrait rules and the cast ring, set the 44px tile -- FR136, UX-DR55
- `src/renderer/design/tokens.css` -- `--tile-height:44px`, delete three tokens, reword two comments -- the tokens leave with the portrait
- `src/renderer/ui/persona/portrait.tsx`, `portrait.css`, `art-params.ts`, `tests/persona.test.ts` portrait half, `persona.test.tsx` portrait half -- delete; rename and rewrite as `tests/initials.test.ts`
- the tests listed above -- rewrite, repoint, re-pin the token digest
- `DESIGN.md`, `SPEC.md`, `ui-surfaces.md` -- remove retired keys and add the dated notes
- Run the app (`run` skill), screenshot the Team sidebar with the five core personas, measure a tile and write it in the Auto Run Result and `DESIGN.md`; if the app cannot be launched unattended, say so as a residual risk and state the computed row from padding + leading

**Acceptance Criteria:**
- Given the Team sidebar with the roster, when it renders, then every tile is a 44px row holding a 26px `Initials` disc (`M J S W A`), name and title beside it and the state line with its dot below, with no `<svg>` or image, the disc `aria-hidden` with no tab stop, and `aria-label` `name, title, state` unchanged
- Given a rendered tile in the running app, when measured, then it is 44px (not a `min-height` the content overrides), and the number is recorded
- Given the tile's other behaviour, then its existing tests pass without edit (native button, roving tab stop and arrows, hover, `aria-current` edge, idle dimming, hint)
- Given the party cast strip, then each card carries a 26px disc, keeps its lit border, ground, glow and equaliser, has no ring (`--cast-ring` and the `.cast-portrait` shadow are gone), and its wrapper stays `aria-hidden`
- Given the Welcome, then each of the five cards carries a 26px disc at full opacity in the same card, lane and order, is not a control, and is named by its own text
- Given the cast chooser, the Agents-panel row and the thread introduction, then each draws a 26px `aria-hidden` disc beside the name, the row is still text and the introduction has no button, handler or tab stop
- Given the source tree, then `portrait.tsx`, `portrait.css`, `art-params.ts` and the rules that hung on them are gone, `PersonaState` lives in `status/persona-state.ts`, `PersonaIdentity` is gone, `persona/` holds the initials files and tests only, and the new source-tree test fails on a portrait module, `portrait(`, `artParamsFor`, the three portrait classes or a per-person `<svg>`
- Given `DESIGN.md` and `tokens.css`, then the retired keys and tokens are gone together, `--tile-height` is `44px`, `tokens.test.ts` is green with the digest re-pinned, and nothing reads a deleted key
- Given both themes, then every disc is `initials`-classed with no `style`, colour or persona-specific class, so there is no replacement identity device
- Given `CONTRACT_VERSION`, the roster and the install snapshot, then they are unchanged, and `npm run typecheck`, `npm run lint` and `npm test` pass (including `tokens.test.ts` previously red)

## Spec Change Log

## Review Triage Log

### 2026-10-15 — Review pass
- verdicts: 19 rows (reviewers' overlapping or same-root findings grouped under one row, citing each layer) — high 0, medium 1, low 17, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap; blind, intent) the 44px tile is held by nothing a test reads: removing `line-height: var(--lh-tight)` or restoring the closed hint's margin keeps 5669 tests green — `team-contract.test.ts` now asserts the leading, the hint margin on the open rule only, and `tokens.test.ts` asserts `--tile-padding` equals `persona-tile.padding`
  - `[low]` `[patch]` (blind, edge) `.menu-hint` `margin-top` moved into the hover rule but is not transitioned, so the gap snaps — added to the `transition` list
  - `[low]` `[patch]` (edge) the deleted portrait test that checked the five core ids against `[agents.<id>]` in `_bmad/config.toml` went with it — restored against `CORE_AGENT_IDS` in `tests/welcome-contract.test.ts` (the web tsconfig has no node types, so not under `src/renderer`)
  - `[low]` `[patch]` (blind, verification-gap) stale wording: `cast-chooser.tsx` "portrait", `tests/initials.test.ts` header and `box-sizing` comments, `tokens.css` `--lh-tight` comment, `DESIGN.md` "5–7px" and the 43px arithmetic, the doubled comment in `persona-state.ts` — corrected
  - `[low]` `[reject]` (blind, edge) the tile keeps `align-items: flex-start`, so the 26px disc sits at the top of the 44px row — the row's alignment is unchanged from the 36px portrait it replaces, the running-app screenshots read well, and centring is a design choice the spec did not make
  - `[low]` `[reject]` (blind, edge) the cast chooser inherits `--tile-padding` `3px 11px` — its rows centre content under a `--tile-height` floor, so 44px holds and the padding is invisible; a second token adds a component dimension the story forbids
  - `[low]` `[reject]` (edge) `box-sizing: border-box` in `cast-chooser.css` is redundant with `page.css` — harmless, and deleting it is churn
  - `[low]` `[reject]` (blind, edge) `CORE_AGENT_IDS` is derived from the Welcome table — the chooser only tests membership (`includes`), so reordering changes nothing; the restored config.toml check pins the ids
  - `[low]` `[reject]` (blind, edge) an id missing from the roster reads `B` in the cast strip, and `initialsOf` has no guard for an empty or astral first character — `initialsOf` is unchanged and pre-existing, a cast id missing from the roster is already a degraded state, and the guard adds a branch for a case not shown
  - `[low]` `[reject]` (blind, edge) the source-tree test does not sweep `<img>`, `<canvas>`, `background-image` or `<svg className={expr}>` — the spec fixes its list (portrait names, classes, per-person `<svg>`); `discs.dom.test.tsx` asserts no `svg, img, picture, canvas, [style]` on the six mounted surfaces
  - `[low]` `[reject]` (blind) the new disc test has no light/dark assertion and no user-disc tint check — `tokens.test.ts` pins the 66 colour tokens and their light twins, and the user's tint is unchanged and tested in the chat
  - `[low]` `[reject]` (blind) `theme-audit` portraits block deleted without a recorded replacement — the spec allowed deleting it when `tokens.test.ts` already pins the twins (it pins `--initials-bg|line|ink` and the twin count); recorded here and in the Auto Run Result
  - `[low]` `[reject]` (blind) `PersonaState` is a hand-written union beside `PERSONA_STATES` — moved as it was, the drift risk pre-exists
  - `[low]` `[reject]` (blind) `size={26}` repeated at six sites and `{...agent}` spreads extras into `Initials` — the story fixes the size per site and `Initials` destructures its props; no rest props are forwarded
  - `[low]` `[reject]` (blind) `ui-surfaces.md` keeps its Portraits section with a banner, and CAP-3's `success:` line still says portrait — the spec asked for dated notes and no rewrite
  - `[low]` `[reject]` (blind, verification-gap) several other mentions of the word "portrait" remain in comments and negative tests — standing prohibitions and history, by the spec's own rule
  - `[low]` `[reject]` (blind) `files.length > 50` is a magic number in the source-tree test — a sanity floor on the glob, not a rule
  - `[false]` `[reject]` (intent) the measurement exists only as prose — the implementer's report carries the measured figures (44px in both themes, 62.4px before the change) and they are recorded under Auto Run Result; no test can see layout
  - `[low]` `[reject]` (intent) the cast strip was not seen live — recorded as a residual risk; it opens only with a room of live processes
  - `[low]` `[reject]` (intent, verification-gap) the intent "7.7" reads as the whole story; the diff implements it as specified, with no divergence beyond the measured surface — descriptive, no defect named

## Design Notes

The tile was 56px because two lines (name+title at `name`, state at `label`) at `--lh-base` (1.55) plus `--tile-padding` (`9px 11px`) come to about 56px. 44px therefore needs less padding or tighter leading on the tile only (not a global token change); measure the result. A 26px disc in a 44px row leaves 9px above and below, so the name/title/state block, not the disc, sets the height.

```tsx
// before: {portrait(artParamsFor(agent.id), 36, state, agent)}
<Initials name={agent.name} size={26} />   // aria-hidden at 26, class "initials initials--thread"
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass, including `tests/tokens.test.ts` -> "carries the status dot and the persona tile" (red on HEAD before this story); also `npx vitest run --project watchers`
- `git grep -n "portrait(\|artParamsFor\|persona/portrait\|cast-portrait\|cast-ring\|--lh-none" -- src tests` -- expected: only the new prohibition test's own strings

**Manual checks:**
- Run the app; with the five core personas, the Team sidebar shows five 44px rows with a lettered disc, name, title and state line; the party cast strip, Welcome, cast chooser, Board Agents panel and an empty thread show discs and no faces; the speaking cast card has a lit border and equaliser and no ring; toggle light and dark.

## Auto Run Result

Status: done

**Summary.** Every person is now the neutral `Initials` disc and a name. The Team tile, cast card, cast chooser, Welcome card, Agents-panel row and empty-thread introduction each draw a 26px disc; the tile is a 44px row; the portrait module, its parameter module, stylesheet, tokens (`--cast-portrait`, `--cast-ring`, `--lh-none`) and pinned tests are removed together with the `DESIGN.md` keys. `PersonaState` moved to `status/persona-state.ts`. Nothing replaces the portrait.

**Files changed.**
- `src/renderer/ui/{team,party,welcome,board,shell}/*` -- six call sites draw `<Initials size={26}>`; portrait CSS rules and the cast ring removed; the tile takes the tight leading and `3px 11px` padding, and the menu hint's gap opens with the hint
- `src/renderer/ui/persona/{portrait.tsx,portrait.css,art-params.ts}` -- deleted; `persona.test.tsx` cut to the initials; new `discs.dom.test.tsx` mounts all six surfaces
- `src/renderer/ui/status/persona-state.ts` and ~20 importers -- `PersonaState` lives here; `PersonaIdentity` gone; `welcome/personas.ts` gains `CORE_AGENT_IDS` for the chooser's default cast (was `CURATED_AGENT_IDS`)
- `src/renderer/design/tokens.css` -- `--tile-height:44px`, `--tile-padding:3px 11px`, three tokens deleted, comments reworded
- `tests/persona.test.ts` -> `tests/initials.test.ts` (with the source-tree prohibition test), `tests/tokens.test.ts` (digest re-pinned, 44px, `discSize`, absent tokens, padding pin), `tests/team-contract.test.ts` (44px, leading and hint-margin pins), `tests/welcome-contract.test.ts` (one 26px disc; core ids checked against `_bmad/config.toml`), plus the per-surface tests the spec lists
- `DESIGN.md`, `SPEC.md` (CAP-3, CAP-10), `ui-surfaces.md` (Portraits) -- retired keys removed, dated 2026-10-15 notes

**Review.** Patches applied: 4 rows (1 medium: the 44px tile was pinned by no test; 3 low: hint-margin transition, the restored config.toml id check, stale wording). Deferred: 0. Rejected: every other finding, with reasons in the triage log.

**Follow-up review recommended:** false (no high patched; one medium patched).

**Verification.** `npm run typecheck` and `npm run lint` clean; `npm test` unit project 244 files, 5670 passed; `vitest --project watchers` 65 passed. The previously red `tests/tokens.test.ts` -> "carries the status dot and the persona tile" is green. The `theme-audit.dom.test.tsx` portraits block was deleted because `tokens.test.ts` already pins the `initials-*` tokens and their light twins. Measured in the running app (`electron-vite dev`, DevTools): all five core-persona tiles are exactly 44px in dark and light (36.1px of text, 0.9px spare); with a 26px disc and the old padding the tile measured 62.4px, so the old 56px was never true of a rendered tile.

**Residual risks.** The cast strip was not seen live (it appears only with a room of running persona processes); it is covered by unit and DOM tests, and its disc uses the same rules as the tile. The 44px row is held by `min-height` over 36.1px of text, so a different font or zoom that adds a pixel makes it 45px; the leading, padding and hint margin are now pinned by tests. `ARCHITECTURE-SPINE.md` line ~50 still says "until the portrait-removal story lands" and is `bmad-architecture`'s to fix (AD-16's amendment has landed; the spine was not edited).

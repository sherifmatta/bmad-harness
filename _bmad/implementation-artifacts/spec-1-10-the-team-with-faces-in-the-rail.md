---
title: 'The team, with faces, in the rail'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_commit: '07932d82c675dafa17de312b72e47a68c26f2f44'
baseline_revision: '07932d82c675dafa17de312b72e47a68c26f2f44'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The rail's Team half is an empty body and the chat column has no header. Every installed persona is visible only as unstyled preview paragraphs in the thread, so the room reads as a list of capabilities and nothing says who the user is talking to or what state they are in.

**Approach:** Fill the Team half with one 56px tile per installed agent (36px portrait, name, title, a dot-plus-text state line, a hover menu hint), grouped by `module`/`team` in config order, as one roving-tabindex list. Add the five-state status dot as its own component. Mount a chat header (38px portrait, name, title, state, the roster `description` as a 72ch sub-line) above the thread that rebuilds in the same frame when another tile is made current. `Shell` owns which persona is current.

## Boundaries & Constraints

**Always:**
- **Tile** (FR18, UX-DR16): a native `<button type="button">`, `min-height: var(--tile-height)` (56px), a 36px `portrait(artParamsFor(id), 36, state, agent)`, the name at `--fs-name` weight `--weight-strong` `--text-strong` (sans) with the title beside it at `--fs-ident` `--dim` (sans, single line, ellipsis), and below them the state line at `--fs-label` mono `--faint`. `aria-label` is `{name}, {title}, {state text}` so the portrait, text and dot are announced once. Ground transparent; `:hover` → `--panel-2`; **current** (`aria-current="true"`, present only on the current tile) → `--tile-current` (`#1f262f`, promoted) with a `--tile-edge-width` `--accent` bar on the left via `::before`. The current rule follows the hover rule in source order, so a current tile keeps its ground under hover (the mockup's order). `name` and `title` come from the resolved `AgentView`, never a harness-side table.
- **Menu hint** (FR19): under the state line, a flex-wrap row of the agent's first six menu `code`s from `snapshot.menus[id]` (mono `--fs-micro`, `--track-micro`, `--dim`, `--rule-width` `--line` border, `--radius-chip`, ground `--code-tag-bg`), plus a `+N` tag when there are more. It is rendered only when the agent has codes, at `max-height: 0; opacity: 0; overflow: hidden`, and opens to `max-height: var(--tile-hint-max)` (60px), `opacity: 1` on `:hover` **and** `:focus-visible`, written as one selector list (a hover-only reveal fails without a mouse — the initials token's own rule), with `transition: max-height var(--motion-reveal), opacity var(--motion-reveal)`. That transition is the only motion the tile has; no hover lift, no entrance. Skill names, descriptions and tooltips are never shown here (AD-3 — they go stale); codes only. Project text renders as React text, never markup.
- **Order** (FR22, UX-DR16): a pure `groupAgents(agents)` returns groups keyed by `(module, team)`, `team` optional. Groups appear in order of the first agent in each; within a group agents keep the order of `snapshot.agents`. The display order is the groups flattened. A group heading — mono `--fs-meta` `--meta` `--track-micro`, `.rail-group` in `shell.css`, reading `module` or `module · team`, lower case as given — renders only when there are two or more groups; a lone group has nothing to disambiguate. **No** relevance sort, recency sort, pinning, badging, highlighting, alphabetical order or count anywhere.
- **The list is one tab stop** (NFR20): the group container is `role="group"` `aria-label="Team"`; exactly one tile has `tabIndex={0}` and the rest `-1` — the tile last moved to or activated, else the current tile. Arrow travel between tiles, clamped and vertical, is `rovingKey` (`ui/a11y/roving-tabindex.ts`) with `activateOn: ['Enter', ' ']`; a moved-to tile takes focus. `Enter`/`Space` activation is the native button click — the key handler never `preventDefault`s them and never names an arrow key (`Arrow*` lives only under `a11y/`). Activation makes that tile current and **focus stays on it** (EXPERIENCE *Focus management*). One shared `:focus-visible` ring, no focus rule in any new stylesheet.
- **Status dot** (FR22, UX-DR17): `StatusDot({ state })` in `ui/status/`, a 6px `--radius-full` circle (`--status-dot-size`), `aria-hidden` because a text string always sits beside it. Five states over four colours: `idle` `--faint`; `work` `--amber` + `--shadow-halo-work` + `animation: var(--motion-pulse)`; `live` `--green` + `--shadow-halo-live`; `note` `--note`; `error` `--red`. The halo exists only on `work` and `live`; `note` uses `--note`, never `--accent`. `StateLine({ state })` pairs it with the text — `idle`, `working`, `live`, `file changed`, `error` (one closed map, lower case, mono). No error text on a tile, ever.
- **State is read, not placed.** `Shell` takes an optional `states: ReadonlyMap<string, PersonaState>` defaulting to an empty map; a tile's state is `states.get(agent.id) ?? 'idle'` and no per-agent state is written anywhere. With no sessions in this epic every tile is therefore `idle` from the same lookup Epic 2 will feed. `PersonaState` is the union `ui/persona/portrait.tsx` already exports.
- **Chat header** (FR22, UX-DR17): `ChatHeader({ agent, state })` in `ui/chat/`, the first child of the `.chat` column above `.scroll`: `--chrome` ground, `--rule-width` `--line` bottom border, padding `--chat-head-padding`, gap `--space-xl`; a 38px portrait; an `<h2>` name at `--fs-head` weight `--weight-strong` `--text-strong` `--track-control` (the largest type in the shell) with the title beside it at `--fs-body-ui` `--dim`; a second line — the roster `description` — at `--fs-body-ui` `--faint`, single line, ellipsis, `max-width: var(--chat-sub-max)` (72ch); and the current `StateLine` on the right (`margin-left: auto`). Rendered `key={agent.id}` so a persona change rebuilds it; there is no button, no hand-off, no composer.
- **Current persona** lives in `Shell` state (`string | null`). The current agent is `ordered.find(id === currentId) ?? ordered[0]` — derived at render, so a roster change that removes the current agent falls back to the topmost tile in the same frame, and an unset choice opens on the topmost tile. With no agents there is no header and no tiles.
- **Tokens, promoted** into `tokens.css`'s second `:root` with a comment naming the `harness-mockup.html` line (`.dot` `:78`, `.ptile` `:108-130`, `.fgroup` `:147`, `.chat-head` `:152-160`) or the DESIGN.md `components` key: `--status-dot-size`, `--tile-height`, `--tile-padding`, `--tile-current`, `--tile-edge-width`, `--tile-state-top`, `--tile-hint-max`, `--code-tag-bg`, `--code-tag-padding`, `--rail-group-padding`, `--chat-head-padding`, `--chat-head-sub-top`. No literal colour, dimension, radius or font stack in any new stylesheet; no shorthand `font:`. The verbatim first block is untouched.
- **Layering:** all of this is `src/renderer/ui/`; nothing reaches main, sources, fold or projections; no new dependency, no DOM test environment, no bridge method.

**Never:**
- Never a session, transcript, composer, skill row, hand-off control, `Party` content, rail Outputs row, document card, sysline or cast — Stories 1.11+ and Epics 2–4. The Outputs half stays an empty body.
- Never a badge, unread count, next-step or "recommended" mark, relevance/recency sort, pinned or highlighted tile, or a count in a heading. The `+N` on the hint is the count of *hidden codes* on a hover reveal, as the mockup draws it (`:1082`), not a badge on the tile.
- Never a spinner, skeleton, entrance animation or new `@keyframes`; never a `z-index`; never `aria-live` outside `live-region.tsx`; never `style={{ }}`; never the word `outline` outside `focus.css`; never a tooltip (`title=`) that is the only carrier of a fact.
- Never the portrait `icon` field as a face, never the persona name/title/icon as a key (`agent.id` keys everything), never a per-agent branch on an id.
- Never reordering `snapshot.agents` by anything but its group key.
- The `Preview` scaffolding in `app.tsx` is **not** removed: `tests/persona.test.ts` pins it, and it is the only place the 32px and 44px portrait sizes and the derived grid are on screen for Story 1.6's judgement.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open, one group | 5 agents, all `bmm` / `software-development` | 5 tiles in config order, no group heading; the topmost is `aria-current="true"`; chat header names it; every state line `idle` | — |
| Several groups | agents `a(bmm,t1) b(gds) c(bmm,t1) d(bmm,t2)` | groups `bmm · t1`: a, c; `gds`: b; `bmm · t2`: d; each headed; roving order a, c, b, d | — |
| `team` absent | agent with `module` only | heading is `module` alone | — |
| Make another current | activate a tile (click, `Enter`, `Space`) | that tile `aria-current="true"`, the old one not; header shows the new persona in the same render; focus stays on the tile | — |
| Roving | focus on tile *i*, arrow down / up | focus moves to *i±1*, clamped at both ends, and that tile holds `tabindex="0"` | off-axis arrows and `Tab` are ignored (browser's) |
| Roster loses current | `snapshot.agents` no longer has `currentId` | current falls back to the topmost tile; header rebuilds | never an empty header while agents exist |
| Five states | `states` map holds `idle work live note error` | dot class, halo (work, live only) and text per the map; `note` dot is `--note` | unknown/absent id → `idle` |
| Menu hint | agent with 8 codes / 3 codes / 0 | first six + `+2` / three / no hint element | — |
| Hostile text | name, title, description or code containing markup | rendered as text | — |

</intent-contract>

## Code Map

New: `src/renderer/ui/status/{status-dot.tsx,status-dot.css,persona-state.ts}`, `src/renderer/ui/team/{persona-tile.tsx,team.tsx,team.css,tile-groups.ts,tile-nav.ts}`, `src/renderer/ui/chat/{chat-header.tsx,chat-header.css}`. Edits: `src/renderer/ui/shell/{shell.tsx,shell.css}`, `src/renderer/design/tokens.css`, and the tests named below. No `app.tsx` change is required (`Shell` already receives `snapshot`); no bridge, main or preload change.

**Contract read from where it was verified.** `epics.md:831-869` (the story); FR18, FR19, FR22, UX-DR16, UX-DR17. `DESIGN.md:212-219` (`persona-tile` height, grounds, edge), `:189-198` (`status-dot`), `:589-606` (dot table, tile), `:419-427` (`label` `ident` `name` `head` tiers), `:457` (72ch), `:463` (sizes; ~six tiles; grouping), `:494` (halos), `:701` (reveal `.16s` on `max-height`/`opacity`). `EXPERIENCE.md:127` (tile click marks current), `:175-179` (tile order), `:199-207` (five dot states), `:481` (one tab stop, arrows, `Enter`/`Space`), `:496` (focus stays on the activated tile), `:264-265` (roster change lands in one frame). **Mockup** (`_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html`): `.dot` `:78-80`, `.ptile*` `:107-130`, `.fgroup` `:147`, `.pulse` `:148`, `.chat-head*` `:152-161`, chat-head markup `:436-449`, `renderTiles`/`stateDot`/`setHeader` `:1064-1130`. The mockup's `.status-pill` amber treatment is work-specific and Epic 2/3's; the header here shows the plain dot and text.

**The code this lands in.**
- `src/renderer/ui/shell/shell.tsx:36-85` — `Shell` and the local `RailHalf` (a head over an empty `.rail-body`). Give `RailHalf` optional `children`; the Team half passes `<Team …/>`, Outputs stays empty. `.chat` gains `<ChatHeader>` before `.scroll`. `Shell` gains `states` (optional) and owns `currentId`.
- `src/shared/install.ts:16-24` — `AgentView` (`id module team? name title icon description`); `InstallSnapshot.menus` is `Record<agentId, {code, description}[]>` with a key for every agent.
- `src/renderer/ui/persona/portrait.tsx` — `portrait(art, size, state, identity)`, `PortraitSize` (36 and 38 are members), `PersonaState`, `PersonaIdentity`; `artParamsFor` from `persona/art-params.ts`. `AgentView` satisfies `PersonaIdentity`, as `Preview` already does.
- `src/renderer/ui/a11y/roving-tabindex.ts:47-96` — `rovingKey(key, { index, count, orientation, activateOn })` → `move | activate | ignore`; the only module that may name an arrow.
- `src/renderer/design/focus.css` — the global `:focus-visible` ring; new stylesheets neither restate nor suppress it.
- `src/renderer/design/tokens.css:167-189` (layout constants incl. `--chat-sub-max`), the motion, shadow, `--meta` and `--note` tokens further up the second `:root` (`--motion-pulse`, `--motion-reveal`, `--shadow-halo-work`, `--shadow-halo-live`); the Story 1.9 tokens block ends at `--hidden-offset`.
- Guards that must stay green or be *deliberately* updated: `tests/tokens.test.ts:470-474` ("carries no component dimension" forbids `--status-dot` and `--tile` — this story is the one that builds those components, so those two prefixes leave the list and gain positive assertions; `--portrait` stays), `tests/shell-contract.test.ts` and `src/renderer/ui/shell/shell.test.tsx` ("draws nothing the rail halves own", empty rail bodies, `TeamOutputs` text, two buttons total — the Team half now holds tiles), `tests/accessibility.test.ts` (arrow names only under `a11y/`, `aria-live` once, `outline` only in `focus.css`), `tests/persona.test.ts:793-860` (the `Preview` source assertions), `tests/tokens.test.ts:525-565` (the motion inventory stays five).

## Tasks & Acceptance

**Execution:**
- `src/renderer/design/tokens.css` -- add the twelve role tokens to the second `:root` after `--hidden-offset`, each commented with its mockup line or DESIGN.md key -- NFR23: no literal outside this file
- `tests/tokens.test.ts` -- drop `--status-dot` and `--tile` from the "no component dimension" list (keep `--portrait`); add assertions reading `components.persona-tile` (`height`, `currentBackground`, `currentEdge`) and `components.status-dot` (`size`) from DESIGN.md at run time and comparing them to `--tile-height`, `--tile-current`, `--tile-edge-width`, `--status-dot-size` -- same coupling the run note and initials tokens hold
- `src/renderer/ui/status/persona-state.ts` -- `PERSONA_STATES` (the five, in order), `STATE_TEXT: Record<PersonaState, string>`, `stateOf(id, states)` (`states.get(id) ?? 'idle'`) -- one closed vocabulary; pure, no DOM
- `src/renderer/ui/status/status-dot.tsx`, `status-dot.css` -- `StatusDot`, `StateLine`; the CSS from *Boundaries*, `animation` only on `--work`, no focus rule, no `z-index`, no `@keyframes`
- `src/renderer/ui/team/tile-groups.ts` -- `groupAgents(agents): TileGroup[]` (`{ key, heading, agents }`) and `displayOrder(groups)`; pure, non-mutating, stable
- `src/renderer/ui/team/tile-nav.ts` -- `tileMove(key, index, count): number | null` (a `rovingKey` `move` → its index, everything else → `null`, so activation stays native) and `tabStopId(order, movedToId, currentId)`; pure
- `src/renderer/ui/team/persona-tile.tsx`, `team.css` -- `PersonaTile` (no hooks; takes `agent`, `codes`, `state`, `current`, `tabStop`, `onSelect`, `onKeyDown`, a ref callback) and the tile/hint/code-tag rules; `--current` after `:hover`; the hover-and-focus reveal as one selector list; `transition` only on the hint
- `src/renderer/ui/team/team.tsx` -- `Team({ agents, menus, states, currentId, onSelect })`: groups, headings when ≥2 groups, the `role="group"` container, the roving tab-stop state and a ref map so a move focuses its tile; `onSelect` also takes the tab stop
- `src/renderer/ui/chat/chat-header.tsx`, `chat-header.css` -- `ChatHeader({ agent, state })` per *Boundaries*
- `src/renderer/ui/shell/shell.tsx`, `shell.css` -- own `currentId`, derive the current agent from the display order, mount `<Team>` in the Team half and `<ChatHeader key>` above the scroll, add `.rail-group`; the Outputs half, the Party view, the topbar and every 1.9 rule unchanged
- `src/renderer/ui/team/tile-groups.test.ts` -- every I/O row for ordering: single group, several groups with interleaved config order, `team` absent, no alphabetical or name-based reordering (feed names in reverse), non-mutating, empty input, one heading rule
- `src/renderer/ui/status/persona-state.test.ts`, `src/renderer/ui/status/status-dot.test.tsx` -- text per state; `stateOf` default; five states render five classes, halo tokens on `work` and `live` only, `note` never `--accent`, `aria-hidden`; every `StateLine` has both dot and text
- `src/renderer/ui/team/persona-tile.test.tsx`, `src/renderer/ui/chat/chat-header.test.tsx` -- `renderToStaticMarkup`: tile has the 36px labelled portrait, name, title, dot and state text, `aria-current="true"` only when current, `tabindex` `0`/`-1`, `aria-label` triple, a hint of six codes plus `+N` / no hint at zero, hostile text escaped, no `style=`, no `title=`; the click handler receives the agent id (called through the element tree, as the view-switch test does); header has the 38px portrait, `<h2>` name, title, sub-line, state text, one `StateLine`
- `src/renderer/ui/shell/shell.test.tsx` -- update the rail assertions: Team half holds one tile button per agent in display order, Outputs body still empty, the header names the topmost agent, headings only with ≥2 groups, a `states` map drives dots and header state, an unmatched `states` id is `idle`; the whole-shell button count becomes two switch buttons plus one per tile (the old "exactly two `<button`" checks are scoped to the topbar), and the two view-switch buttons are still the only topbar tab stops
- `tests/team-contract.test.ts` -- reads the new stylesheets and sources as text: every token named exists; no `z-index`, `outline`, `@keyframes`, `focus` rule, `font:` shorthand; `transition` appears only in `team.css` and only on the hint; `animation` only in `status-dot.css`; the reveal selector list names `:hover` and `:focus-visible` together; `tile-nav` tests over the real key names (arrow keys clamp at both ends, `Enter`/`Space`/`Tab`/off-axis → `null`, empty list → `null`); `shell.tsx` mounts `<Team`, `<ChatHeader` and derives the current agent from the display order; no file under `ui/team`, `ui/status`, `ui/chat` names `icon` as a portrait source, an arrow key, or `aria-live`
- `tests/persona.test.ts`, `tests/accessibility.test.ts`, `tests/shell-contract.test.ts` -- keep every existing assertion true except the deliberate rail-empty ones above; assert rather than assume that the new stylesheets fall under the whole-tree literal, focus-word and arrow sweeps

**Acceptance Criteria:**
- Given the open room, when the Team half renders, then it holds one 56px tile per installed agent, each with a 36px labelled portrait, the name, the title beside it, and a state line of dot plus text, and the Outputs half is still an empty body
- Given a tile is current, when it renders, then it alone carries `aria-current="true"`, its ground is `--tile-current` and its left bar is `--tile-edge-width` of `--accent`; and given any tile is hovered, then its ground is `--panel-2` and its menu hint opens from `max-height: 0` to `--tile-hint-max` over `--motion-reveal`, the same reveal firing on `:focus-visible`
- Given installed agents with differing `module` and `team`, when they render, then they are grouped by that key in first-appearance order with config order inside each group, headed only when two or more groups exist, with no other sort, pin, badge or highlight anywhere
- Given the five dot states, when each renders, then `idle`/`work`/`live`/`note`/`error` resolve to `--faint`/`--amber`/`--green`/`--note`/`--red`, only `work` and `live` carry a halo, only `work` pulses, and every dot has its text string in the same row
- Given no sessions exist, when the room opens, then every tile and the header read `idle` through the `states` lookup and no per-agent state is written in source
- Given the chat header, when it renders, then it shows the current persona's 38px portrait, `--fs-head` name, title, state, and a description line capped at `--chat-sub-max`; and given another tile is activated, then in that same render the header shows that persona from the roster and focus remains on the activated tile
- Given the Team list, when navigated by keyboard, then it is one tab stop, arrows move and clamp between tiles across groups, `Enter` and `Space` activate, and no key handler in the new code names an arrow
- Given the source tree, when swept, then no new stylesheet holds a colour, dimension, radius or font-stack literal, `--z-` still names exactly two tokens, the motion inventory is still five, `outline` is only in `focus.css`, and `package.json` gains no dependency
- Given `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, when each runs, then all four exit zero and the suite is larger than the 780 tests Story 1.9 left behind

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass
- verdicts: 31 findings — high 0, medium 4, low 21, false 6, maybe-false 0 (several rows below share a root cause; Blind Hunter reported 15, Edge Case Hunter 13, Verification Gap 2, Intent Alignment 1 descriptive)
- findings:
  - `[low]` `[reject]` Blind Hunter: the hover reveal shifts the tiles below it, and the closed hint keeps its top margin — the shift is the contract's own reveal (`max-height` 0 to 60px, the mockup's behaviour); the margin claim is refuted, since the content column is shorter than the 56px minimum so the closed margin adds no height.
  - `[low]` `[patch]` Blind Hunter + Edge Case Hunter (header): a long name or title pushes past the rail edge / wraps and pushes the header state out — the tile name and header line now shrink and ellipsise on one line.
  - `[medium]` `[patch]` Blind Hunter + Verification Gap: `Team`'s handlers and `Shell`'s select-to-header chain have no behavioural test — hook-stubbed `Team` and `Shell` tests added.
  - `[low]` `[reject]` Blind Hunter: contract tests overclaim (second-`:root` position, verbatim-block check, regex guard for per-agent state) — the verbatim block and the second-`:root` shape are pinned by `tests/tokens.test.ts`; the rest are advisory greps.
  - `[low]` `[reject]` Blind Hunter: group headings are visual only — the heading text is in the DOM for browse mode and every tile carries its own full label; nested groups would change the surface's role count for no stated requirement.
  - `[low]` `[reject]` Blind Hunter: menu codes are unreachable to screen readers — the codes are opaque without the skill names the design forbids showing (AD-3), and the tile's `aria-label` is the whole announcement by design.
  - `[low]` `[reject]` Blind Hunter + Edge Case Hunter: no non-visual confirmation when the persona changes — `EXPERIENCE.md`'s announcement policy is a closed list; `aria-current` moves with focus staying on the tile.
  - `[false]` `[reject]` Blind Hunter: no `Home`/`End` — NFR20 closes the keyboard vocabulary at arrows, `Enter`/`Space` and `Esc` and `roving-tabindex.ts` says so.
  - `[low]` `[patch]` Blind Hunter + Edge Case Hunter: modifier-held arrows are treated as tile moves and default-prevented — `Team`'s key handler returns early when Alt, Ctrl, Cmd or Shift is held.
  - `[false]` `[reject]` Blind Hunter: no reduced-motion path — `tokens.css` disables all animation and transition globally under `prefers-reduced-motion`.
  - `[low]` `[reject]` Blind Hunter: contrast of the new pairings is unchecked — the pairings are the design's own (state line `--faint`, current ground `#1f262f`); no contrast target is claimed.
  - `[low]` `[reject]` Blind Hunter + Edge Case Hunter: focus is lost when the focused tile's agent leaves the roster — a rare coincidence, and the fix is effect and DOM machinery.
  - `[low]` `[patch]` Blind Hunter + Edge Case Hunter: a whitespace-only `team` draws a heading with a dangling separator — `groupAgents` trims `team` and treats an empty one as absent. The rest of the claim is refuted: ids are TOML table keys (unique), and the schema requires non-empty `module`, `name`, `title` and menu `code`.
  - `[low]` `[reject]` Blind Hunter: display order is derived in `Shell` and again in `Team`, and `PERSONA_STATES` is not exhaustively typed — both derivations are pure over one input, and `STATE_TEXT` is an exhaustive `Record`.
  - `[low]` `[reject]` Blind Hunter: `Preview` repeats every persona for screen readers — the block is scaffolding the spec keeps on purpose (`tests/persona.test.ts` pins it; the 32px and 44px sizes have no other home).
  - `[medium]` `[patch]` Edge Case Hunter: the shared focus ring on a full-bleed tile is clipped by `.rail-body`'s `overflow-y: auto` — a `.focus-inset` rule and `--focus-ring-offset-inset` token draw it just inside the tile edge, following the stacked-offset precedent; the implementer flagged the same risk.
  - `[low]` `[reject]` Edge Case Hunter: arrow-focus scrolls to the collapsed tile and the expanding hint is clipped below the fold — cosmetic and self-correcting on scroll; the fix needs scroll management after a transition.
  - `[false]` `[reject]` Edge Case Hunter (twice, one a claim): duplicate agent ids give several tab stops and duplicate keys — ids are the keys of the resolved config's `[agents.*]` tables and cannot repeat.
  - `[false]` `[reject]` Edge Case Hunter: an empty name or title gives a `, , idle` label — `parseRoster` rejects an empty `name` or `title`.
  - `[false]` `[reject]` Edge Case Hunter: blank menu codes draw empty chips — `parseMenu` drops an entry with no code.
  - `[low]` `[reject]` Edge Case Hunter (twice, one a claim): a stale `currentId` resurfaces if the agent returns to the roster — restoring the user's own earlier choice is not a harm; clearing it needs an effect.
  - `[medium]` `[patch]` Verification Gap: `snapshot.menus[id]` reaching each tile's hint through `Team` is untested — every `Shell` test passed `menus: {}`; a menus render (over-six, three, absent, `constructor`) added.
  - `[medium]` `[patch]` Verification Gap: activation making a tile current, the roving tab stop and the arrow-move focus call are untested — covered by the same hook-stubbed `Team`/`Shell` tests as the behavioural row above.
  - `[low]` `[reject]` Intent Alignment (descriptive): focus, click-to-header, computed layout and the real window are asserted only through markup, pure functions and stylesheet text — the spec lists them under manual checks, no DOM environment exists, and the wiring is now covered by the stubbed-hook tests.

## Design Notes

**Why the topmost tile is current on open.** EXPERIENCE's open flow has one tile current with an `idle` line before any session exists, and nothing in the roster says which persona a user "starts with" — inventing a preferred persona would be the recommendation the product bans. The topmost tile in display order is the one choice that needs no knowledge the harness does not have, and deriving it at render (rather than storing it) is what makes a roster change land in one frame.

**Why group headings appear only from two groups.** The five core agents all share `bmm` / `software-development`. A heading over a single group would state a fact that disambiguates nothing and add a row above the first tile; from two groups on it is what makes the grouping legible. The heading treatment is an `[ASSUMPTION]` in EXPERIENCE (`:179`, "reuse the file-group treatment"), so it is drawn once as `.rail-group` in `shell.css` for Story 1.11's Outputs groups to reuse.

**Why the state text is the map it is.** The dot may not be the sole carrier, and the tile may carry no error text. One closed map (`idle`, `working`, `live`, `file changed`, `error`) keeps the words a fact about state, not guidance. Epic 3 will supply richer strings from a real stream through the same `states` seam; this story only proves the seam by feeding it a stub in tests.

**Why the hint also opens on focus.** The reveal is the tile's only route to the menu codes, and a hover-only reveal fails completely without a mouse — the same reason the initials token fires on `:hover` and `:focus-visible` from one selector list. The AC names hover; keyboard parity extends it, it does not contradict it.

**Left for later, not forgotten.** The 1.9 deferral now also covers `currentId`: the shell unmounts on an open/blocked/open round trip, so the current persona resets to the topmost tile. Nothing durable rides on it until Epic 2. The `Preview` block stays until 1.11 and Epic 3 replace it; the 32px and 44px sizes have no other home. No DOM environment is added — the roving move's focus call is the one behaviour `renderToStaticMarkup` cannot reach, so the decision (`tileMove`, `tabStopId`) is pure and tested, and the `.focus()` call is a manual check. The Story 1.2/1.9 DOM-environment deferral is carried forward, not closed.

## Verification

**Commands:**
- `npm test` -- expected: all green, more than 780 tests; the tile, group, state, header and contract suites included
- `npm run lint && npm run typecheck && npm run build` -- expected: all exit zero
- `grep -rnE 'outline|z-index|@keyframes|font:' src/renderer/ui/team src/renderer/ui/status src/renderer/ui/chat --include=*.css` -- expected: no output outside comments
- `grep -rnE 'Arrow(Up|Down|Left|Right)|aria-live|style=|title=' src/renderer/ui/team src/renderer/ui/status src/renderer/ui/chat` -- expected: no output
- `git status --short` after `npm run dev -- .` has opened -- expected: unchanged

**Manual checks (what no test covers):**
- `npm run dev -- .` on this project: the Team half shows five 56px tiles with faces, names, titles and `idle` lines, the topmost marked with the accent bar; the chat header names it above the thread; hovering a tile opens its code tags smoothly and closing it does not jump the list.
- Tab into the Team list once, arrow down through the tiles (focus ring visible, list clamps at both ends), press `Enter` on another: it becomes current, the header changes to that persona, focus stays on the tile, and `Tab` leaves the list.
- `npm run dev -- <a project with two modules>`: group headings appear with the tiles in config order; with one module no heading shows.

## Auto Run Result

Status: done

**What was implemented.** The Team half of the rail now holds one 56px tile per installed agent: a 36px portrait, the name, the title beside it, and a state line of dot plus text, with a hover-and-focus menu hint of the agent's first six codes (`+N` for the rest). Tiles are grouped by `module`/`team` in first-appearance order with config order inside each group, headed only when two or more groups exist, and form one roving-tabindex list (arrows move and clamp, `Enter`/`Space` are native clicks, focus stays on the activated tile). The five-state status dot is its own component, and a chat header (38px portrait, `--fs-head` name, title, roster `description` capped at 72ch, state) sits above the thread and rebuilds when another tile is made current. `Shell` owns the current persona, derived at render from the display order, and reads every state from an optional `states` map that is empty in this epic, so every tile and the header read `idle` from the same lookup Epic 2 will feed.

**Files changed.**
- `src/renderer/ui/status/*` (new) — `persona-state.ts` (the five states, their words, `stateOf`), `status-dot.tsx`/`.css` (`StatusDot`, `StateLine`).
- `src/renderer/ui/team/*` (new) — `tile-groups.ts` (`groupAgents`, `displayOrder`, `showsHeadings`, `currentAgent`), `tile-nav.ts` (`tileMove`, `tabStopId`), `persona-tile.tsx`, `team.tsx`, `team.css`.
- `src/renderer/ui/chat/*` (new) — `chat-header.tsx`/`.css`.
- `src/renderer/ui/shell/{shell.tsx,shell.css}` — current persona, `<Team>` in the Team half, `<ChatHeader>` above the thread, `.rail-group`.
- `src/renderer/design/{tokens.css,focus.css}` — thirteen promoted role tokens (twelve specified, plus `--focus-ring-offset-inset`) and the `.focus-inset` rule.
- `src/renderer/ui/persona/art-params.ts` — `artParamsFor` now looks curated ids up by own property.
- Tests: new suites beside each new module, `tests/team-contract.test.ts`, and updates to the shell, tokens, accessibility, persona and shell-contract suites.

**Review findings.** 31 findings across four layers (Blind Hunter 15, Edge Case Hunter 13, Verification Gap 2, Intent Alignment 1) — 0 high, 4 medium, 21 low, 6 false. Patched (8 entries): the shared focus ring clipped by `.rail-body`'s overflow (medium; a `.focus-inset` rule and token draw it inside the tile edge), `snapshot.menus` reaching the tile hint untested (medium), `Team`'s handlers and `Shell`'s select-to-header chain untested (medium; hook-stubbed tests, no DOM dependency), modifier-held arrows treated as tile moves, a whitespace-only `team` heading, and long names and titles overflowing the tile and header (the last three low). Deferred: none. Rejected with reasons: see the triage log. **One more fix came out of the patch pass, not the review:** the new `constructor` menus test exposed that `artParamsFor` found an inherited function for an agent id like `constructor` and crashed the whole room; it now checks own properties, with a regression test.

**Follow-up review recommended: true.** Three medium entries were patched on a first pass. The unverified risk: nothing has run the real Electron window — the inset focus ring against the tile edges and the current-tile accent bar, the native-button reset (relying on the default button radius being zero), the hint's hover reveal moving the list, and the ellipsised names were checked only by stylesheet text and static markup. Patched counts by verdict: high 0, medium 3, low 3.

**Verification.** `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` exit zero; **895 tests across 39 files** (780 before this story). The spec's greps are clean (no `outline`, `z-index`, `@keyframes` or `font:` in the new stylesheets; no arrow-key name, `aria-live`, `style=` or `title=` in the new sources) and `package.json` is unchanged. The I/O matrix audit found every row covered by a passing test, the two behavioural rows through the hook-stubbed `Team`/`Shell` tests; the real-window checks (focus movement, hover reveal, ring visibility, hint at the bottom of the scrolled list) are manual.

**Residual risks.** The manual checks in Verification were not run against a live `npm run dev`. The `Preview` scaffolding still repeats every persona in the thread (pinned by `tests/persona.test.ts`; Story 1.11 and Epic 3 replace it). The current persona resets to the topmost tile if the shell unmounts across an open, blocked, open round trip — the Story 1.9 deferral, unchanged. A focused tile whose agent vanishes from the roster drops focus to the page; rare, and not addressed. No DOM test environment exists; the Story 1.2/1.9 deferral is carried forward, not closed.

# Extraction — harness-mockup.html (binding visual source)

`<title>BMad Harness — design mockup</title>`. Single file, 1,408 lines / 76,971 bytes: inline `<style>` 8–405, markup 408–758, inline `<script>` 760–1406.

## 1. The `:root` block (verbatim, source order)

| # | Property | Value |
|---|---|---|
| 1 | `--bg` | `#101317` |
| 2 | `--chrome` | `#14181d` |
| 3 | `--panel` | `#171b21` |
| 4 | `--panel-2` | `#1b2027` |
| 5 | `--panel-3` | `#20262e` |
| 6 | `--line` | `#272d36` |
| 7 | `--line-soft` | `#1f242c` |
| 8 | `--text` | `#dce2ea` |
| 9 | `--text-strong` | `#f1f4f8` |
| 10 | `--dim` | `#96a0ad` |
| 11 | `--faint` | `#6b7480` |
| 12 | `--accent` | `#7fa6e8` |
| 13 | `--accent-bg` | `rgba(127,166,232,.12)` |
| 14 | `--green` | `#6aa87f` |
| 15 | `--amber` | `#c6a350` |
| 16 | `--red` | `#c47c72` |
| 17 | `--mono` | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` |
| 18 | `--sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| 19 | `--r` | `5px` |

⚠️ **`--red` is never referenced by `var()` anywhere** — the disagree colour is written literally as `rgba(196,124,114,…)` / `#d0968c`. `--panel-3` is used exactly once (`.skillbtn:hover`).

Base: `body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:13px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow:hidden}`

## 2. Hardcoded literals not in `:root`

### 2a. Literal colours — CSS
`#2b323b` scrollbar thumb · `#3a434e` thumb hover · `#445062` brand mark border · `#3a424d` crumb sep · `#242b34` segmented pressed bg · `#39414c` ghost-btn hover border · `rgba(106,168,127,.14)` live dot ring · `rgba(198,163,80,.13)` work dot ring · `#1f262f` current ptile bg · `#1b2028` code-tag bg · `#5b636e` (5 uses: `.fgroup`, turn timestamps, `.skillrow .lbl`, `.hintline`, `.legend .r`) · `rgba(198,163,80,.10)/.25` + `#d7b96a` status-pill · `rgba(127,166,232,.045)` user turn bg · `rgba(127,166,232,.45)` user turn inset · `#1c2128`/`#c3cedd` inline code · `#2b333d`/`#39424e`/`#aab4c1` initials · `#b9c4d1`/`#e4ebf3`/`#6e7783` doccard body/heading/muted · `#465264` opt+chip hover border · `#33455f` opt key + skillbtn code border · `#475364` skillbtn hover border · `#3c4a60` input focus border · `#5c646f` placeholder · `#2c3a52`/`#3b4d6b`/`#cfe0f8` sendbtn · `#334463` sendbtn hover · `linear-gradient(180deg,#151920,#12161b)` cast · `#41597e`/`#1b222c` speaking castcard · `#181d24` live pturn · `#d0968c` + `rgba(196,124,114,.3)/.09` disagree tag · `rgba(8,10,13,.55)` scrim · `#333b46` win border · `rgba(0,0,0,.85)` win shadow · `linear-gradient(180deg,#232a33,#1d232b)` win titlebar · `#3a424e` traffic lights · `#cdd6e0` md body · `#c9a78a` + `rgba(201,167,138,.3)/.08` legend badge

### 2b. Literal colours — inline/JS
`color:#d0968c` party disagreement chip · `color:#c6a350` PRD FR-7 blocked `<em>` · **`background:#7fa6e8` in `stateDot("note")` — the accent hex repeated literally as the note state** (this is exactly the token AD-14 says is missing) · `#c6a350`/`#6b7480` file icon stroke

### 2c. Portrait SVG literals
Shared: `#f3eee9` eye whites (rx 3.1 / ry 2.1) · `#2a2220` pupil (r 1.35) · `#3b302a` upper lash, sw 1.15 · `#9c6152` mouth, sw 1.5 · `rgba(240,246,255,.07)` lens fill · `#cdd4dc` glasses frame, sw 1.35 · `#c9b07c` earrings (r 1.7 at cx 31/69, cy 54)

Per-persona `art` palettes (all literal hex):
| Persona | skin | shade | hair | shirt | collar | bg |
|---|---|---|---|---|---|---|
| john | `#efc6a1` | `#d9a87f` | `#9ba3ab` | `#465260` | `#39434f` | `#2a3340` |
| mary | `#e7b68d` | `#cf9a72` | `#7d4a2b` | `#3c4756` | `#313b48` | `#2f3742` |
| winston | `#7d4f30` | `#653d24` | `#1e1a17` | `#3c4a4b` | `#313d3e` | `#2f3a3c` |
| sally | `#bd7c4e` | `#a06539` | `#241f1d` | `#4b4053` | `#3d3445` | `#383345` |
| amelia | `#ebc09c` | `#d3a47e` | `#2c2521` | `#3f4b45` | `#343f3a` | `#333c3a` |

`hairDark = shade(a.hair, -18)`; `shade()` adds an integer per RGB channel, clamped 0–255.

### 2d. Border-radius — ELEVEN distinct values (AD-14 names five)
| Value | Used by |
|---|---|
| `1px` | `.brand .mark::after` |
| `2px` | `.skillbtn .c`, `.legend b` |
| `3px` | `.brand .mark`, `.chip`, `.code-tag`, `.status-pill`, `code`, `.opt .k`, `.tag-disagree`, `.tag-neutral` (8 uses) |
| `4px` | `.runchip`, `.skillbtn`, `.sendbtn` |
| `5px` | `.opt`, `.openq`, + `var(--r)` on `.segmented`, `.ghost-btn` |
| `6px` | `.turn`, `.doccard`, `.inputwrap`, `.castcard`, `.pturn` |
| `8px` | `.win` |
| `10px` | scrollbar thumb |
| `50%` | `.dot`, `.initials`, traffic lights, speaking portrait ring, stacked faces, portrait `<svg>` |
| `99px` | `.handoff-chip` (pill) |

### 2e. Font-size — SIXTEEN distinct values
`9px` legend badge · `9.5px` code-tag, skillbtn code, cast status, tags · `10px` rail meta, dirline, fgroup, turn timestamp, doccard section, opt lean, skillrow label, win foot, legend r · **`10.5px` (16 uses — densest tier)** chip, rail head, rail foot, ptile state, fmeta, sysline, runchip, doccard foot, opt key, hintline, cast info, replyto, sidesec h4, kv key, openq qw, legend · `11px` brand span, ptile name span, ptile state, turn role, initials, sysline, status-pill, doccard path, handoff-chip, win path, md sub, md th · `11.5px` crumbs, ghost-btn, chat-head role/l2, fname, code, doccard body, opt txt, skillbtn, sendbtn, party t2, kv, openq qt, md fr · `12px` segmented button · `12.5px` brand b, ptile name b, turn name, opt title, cast name, md h3, md table · `13px` **body base**, party t1 · `13.5px` `.md` document body · `14px` chat-head name · `14.5px` md h2 · `20px` md h1

### 2f–h. Line-height / weight / tracking
Line-height: `1.55` body · `1.45` openq · `1.72` doccard body + `.md` · `0` `.pf`
**Weight: `600` is the only non-default weight in the entire file** (16 uses).
Letter-spacing: `-.01em` md h1 · `.01em` segmented, chat-head name · `.02em` brand · `.03em` sysline, md h3 · `.04em` code-tag, fgroup, tags, md th · `.05em` skillbtn code · `.07em` skillrow label · `.08em` legend badge · `.09em` rail head, sidesec h4

### 2j. Layout dimensions
topbar `42px` · brand mark `16×16` (`::after` inset 3px) · chip `20px` · dot `6×6` · **rail `flex:0 0 348px`** · rail-half `flex:1 1 50%` · rail-head `30px` · ptile menu-hint `max-height:0→60px` · chat-head l2 `max-width:72ch` · **thread + composer-inner `max-width:940px`** · initials `32×32` · doccard body `max-height:230px` · caret `6.5×13px` · textarea `min 20px / max 120px` · party-thread `max-width:900px` · castcard `flex:1 1 0; min-width:148px` · eq `8px` container, bars `2×3px` · **party-side `flex:0 0 288px`** · kv key col `74px` · stackfaces `margin-right:-6px` · scrim `z-40 inset:0` · win `z-50, top:8vh, width:min(880px,92vw), height:min(760px,80vh)` · wtitle `36px` · lights `10×10` · wbody `padding:26px 34px 40px` · `.md max-width:70ch` · wfoot `28px` · **legend `flex:0 0 24px`** · scrollbars `10px` w/ 3px transparent inset border

Portrait `data-size`: **38** chat header · **36** persona tile · **32** transcript (default) · **44** cast card · **20** handoff chip + stacked faces. `viewBox="0 0 100 100"`.

### 2k. Spacing actually in use
Gaps: `1.5, 4, 5, 6, 7, 8, 9, 10, 12, 14px` (most common 8px ×10, 6px ×10, 10px ×7). Paddings are highly varied (34 distinct combinations) — **not a strict scale**.

### 2l. z-index — only two
`40` scrim · `50` win

### 2m. Box-shadows
`0 0 0 3px rgba(106,168,127,.14)` live dot · `0 0 0 3px rgba(198,163,80,.13)` work dot · `inset 0 -2px 0 var(--accent)` segmented pressed · `inset 2px 0 0 rgba(127,166,232,.45)` user turn · `inset 2px 0 0 var(--accent)` live pturn · `0 0 0 1px rgba(127,166,232,.22), 0 6px 18px -10px rgba(0,0,0,.8)` speaking castcard · `0 0 0 2px var(--accent)` speaking portrait ring · `0 0 0 1.5px var(--panel-2)` stacked face cut-out · `0 30px 70px -20px rgba(0,0,0,.85)` win

## 3. Component inventory (selected — full states)

- **Topbar** 42px `--chrome`, 1px `--line` bottom, gap 14px. Responsive: wraps, `height:auto` under 1000px.
- **Brand mark** pure CSS: 16px bordered square + `::after` accent square at inset 3px, `opacity:.75`.
- **Segmented control** — default / hover (`color:var(--text)`) / **pressed** `[aria-pressed="true"]` → bg `#242b34`, `--text-strong`, `inset 0 -2px 0 var(--accent)` underline.
- **Status dot** 6px — **idle** faint · **live** green + halo · **work** amber + halo · **note** inline `#7fa6e8` · **pulsing** via `.pulse`.
- **Persona tile** — default / hover (bg `--panel-2`, **menu-hint reveals**) / **current** `[aria-current="true"]` → bg `#1f262f` + 2px `--accent` left bar via `::before`.
- **File row** — default / hover / **writing** → filename `--text-strong`, meta `--amber`, amber pulsing dot, amber icon stroke. JS flips writing→saved.
- **Live doc card** — header `.dh` `--panel-2` with mono path + right-aligned amber status; body mono 11.5px/1.72 `#b9c4d1` `white-space:pre-wrap` scrolling at 230px; footer `.df` `--panel-2`. **writing** (amber + work dot + caret) → **saved** (`--green`, dot→`.live`, caret removed).
- **Decision option** `.opt` — key badge mono 10.5px `--accent` on `--accent-bg`; hover border `#465264` + bg `--panel-2`. **The whole `.options` block is removed from the DOM once one is chosen.**
- **Skill button** — `--panel-2`, 1px `--line`, radius 4px, 11.5px; code badge mono 9.5px accent. Hover → border `#475364`, bg `--panel-3`. `.more` variant in `--faint`.
- **Composer** — focus-within → border `#3c4a60`. Send button `#2c3a52`/`#3b4d6b`/`#cfe0f8`.
- **Cast card** — **default `opacity:.42`**, hover `.72`, **speaking `1`** + border `#41597e` + bg `#1b222c` + accent glow + 2px accent ring on the portrait + status in `--accent` with equaliser.
- **Disagree tag** — mono 9.5px `#d0968c` on `rgba(196,124,114,.09)` with `.3` border. **The only warm-toned chip on screen.** Labels vary: "disagrees · Winston", "disagrees · framing", "unresolved".
- **Neutral tag** — same geometry, `--dim`/`--line`/`--panel-2`. Labels: "evidence", "concedes · partly", "speaking", "proposed", "answers", "builds on", "decides".
- **Document window** — `--panel`, 1px `#333b46`, radius 8px, heavy shadow. Title bar 36px gradient, three 10px lights, mono path, ghost buttons.
- **`.md` renderer** — `max-width:70ch`, `#cdd6e0`, 13.5px/1.72. h1 20px/600 `-.01em`; `.sub` mono 11px `--faint` + bottom rule; h2 14.5px/600; h3 12.5px/600 uppercase `.03em` `--dim`; tables collapsed 12.5px, th `--panel-2` uppercase 11px `.04em`; `.fr` mono 11.5px `--accent` nowrap.
- **Legend footer** 24px `--chrome` — badge `#c9a78a` on `rgba(201,167,138,.08)`, uppercase 9px `.08em`.

## 4. Surfaces

**Topbar:** brand + "BMad Harness" + "0.4.0-dev" → crumbs (`│`, `~/work/falcon`, chip "BMad v6 · 29 skills · 5 agents" + live dot, chip "feat/payouts-prd") → spacer → segmented `1:1 Conversation | Party Mode` → Help ghost button (`title="Not wired up in this mockup"`).

**Legend footer:** `Mockup` badge + "Non-functional design prototype — every persona, document, timestamp and figure here is fictional. Nothing is written to disk." + "buttons, tiles, documents and both views are clickable" / "esc closes a document window".

**`#view-solo`** (`flex-direction:row`): `.col-chat` (`flex:1 1 auto`) = chat head → scroll thread (940px) → composer (skill row + input + hints); `.rail` (`flex:0 0 348px`) = two `flex:1 1 50%` halves — **Team** (head/meta "5 agents · install", 5 ptiles, footer) and **Outputs** (head/meta live dot + "fs.watch _bmad/", grouped frows, footer "Click any document to open it in its own window.").

⚠️ **Stale microcopy in the rail footer:** *"Read from each agent's `customize.toml` — name, title, icon and menu. Hover a tile for its skill codes; click to continue the session with them."* And the composer hint: *"skills read from .claude/skills/bmad-agent-pm/customize.toml → [[agent.menu]]"*. **AD-10 says the roster comes from `_bmad/config.toml` `[agents.*]`, and AD-8 says config files are never read directly.** This copy is factually wrong now.

Doc-card footer: *"1,118 words · 9 sections · autosave on"* / *"click the file in the rail to open it in its own window"*. Composer hint also: *"@ to hand off mid-session"*.

**`#view-party`** (`flex-direction:column`): `.party-head` (title · topic behind a 1px left border · chip "5 participants" · red chip "2 open disagreements" · spacer · chip "turn 11 · 6m 40s" · "Pause room" · "Write summary to _bmad/") → `.cast` (gradient, `overflow-x:auto`, 5 castcards, one speaking) → `.party-thread` (900px) → composer (no skill row; hints "no turn gate · your message interrupts the current speaker", "@name to direct a question", "transcript → _bmad/party/2026-09-23-payouts.md") → `.party-side` (`flex:0 0 288px`) = **Room** (4 kv) + **Open disagreements** (3 openq, scrollable) + **Decisions so far** (2 kv keyed by timestamp).

**Document window:** scrim z-40 + win z-50; title bar (3 lights, mono path, "Reveal in Finder" / "Open in editor" / "Close") → wbody `padding:26px 34px 40px` with `.md` at 70ch → wfoot ("separate window · read-only preview · reloads on write" / "markdown · utf-8"). Fixtures: `PRD.md`, `architecture.md`, `product-brief.md`, `DESIGN.md`, `sprint-status.yaml`, `2026-09-23-payouts.md`, plus a `GENERIC` fallback.

**Responsive:**
```
@media (max-width:1180px){ .party-side{display:none} }
@media (max-width:1000px){
  body{overflow:auto} .app{height:auto;min-height:100vh}
  .view.active,#view-solo{flex-direction:column}
  .col-chat{min-height:62vh}
  .rail{flex:0 0 auto;width:auto;border-left:0;border-top:1px solid var(--line)}
  .rail-half{min-height:230px} .scroll{overflow:visible}
  .cast{flex-wrap:wrap} .castcard{flex:1 1 44%}
  .topbar{flex-wrap:wrap;height:auto;padding:6px 10px;gap:8px}
  .crumbs{order:3;width:100%}
}
```

## 5. Iconography — NO icon font, NO emoji, NO image files
- **File icon** inline SVG 12×14, two paths (page + folded corner), `stroke-width:1`, `#c6a350` writing / `#6b7480` idle, rendered at `opacity:.75`
- **Brand mark, traffic lights, equaliser, status dots** — all CSS shapes
- **Breadcrumb separator** literal `│`
- **Glyphs in copy** literal Unicode: `→ ↔ ⌘↵ · § ≈ —`

**Portrait construction** — `.pf` is `display:inline-block;line-height:0;vertical-align:middle`. SVG is `viewBox="0 0 100 100" role="img" aria-label="{name}, {title}" style="border-radius:50%;display:block"`.

Draw order (100×100): 1 backdrop circle r50 `{bg}` → 2 back hair mass (`long`/`bun` only) in `hairDark` → 3 neck `M43,57 h14 v16 h-14 z` in `shade` → 4 shoulders `M7,100 C9,82 26,73 50,73 C74,73 91,82 93,100 Z` in `shirt` → 5 collar notch + stroked V (`stroke-width 1.6`, `linejoin:round`) → 6 crown hair (`curly` = 7 circles; `receding` = ellipse rx19.3 ry18.4; else ellipse default `{cy:36,rx:20.6,ry:21.2}`, John `{cy:34,rx:19.6,ry:18.4}`) → 7 ears (cx 31/69, cy 49, rx 2.7, ry 4.2) → 8 face ellipse (cx50 cy46 rx19 ry21.4) → 9 beard (`opacity .42` close / `.9` full) → 10 fringe over forehead → 11 brows (quadratic, `hairDark`, sw 1.5, `linecap:round`, `opacity .9`) → 12 eyes (x ∈ [43,57]) → 13 nose (stroked `shade`, sw 1.25) → 14 mouth → 15 glasses (`rect` 13.4×9.4 rx3, or `circle` r6.6) → 16 earrings (Sally only).

Idempotent: `paintPortraits()` skips any `.pf` with `dataset.done`; `setHeader()` clears it to force repaint on persona change.

File comment: *"PORTRAITS — inline SVG, illustrated company-directory headshots"*.

## 6. Motion

| Name | Trigger | Declaration |
|---|---|---|
| `pulse` | `.pulse` on work dots | `1.5s ease-in-out infinite`; `0%,100%{opacity:1} 50%{opacity:.35}` |
| `blink` | `.caret` while typing | `1.05s steps(1) infinite`; `50%{opacity:0}` — **hard on/off, never a fade** |
| `eq` | speaking cast card | `.9s ease-in-out infinite`; `height 3px→8px`; delays `.15s/.3s/.45s` |
| menu-hint reveal | `.ptile:hover` | `max-height .16s ease, opacity .16s ease` |
| cast emphasis | castcard state | `opacity/border-color/background .25s ease` |
| **reduced motion** | `@media (prefers-reduced-motion:reduce)` | `*{animation:none!important;transition:none!important}` |

JS timing: **26ms/char** doc typewriter · **34ms/2 chars** party speech · **380ms** handoff first line · **520ms** decision reply · **620ms** solo reply · **700ms** party reply. **Both typewriters check `matchMedia` and paint the full text instantly under reduced motion, caret never shown.**

## 7. Behaviour invisible in a screenshot
1. **Hover reveal on persona tiles** — menu-hint `max-height:0;opacity:0` until hover; max 6 codes then `+N`
2. **Doc typewriter** 26ms/char with auto-scroll each tick + blinking accent caret
3. **Party typewriter** 34ms/2 chars, caret removed on completion
4. **Decision flow — multi-surface state change.** Clicking `.opt`: removes the whole `.options` block from the DOM, appends a user turn, then after 520ms John's reply. A and B also: stop typing + append the option's text to the doc · rewrite `#livestatus` to "saved · just now · 9 sections" + add `.saved` (amber→green) · swap `#livedot` work→live · update the `PRD.md` rail row (drop `.writing`, meta "saved · just now", grey icon) · rewrite the chat-head pill to "idle · PRD.md saved" · mutate `P.john.state` and re-render all tiles. **Option C changes nothing but the transcript.**
5. **Handoff** — via tile, `Hand off →` (cycles `ORDER = ["mary","john","sally","winston","amelia"]`), or the Winston chip: injects sysline "handed off · {from} → {to} · conversation and context continue", repaints header, re-renders the skill row, updates the placeholder to "Reply to {name}…  (⌘↵ to send)", then after 380ms a persona-specific `HANDOFF_LINE`
6. **Skill row data-driven + truncated** — first 5 entries as buttons; `+N more` prints the full menu inline as a persona turn
7. **Cast speaker switching** on click; sending also reassigns the speaker
8. **Party replies insert ABOVE the live turn** (`insertBefore(node, #liveturn)`) so the live speaker stays pinned at the bottom
9. **Textarea autogrow** capped at 120px
10. **Keyboard** — `Enter` sends unless `Shift` held (⌘↵/Ctrl↵/plain ↵ all send); **`Escape` closes the document window from anywhere**
11. **Scrim click closes the window**; `.win` and `.scrim` share one `.open` class
12. **`pathOf(name)`** walks `FILES` accumulating the last-seen group, so the title bar shows `_bmad/ux/DESIGN.md` not the basename
13. Round-robin canned replies (4 solo, 4 party)
14. Boot scroll to bottom inside `requestAnimationFrame`
15. **`GENERIC` empty state** for any file without fixture content
16. Custom scrollbars 10px, `#2b323b` thumb, 3px transparent inset border + `background-clip:content-box`
17. **Help is explicitly out of scope** — `alert("Design mockup — the help section is a 'Should' in the plan and is not part of this prototype.")`
18. `.pturn.dim-other{opacity:.9}` is defined but **never applied**

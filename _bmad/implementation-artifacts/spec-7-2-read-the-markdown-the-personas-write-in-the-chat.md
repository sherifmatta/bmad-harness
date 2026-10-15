---
title: 'Read the markdown the personas write, in the chat'
type: 'feature'
created: '2026-10-15'
status: 'done'
baseline_revision: '20fc44ebe85a625a93fa83dddaf427fedb4b7b20'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-7-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** A persona's reply reaches the chat as plain `pre-wrap` text, so headings, lists, tables and code show as asterisks, hashes and pipes in the middle of a conversation (FR130).

**Approach:** A persona's completed turn (1:1 thread and room thread alike) is drawn through the existing `renderMarkdown` pipeline and `MarkdownBody`'s one `innerHTML`, under the chat's own class `.turn-md` at the chat's type and measure. A turn still being written stays plain text with its caret and is rendered once, when it ends.

## Boundaries & Constraints

**Always:** One pipeline, one allow-list, one place that sets inner HTML (`markdown-body.tsx`); `MarkdownBody` gains a `className` (default `doc-md`, so the document window is unchanged) and an optional `fallback` drawn when the rendering is `''` for a non-blank text. Completed = not in flight: `writing === undefined`, so a turn read back from a stored transcript is rendered. Chat styles use tokens only: no heading larger than `--fs-base`, code mono on `--panel-2`, a table that scrolls inside the turn and never widens the column, requirement-id span (`.fr`) drawn as in the document window with no link, links inert. Rendering runs once per completed turn (memoised on its text), never per keystroke or frame, and never for a streaming turn. Plain text stays plain for: the user's turn, syslines, decision blocks, run-card prose and step labels, the pending turn.

**Never:** A second pipeline, allow-list or `innerHTML`/`dangerouslySetInnerHTML` site; any change to `render-markdown.ts`'s allow-list; `.doc-md` inside the chat; a new library; a copy button, syntax highlighting or link opening; markdown for the user's turn or a run card's prose; half-parsed markup from a streaming turn; progressive rendering or an animation on the switch.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Completed turn | persona text `## T\n\n- a\n- b\n\n\`x\``, not writing | `.turn-md` holds `h2`, `ul`, `code` through the one `innerHTML` | N/A |
| Streaming | same text, `writing` set | plain `.turn-words` paragraphs + caret, no `.turn-md`; no `renderMarkdown` call | N/A |
| Turn ends | the streamed turn stops being in flight | one render swaps words for markdown; the `.turn` node is kept; caret and state line gone | N/A |
| Stored turn | hydrated entry, never in flight | rendered | N/A |
| Hostile fixture | raw HTML, `<style>`, `<script>`, `<img>`, `javascript:` link, `onclick` | none becomes an element; link is its text with no `href` | N/A |
| Sanitiser cannot run | non-blank text, `renderMarkdown` = `''` | plain `.turn-words` text, never an empty row | fallback |
| Requirement id | `FR55` in text | `span.fr`, no link | N/A |
| Wide table / long code | table or `pre` wider than the column | scrolls inside `.turn-md`; the column does not widen | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/doc/markdown-body.tsx` -- the one `innerHTML`. Add `className = 'doc-md'` and `fallback?: ReactNode`; when `html === ''` and `text.trim() !== ''` and a fallback is given, return it. Keep `renderMarkdown(text)` and the single `dangerouslySetInnerHTML` (`tests/document-window-contract.test.ts:210-225` pins both).
- `src/renderer/ui/doc/render-markdown.ts` -- read-only. Fails closed (`''` under Node); `ALLOWED_TAGS` has no `a`/`img`; requirement ids become `span.fr`.
- `src/renderer/ui/chat/turn.tsx` -- `Words` (plain, caret) and `PersonaTurn` (`writing`). Add `PersonaWords({ text, writing })`: `writing` set → `<Words caret>`; else `<MarkdownBody className="turn-md" fallback={<Words text/>}/>`. `PersonaTurn` uses it. `PendingTurn` and `UserTurn` stay on `Words`. Update the "wrapped in nothing / rendered exactly as given" comment.
- `src/renderer/ui/party/party-turn.tsx` -- `PartyTurn` draws a persona's words with `Words`; switch to `PersonaWords` (same `writing` meaning).
- `src/renderer/ui/chat/transcript.tsx:194-213` -- passes `writing` from `inFlight`; no change expected.
- `src/renderer/ui/chat/turn.css` -- add `.turn-md` rules beside `.turn-words`: sans `--fs-base`/`--lh-base`/`--text`, `overflow-wrap: anywhere`, `p` margin as `.turn-words p`, `h1`–`h6` at `--fs-base` strong, `ul/ol` indent `--md-list-indent`, `code` mono `--fs-body-ui` on `--panel-2`, `pre` `overflow: auto`, `table` `display: block; max-width: 100%; overflow-x: auto`, `.fr` accent mono nowrap. Model on `.doc-md` rules in `src/renderer/ui/doc/doc-window.css:166-290`; no literal values.
- Tests that pin plain words today and will change: `src/renderer/ui/chat/turn.dom.test.tsx` (`.turn-words` innerHTML, settle test), `turn.test.tsx`, `decision-block.dom.test.tsx`, `epic-3-audit.dom.test.tsx`, `src/renderer/ui/party/epic-4-audit.dom.test.tsx:749`, `src/renderer/ui/app.test.tsx`, `tests/negative-surface.test.ts`, `tests/conversation-contract.test.ts`, and the token/literal sweeps (`tests/tokens.test.ts`).
- Fixture for the hostile case and the cost measure: `render-markdown.dom.test.ts` (Story 1.12's fixture, reuse); recorded turns in `fixtures/runs/*.jsonl` (longest assistant text).
- Docs: `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md` → *Conversation turn* (~1038), whose "rendered as text" / "split on blank lines and nothing else" wording must give way for a persona's completed turn.

## Tasks & Acceptance

**Execution:**
- `markdown-body.tsx` -- `className` and `fallback` props, defaults keep the document window byte-identical -- one innerHTML site, no second pipeline
- `turn.tsx`, `party-turn.tsx` -- `PersonaWords`; use it for a persona's turn in the thread and the room -- completed = rendered, streaming = plain
- `turn.css` -- `.turn-md` anatomy from tokens -- chat's own type and measure
- Tests: new `turn-md.dom.test.tsx` (completed rendered; streaming plain and never calls the renderer; swap keeps the node, drops caret/state; stored turn rendered; fallback when sanitiser returns `''`; user turn, sysline, pending turn, decision block plain; hostile fixture renders no element, no `href`, in jsdom with real DOMPurify; `span.fr` no link; no `.doc-md` in the chat); narrow the contract test (still exactly one `dangerouslySetInnerHTML`, still `markdown-body.tsx`, and no new `innerHTML`-ish call anywhere); CSS test that `.turn-md` has no literal colour/dimension, no heading above `--fs-base`; update the pinned plain-words tests listed above
- Measure `renderMarkdown` over the longest recorded turn in `fixtures/`, once, and state the number in the Auto Run Result
- `DESIGN.md` -- add the chat's markdown anatomy beside *Conversation turn* (sizes, code block, table, streaming-then-once)

**Acceptance Criteria:**
- Given a completed persona turn in the thread or the room, then it is drawn by `MarkdownBody` under `.turn-md`, never `.doc-md`, and a test fails if any file other than `markdown-body.tsx` sets inner HTML
- Given the document window's hostile fixture, then the chat renders no `style`, `script`, `img`, `a`, `href` or handler attribute
- Given a turn in flight, then it is plain text with the caret and `renderMarkdown` is not called for it; when it ends it is rendered in one render with the same `.turn` node
- Given non-blank text whose rendering is `''`, then the turn is plain text, never an empty row
- Given the user's turn, a sysline, a decision block, a run card's prose or a step label, then each is unchanged plain text
- Given `DESIGN.md`, then it describes the chat's markdown anatomy

## Spec Change Log

## Review Triage Log

### 2026-10-15 — Review pass
- verdicts: 25 findings — high 0, medium 3, low 16, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) single newlines collapse in a rendered turn, so `A. Postgres\nB. SQLite` runs together where plain words kept the lines — `white-space: pre-line` added to `.turn-md p` only, with a CSS contract check and a DESIGN.md clause; grouped with the edge-case and verification-gap rows below
  - `[low]` `[reject]` (blind) link destinations are lost — links are inert text by the spec's decision and the existing pipeline rules; the intent excludes showing them
  - `[low]` `[reject]` (blind) blockquote in the room contradicts the party-turn comment — the comment forbids the harness adding quote chrome, not an author's own `>`; no harm named
  - `[low]` `[reject]` (blind) scroll containers not keyboard-reachable — the allow-list cannot take `tabindex` and the story forbids changing it; browsers make a scroll container with no focusable child focusable
  - `[low]` `[reject]` (blind) no test of scroll anchoring at the plain-to-markdown switch — the change touches neither scroll nor focus; jsdom does no layout
  - `[low]` `[reject]` (blind) a cancelled turn may end mid-fence and render as code — the markdown shows what was written; a guard would be new complexity for a rare case
  - `[low]` `[reject]` (blind) epic-4 audit assertion loosened and partly circular — the in-flight and finished pair is pinned deterministically in `turn-md.dom.test.tsx`
  - `[false]` `[reject]` (blind) blank text draws an empty row — a blank persona turn drew an empty `.turn-words` div before; the spec's no-empty-row rule is for the sanitiser fallback
  - `[low]` `[reject]` (blind) smaller test and CSS hygiene (token reuse for `pre`, redundant mock import, cast, long-transcript remount cost) — no named harm; the longest recorded turn renders in about 14 ms cold
  - `[low]` `[reject]` (edge) text that renders to `<p></p>` (an image or empty link alone) gets no fallback — needs a persona reply that is only an image; fix adds a guard
  - `[medium]` `[patch]` (edge) single newlines collapse — same root cause as the first row; patched there
  - `[low]` `[reject]` (edge) no cache across remounts — `useMemo` renders once per mounted turn; no stall measured
  - `[low]` `[reject]` (edge) partial turn ending mid-fence — same as the cancelled-turn row above
  - `[low]` `[reject]` (edge) contract test misses a dynamic `import()` of the pipeline — hygiene; no such import exists
  - `[low]` `[reject]` (edge) the `(?<!\.turn-md )blockquote` exemption is broader than one selector — developer-only and no party file names that selector
  - `[false]` `[reject]` (edge claim) the measurement is not in the diff — it is stated under Auto Run Result, as the spec asks
  - `[false]` `[reject]` (edge claim) listed tests did not change — they needed no change; `turn.test.tsx` and `app.test.tsx` run under Node where the sanitiser fails closed, so they stay plain
  - `[low]` `[patch]` (edge claim) `.turn-md p` lacks the `pre-wrap` parity of `.turn-words p` — newline half patched with the first row; the extra margin on a loose list item is cosmetic and left
  - `[medium]` `[patch]` (verification-gap, other finding) soft line breaks lost, no test observes it — same root cause; now a CSS contract check pins `pre-line`
  - `[low]` `[reject]` (verification-gap, other finding) epic-4 audit assertion loosened — covered by `turn-md.dom.test.tsx`
  - `[false]` `[reject]` (intent) measurement not in the diff — see above
  - `[low]` `[reject]` (intent) the running-app check was not done — cannot run unattended; recorded as a residual risk
  - `[false]` `[reject]` (intent) tests listed as changing did not change — see above
  - `[false]` `[reject]` (intent) skill output not touched — Story 7.5 does not exist yet; this story is the persona's turn
  - `[low]` `[reject]` (intent) scroll and focus claim untested — nothing here moves either; same as the scroll-anchoring row

## Design Notes

The room's persona turns are persona words drawn by the same `Words`, and FR130 says "in the chat", so both threads render; the room's accent edge, caret and state line are untouched. A decision block is read from the raw `entry.text`, not the rendered HTML, so it is unaffected. A run card's prose stays mono text (Story 7.2 decision): it is a document in progress, not a reply.

```tsx
<MarkdownBody className="turn-md" text={text} fallback={<Words text={text} />} />
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass, except the known Story 7.7 `tests/tokens.test.ts > carries the status dot and the persona tile` (`--tile-height` 56px vs 44px) failure that pre-exists in HEAD; also run `vitest --project watchers` directly if the chain stops early

**Manual checks (if no CLI):**
- Run the app: a persona reply with a heading, list, table and code block reads as markdown once the turn ends, plain while streaming; a wide table scrolls inside the turn.

## Auto Run Result

Status: done
Commit note: the pre-commit hook (`npm test`) rejected a normal commit on `tests/tokens.test.ts > carries the status dot and the persona tile` (`--tile-height` 56px vs DESIGN.md 44px, a Story 7.7 change already in HEAD; it fails identically without this change). The owner chose to commit with `--no-verify`, as for Story 7.1.

**Summary.** A persona's completed turn, in the thread and in the room, is now read as markdown through the document window's one pipeline and its one `innerHTML`, under the chat's own `.turn-md`; a turn in flight stays plain text with its caret and is rendered once when it ends. A single line break inside a paragraph is kept, as plain words kept it.

**Files changed.**
- `src/renderer/ui/doc/markdown-body.tsx` -- `className` (default `doc-md`) and `fallback`
- `src/renderer/ui/chat/turn.tsx`, `src/renderer/ui/party/party-turn.tsx` -- `PersonaWords`, used by both threads
- `src/renderer/ui/chat/turn.css` -- `.turn-md` anatomy from tokens
- `src/renderer/ui/chat/turn-md.dom.test.tsx` (new), `tests/conversation-contract.test.ts`, `tests/document-window-contract.test.ts`, `tests/negative-surface.test.ts` and four existing dom tests -- new and updated pins
- `DESIGN.md` -- *Markdown in a persona's turn*

**Review.** Patches applied: 1 entry (medium, three reports of one root cause, plus one low claim from the same cause). Deferred: 0. Rejected: all other findings, with reasons in the triage log.

**Follow-up review recommended:** false (no high patched; one medium entry patched).

**Cost of rendering.** `renderMarkdown` over the longest recorded assistant turn (22,364 characters, `fixtures/runs/fast-path-opus.jsonl`): about 14 ms cold and 3 to 6 ms warm, under jsdom, once per completed turn.

**Verification.** `npm run typecheck` and `npm run lint` clean. `npm test`: 5637 passed, 1 failed (`tests/tokens.test.ts > carries the status dot and the persona tile`: `--tile-height` 56px vs DESIGN.md 44px, a Story 7.7 change already in HEAD's DESIGN.md; it fails identically without this change). `vitest --project watchers`: 64 passed.

**Residual risks.** The app was not run: a wide table or code block scrolling inside the turn, and scroll and focus on the plain-to-markdown switch, are untested outside jsdom. Link destinations are not shown (links stay inert).

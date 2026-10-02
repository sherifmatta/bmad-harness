---
title: 'Hand the work to the next persona'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: 'cfddd5fdaa24d73f3b0b942c8c888f1b2d27401b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      Nothing launches real Electron with the real claude CLI, so a handoff by tile or `@<name>`, the sysline rendering and the written-files fold over real frames are proven only through fakes and synthetic frames.
    evidence: |-
      The App tests mount the renderer against a hand-written bridge, the bridge tests use fake processes and synthetic stream-json frames, and the sysline's look is asserted on CSS source and markup, not computed style.
    location: >-
      src/main/session-bridge.ts (handoffFor), src/main/fold/written-paths.ts
    severity: low (unverified)
---

<intent-contract>

## Intent

**Problem:** Story 2.9 (epics.md "Hand the work to the next persona", FR60-63, UX-DR29/32). Switching tiles mid-conversation only swaps the header and composer: nothing tells the reader the work moved, nothing names the files the work left behind, and `@<name>` does nothing. The skill row does not exist yet (Epic 3), so only the rest of the handoff is built here.

**Approach:** A handoff is `session.open(to)` on a window whose transcript already has turns and whose last-opened persona is someone else. Main then writes one harness-authored `sysline` record, `handed off · <from> → <to> · picking up from <files>`, into the same transcript and returns it on the open's reply. The window renders it as a centred mono line with a rule either side. `@<name>` at the start of a composer message is the text path to the same activation. Focus stays where the user put it.

## Boundaries & Constraints

**Always:**
- No change to the 14 events, the 7 commands or their args. `session.open(agentId)` keeps its declaration; only its reply gains an optional `handoff` record. The renderer calls `session.open` on every tile activation (idempotent in main for a live agent), so a switch back to a live persona is seen by main.
- Main holds the window's last-opened persona in memory only (reset by `conversation.end` and by `conversation:get`, so a reload gives no sysline rather than a wrong `from`). A sysline is written only when: the open succeeded, the transcript has at least one entry, and the last-opened persona is a different agent. Re-activating the current tile, a first open, an empty transcript and a failed open write nothing.
- Names `from` and `to` are the roster display names from main's own install model; an id absent from it refuses the open's handoff with no record (the open itself is unchanged). Keys stay `agentId`.
- Text is exactly `handed off · <from> → <to>`, plus ` · picking up from <files>` when the list is non-empty (files joined by `, `, project-relative POSIX paths, write order, each once). It never contains `context` or `continu`. It renders as React text.
- Written files: main keeps, per agent, an ordered de-duplicated list of the project-relative `file_path` of every closed main-thread `Write`/`Edit` tool block in that agent's sessions, excluding `.memlog.md` and paths outside the project. Reuse `route-frame`'s existing path decoding (`WRITE_FIELDS`, `projectRelative`) rather than a second parser; emit no `doc:*` event for chat turns. The list is memory only, cleared by `conversation.end`, and names the files of the persona handed off *from*.
- The sysline is a `{kind:'sysline', id, at, text}` record in the existing transcript (`TRANSCRIPT_VERSION` stays 1), persisted, re-emitted by `conversation:get` and hydrated like any record. It has no agent, portrait, name or timestamp, is never joined into a persona message, and renders in the harness mono register at `label` size, centred, a `line` rule either side, `faint` ink, its own margin (`.turn + .turn` does not reach it), tokens only, no motion.
- The previous persona's session is left running (sessions end on persona close or conversation end only). The handoff is announced once through the existing announcer using the sysline text; no new live region.
- Tile activation never moves focus: it stays on the clicked tile, which carries `aria-current`; the rebuilt header and composer do not take it. After an `@` handoff focus lands in the new persona's composer, and the roving tab stop and `aria-current` follow the new persona.
- `@<name>`: only at the very start of the trimmed message; `<name>` is the first whitespace-delimited token after `@`, matched case-insensitively against roster display names, and must match exactly one persona other than the current one. It never matches a skill, menu entry or `agentId`. The `@<name>` token is not echoed. Any text after it is sent to the new persona as the user's turn, after the handoff; with none, the message is a pure handoff and sends nothing.
- A nonresolving, ambiguous or self `@` token is ordinary text sent to the current persona unchanged: no refusal, hint, suggestion or error.

**Never:**
- No skill-name parsing or skill/menu/`menus` use in the composer, no `@` hint text (the composer hint stays `enter sends · shift+enter adds a line`), no autocomplete or popup, no key-event code outside the existing composer and team handlers.
- No claim that context continues, no persona-volunteered handoff, no "new thread" or "cleared" framing, no badge, count or highlight on the sysline, no confirm step.
- No new event, command or bridge method; no skill row or run code (Epic 3); no `.sort` in the written-files order; no persisted current persona or written-files list.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tile handoff | A has spoken and written `a.md`, `b.md`; tile B activated | B's session opens; transcript gains `handed off · A → B · picking up from a.md, b.md`; focus stays on B's tile, `aria-current` on it | none |
| No files | A spoke, wrote nothing; B activated | `handed off · A → B` | none |
| Empty transcript | no turns yet; B activated | session opens, no sysline | none |
| Same tile | current tile re-activated | nothing written, nothing announced | none |
| Back to live persona | A→B then A's tile | A's session reused; `handed off · B → A · picking up from <B's files>` | none |
| `@` handoff | `@bob` while with A | handoff as above; no `@bob` echo; focus in B's composer | none |
| `@` with text | `@bob write the brief` | handoff, then `write the brief` sent to B as the user's turn | none |
| Unresolved or ambiguous | `@zed`, or two personas named Sam | plain text sent to the current persona | none |
| Self or mid-text | `@A`, or `hi @bob` | plain text sent to the current persona | none |
| Open fails | B's spawn fails | no sysline, last-opened persona unchanged | existing open failure line |
| Reload / relaunch | sysline persisted | same line in place; next activation after reload writes none | none |
| End conversation | sysline, files recorded | transcript, last-opened persona and files cleared | none |
| Mid-turn handoff | A busy; B activated | sysline lands; A's later words open a new turn after it | none |

</intent-contract>

## Code Map

- `src/shared/conversation.ts:17-34` -- add `SyslineRecord` to `TranscriptRecord`; `session.open` reply type gets optional `handoff?: SyslineRecord` (types only; `commands.ts`/`events.ts` untouched).
- `src/main/fold/transcript.ts:45-51` -- `foldPersonaSaid` joins only on the last entry; add a pure `foldSysline` appender (same `nextId`).
- `src/main/projections/transcript.ts:28-41` -- `ProjectTranscript` gains `recordSysline(text, at)`; `clear()` already resets all.
- `src/main/sources/persistence/transcript-file.ts:67-84,99-106` -- extend `isRecord` to accept the new kind (an unknown kind empties the whole file today, `transcript-file.test.ts:118`).
- `src/main/fold/route-frame.ts:71,79,201` -- `WRITE_FIELDS`, `projectRelative`; path decoding is gated on `ctx.runId`, so chat turns see none. Add a pure fold (new `src/main/fold/written-paths.ts`) over the same frames/`blockHead` that yields closed Write/Edit paths; no `doc:*`.
- `src/main/session-bridge.ts:77-84,199-208,264-288,370-392` -- per-agent `Entry` maps, the `routeFrame` call site (feed the new fold, per agent), `session.open` handler (compute and attach `handoff`), `conversation:get` (reset last-opened) and the end handler (clear all three). Display names come from main's install model.
- `src/renderer/ui/chat/transcript-entry.ts:35` -- add `SyslineEntry` to `TranscriptEntry`.
- `src/renderer/ui/chat/conversation-state.ts:286-297,373-388` -- `hydrate` maps records `persona ? persona : user`; add the sysline branch and a pure `withHandoff(state, record)`.
- `src/renderer/ui/chat/use-conversation.ts:117-150,197-200,302-310` -- `ensureSession` early-returns for a live persona; activation must still call `openSession` and fold `handoff` from the reply (once, in order); `sendMessage` unchanged.
- `src/renderer/ui/chat/transcript.tsx:11,49-62` -- `Turns` is binary persona/user; add a `Sysline` branch (new `sysline.tsx`, plus its rule beside `turn.css`). `orderEntries` is a stable sort by `at`; keep it.
- `src/renderer/ui/chat/composer.tsx:52-73` -- add `focusOnMount`; no `@` code here. New pure `src/renderer/ui/chat/handoff-target.ts` parses the message against `AgentView.name` (`shared/install.ts:19-27`).
- `src/renderer/ui/app.tsx:130-144` -- the composer render-prop is where the target resolves; announce the sysline through the existing announcer; hold `currentId`.
- `src/renderer/ui/shell/shell.tsx:93-106` and `src/renderer/ui/team/team.tsx:67-70` -- `currentId` moves up to `App` as controlled state (keep `currentAgent(ordered, currentId)` and `<ChatHeader key={current.id}`); `Team.movedToId` must follow the controlled current so the tab stop and `aria-current` agree.
- `src/renderer/ui/team/persona-tile.tsx:52-61` -- unchanged (`aria-current`, no `.focus()`); do not add `.focus()` to activation.
- `src/renderer/styles/tokens.css` (`--mono`, `--fs-label`, `--faint`, `--line`, `--rule-width`, `--space-*`) -- no new literal sizes; DESIGN.md:330,715 give the sysline spec (margin `14px 2px 10px` has no exact token set; check `tests/tokens.test.ts` before adding one).
- Tests to extend: `transcript-file.test.ts`, transcript registry/fold tests, new `written-paths` test, `session-bridge.test.ts` (open, `conversation:get`, end, `:657` activation turn unrecorded), `conversation-state.test.ts`, `use-conversation.test.ts:141-176` ("activate opens once" must become "activation opens idempotently, one open in flight"), `composer.test.tsx:27-33` (hint unchanged), `team.test.tsx`, `persona-tile.test.tsx`, `shell.test.tsx`, `tests/persistence-contract.test.ts` (version 1, fold equivalence, writers), `tests/team-contract.test.ts:329-352,394`, `tests/negative-surface.test.ts` (`:147` key handlers, `:215` skills, `:566-660` text-ramp `ALLOWED` list needs the sysline `faint` rule with a reason), `tests/accessibility.test.ts` (one live region), `tests/contract.test.ts` and `tests/bridge-contract.test.ts` (counts unchanged).

## Tasks & Acceptance

**Execution:**
- `src/shared/conversation.ts`, `src/main/fold/transcript.ts`, `src/main/projections/transcript.ts`, `src/main/sources/persistence/transcript-file.ts` (+ tests) -- the sysline record, its append, persistence and load -- a persisted line survives reload and relaunch and no older record is lost.
- `src/main/fold/written-paths.ts`, `src/main/session-bridge.ts` (+ tests) -- per-agent written paths, last-opened persona, `handoff` on the open reply, resets on `conversation:get` and end -- every matrix row from tile handoff through end conversation.
- `src/renderer/ui/chat/{transcript-entry,conversation-state,use-conversation,transcript}.ts(x)`, `sysline.tsx`, sysline CSS (+ tests) -- hydrate, fold, render, activation always opens -- the line renders once, in place, centred, mono, unattributed.
- `src/renderer/ui/chat/{handoff-target,composer}.ts(x)`, `src/renderer/ui/app.tsx`, `src/renderer/ui/shell/shell.tsx`, `src/renderer/ui/team/team.tsx` (+ tests) -- the `@` parse, controlled current persona, focus, tab stop, announcement -- all `@` rows, focus on tile after a tile activation, in composer after `@`.
- Negative-surface, accessibility, team and persistence contract tests -- amend only where this story's own surfaces force it, and assert: no `context`/`continu` in the sysline text, no skill or `menus` reference in the parser, composer hint unchanged, one live region, sysline not styled as a persona.

**Acceptance Criteria:**
- Given a conversation with one persona, when another tile is activated, then that persona's session opens, the same transcript continues unbroken, and nothing reads as a restart, new thread or cleared history.
- Given a persona is switched by tile, then focus stays on the activated tile, which carries `aria-current`.
- Given `@<name>` typed in the composer, then it hands off to that persona, and it never names or invokes a skill.
- Given a handoff, then a sysline reads `handed off · <from> → <to> · picking up from <files>` with the files the previous persona wrote this conversation in write order, and never claims context continues.
- Given any sysline, then it renders in the mono register, centred with a rule either side, and is never styled as or attributed to a persona.
- Given a reload or relaunch, then every sysline is still in place and none is added by it.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 27 findings reported (verification-gap 3, blind 15, edge 8, intent-alignment 1 descriptive report) — high 0, medium 1, low 21, false 2, maybe-false 0, notes 3
- findings:
  - `[medium]` `patch` the real `agentNameFor` default is never exercised, so a broken install-model wiring would ship every handoff silently dead (verification-gap) — added a test in `session-bridge.test.ts` that registers the bridge with no `agentName` and a real `rememberInstall`; it fails with the default replaced by `() => undefined`
  - `[low]` `reject` `@name` switches the header before the open is known to succeed and the text is still sent (verification-gap other, blind, edge) — a tile click sets the current persona before its open the same way, a refused open shows the existing failure line, and `send` retries the open, so the text reaches a persona the user chose
  - `[low]` `reject` an open before the install snapshot has been asked for names nobody and advances the last persona (verification-gap other, blind, edge) — a handoff needs a prior turn, which needs tiles, which need the snapshot, so no window reaches it; the spec settles the unnamed-persona case as no sysline
  - `[low]` `reject` a Write/Edit whose tool call is later denied or fails is still named (blind, edge) — the spec says the closed tool block; naming from `tool_result` needs frames `readFrame` ignores, and a failed Edit names a file that exists; recorded under residual risks
  - `[low]` `reject` only Write and Edit are tracked, not MultiEdit, NotebookEdit or Bash (blind) — the spec names Write and Edit and the investigation recorded Bash writes as invisible
  - `[low]` `reject` a model-supplied path can carry ` · `, `→` or a newline, and the list is uncapped and spoken in full (blind, edge) — rendered as React text, no markup; a path like that is contrived and a cap adds a branch the story did not ask for
  - `[low]` `reject` a reload forgets the last persona and a first open after relaunch writes none (blind) — the spec records this as the chosen trade, a lost sysline over a wrong one, in Design Notes
  - `[low]` `reject` `lastOpened` follows reply order, so quick A, B, C switching can end on B (blind, edge) — needs overlapping spawns for different personas; a sequence number adds state beyond the story
  - `[low]` `reject` `session.open` has a second reply type, so `commands.ts` misdescribes it (blind) — the spec forbids editing the contract and holds the field additive in `shared/conversation.ts`
  - `[low]` `reject` an older build empties a transcript holding a sysline (blind) — the version is pinned at 1 by the spec and the persistence contract; no downgrade path exists
  - `[low]` `reject` names with whitespace can never match `@<name>` and the feature is undiscoverable (blind) — the spec fixes the token as the first whitespace-delimited word and the composer hint unchanged; roster names are single words
  - `[false]` `reject` `recordSysline` reads its record back with an unchecked cast (blind) — `changed` always replaces the state with the folded one, so the last entry is the record just appended
  - `[low]` `reject` the shell holds `ownId` and the controlled `currentId`, which can diverge (blind) — `ownId` is read only when no `currentId` prop is passed; the controlled path never reads it
  - `[low]` `reject` the announcement is the raw sysline text, so a screen reader voices the arrow and dot (blind) — the spec says the sysline text is announced and `conversation · ended` is announced the same way
  - `[low]` `reject` a handoff mid-turn names the files written so far (blind) — inherent to a snapshot, and later writes are named by the next handoff from that persona
  - `[low]` `reject` several guard tests depend on source layout and magic counts (blind) — the same style as the repo's other contract tests, as 2.7 and 2.8 recorded
  - `[false]` `reject` the activate promise never settles if the window disconnects before the snapshot (edge) — the continuation belongs to an unmounted window and nothing awaits it
  - `[low]` `reject` a queued message typed before the handoff renders above the sysline because its renderer clock is earlier than main's, while a reload orders it after (edge) — the order differs only for a message queued to a busy persona before a switch, and fixing it changes how `orderEntries` places entries
  - `[low]` `reject` repeated A, B, A, B handoffs re-list files already announced (edge) — the spec names the files the persona wrote during this conversation, cumulative by design
  - `[note]` `reject` the commit and the sprint status are not in the diff (intent-alignment) — done at finalisation
  - `[note]` `reject` no test spans renderer, preload, IPC and main, or a real CLI frame, or a rendered browser (intent-alignment) — recorded in `deferred`
  - `[note]` `reject` `install-model.ts` is a new cross-bridge module (intent-alignment) — the spec requires names from main's own install model and the two bridges share no other seam

## Design Notes

"Rebuilds the skill row" is vacuous here: no skill row exists until Epic 3, and the header and composer, both keyed by agent id, are the whole rebuild. The handoff rides `session.open` because the contract is declared once (2.2) and a new bridge method would be an eighth command outside it; the optional reply field is additive. `from` is main's last-opened persona, not the displayed tile: a reload resets it, which loses one legitimate sysline instead of writing a wrong one. Relaunch also loses the written-files list, so a handoff right after relaunch names no files. `A` stays running after a handoff, as the epic context says sessions are reclaimed only on close or end.

```
handed off · Mary → John · picking up from _bmad/planning-artifacts/prd.md, _bmad/planning-artifacts/epics.md
```

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary:** Opening another persona over a transcript that has turns now writes one harness-authored line, `handed off · <from> → <to> · picking up from <files>`, into the same transcript. It rides the `session.open` reply, is persisted and survives reload and relaunch, and renders centred in mono with a rule either side, never as a persona. The files are the ones the previous persona wrote in chat turns, in write order. `@<name>` at the start of a composer message makes the same activation, sends any text after the name to the new persona, and moves focus to its composer; a tile activation leaves focus on the tile, which carries `aria-current`. The handoff is announced once through the existing announcer.

**Files changed:**
- `src/shared/conversation.ts`, `src/main/fold/transcript.ts`, `src/main/projections/transcript.ts`, `src/main/sources/persistence/transcript-file.ts` -- the `sysline` record, its append, persistence and load.
- `src/main/fold/written-paths.ts`, `src/main/fold/route-frame.ts` -- per-session closed Write/Edit paths, reusing the route fold's decoding, with no `doc:*` event.
- `src/main/install-model.ts`, `src/main/install-bridge.ts`, `src/main/session-bridge.ts` -- roster names from main's own model, the last-opened persona and written files, and `handoff` on the open reply.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- `openSession` resolves `{ sessionId, handoff? }`; still thirteen methods.
- `src/renderer/ui/chat/*` -- `SyslineEntry`, `withHandoff`, an activation that always asks main, `sysline.tsx` and CSS, `handoff-target.ts`, `Composer.focusOnMount`.
- `src/renderer/ui/app.tsx`, `shell/shell.tsx`, `team/team.tsx`, `design/tokens.css` -- the window holds the current persona, the tab stop follows it, the announcement, and `--sysline-margin`.
- Tests: fold, registry, file, written paths, install model, bridge, conversation state and hook, parser, sysline, team, App, and the bridge, persistence, negative-surface, team and tokens contracts.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2-9 marked done.

**Review:** 27 findings. Patches applied: 1 (medium, a test for the real name lookup). Deferred: 1 (see frontmatter). Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (one medium patched, no high).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (2058 tests in 102 files, plus 55 in 3) and `npm run build` exit 0 after the patch. The matrix audit found a passing test for every row.

**Residual risks:** No real Electron or CLI run. A file whose Write was denied or whose Edit failed is still named. A reload, a relaunch or quick A, B, C switching can lose or misattribute a sysline. A file name containing "context" appears verbatim in the line. `@<name>` cannot address a name with a space.

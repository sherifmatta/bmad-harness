---
status: blocked
---

# BMad Build Auto Result: Story 8.2, Select a persona and get an empty chat

Status: blocked
Blocking condition: intent gap (what a skill button pressed on an empty persona chat does about the persona's activation turn). No code changed and no spec file was written.

**Resolved 2026-10-18 by the owner (Sherif): ship 8.2 without the skill-button criterion and move it to Story 8.3.** `epics.md` amended: Story 8.2 now draws the skill row of an empty chat disabled and starts nothing; the criterion moved to Story 8.3 with the three readings below as an open decision for its spec (reading 2 is ruled out by FR21). 8.2 was re-run.

## What the story needs

Story 8.2 has two parts. The first is clear and buildable: selecting a tile (click, `Enter`, `Space`) turns the chat to that persona and calls nothing in main. Today `onActivate` runs `conversation.activate` to `ensureSession(agentId, true)` to `bridge.openSession`, and main writes `/<agentId>` as the first stdin turn on spawn (`src/main/sources/session/session-process.ts:383`). The second part is the acceptance criterion this run cannot place:

> **Given** the skill row of an empty chat **When** the user presses a skill button **Then** that persona's seat starts and the skill is dispatched as that persona's first action, and no greeting is waited on, spoken or shown before it (decision 7 below). (`epics.md`, Story 8.2)

"Decision 7 below" does not exist in the story. Its "Decisions to confirm" block holds two decisions, and the second only settles that the button starts the seat, not how.

## Evidence gathered

- Every session spawn writes the activation turn first. `session-process.ts:383` writes `options.firstTurn ?? activationTurn(options.agentId ?? '')`. A persona session has no `firstTurn`, so `/<agentId>` goes first and runs a greeting turn. Only skill-first sessions pass a `firstTurn`.
- A fresh session starts `busy` (`src/main/fold/turn-end.ts:34`). `menu.dispatch` for a busy session is refused as `session/busy`, and the renderer's `runSkill` returns early when there is no session (`src/renderer/ui/chat/use-conversation.ts:608-613`). So "the skill is the first action" cannot be met by dispatching straight after `session.open` with the current spawn.
- The architecture spine says the opposite of "no greeting". AD-18, amended by AD-30 (`ARCHITECTURE-SPINE.md` line 199), says a seat is opened "by the first skill button pressed in that persona's chat" and that "`/bmad-agent-<x>` is still the first turn on stdin". Its Open Items (line 441) ask Story 8.3's spec to confirm main can tell the activation turn "including when a session is spawned by a skill button", which assumes an activation turn does run on that path.
- `reviews/review-ad30-adversarial.md` (lines 26-27) raised this exact conflict: "Story 8.2's 'skill button as first action, no greeting waited on' contradicts AD-11 serialisation". Its tightening was "the greeting is a turn the first action waits for". The epic text was not changed to follow it.
- `EXPERIENCE.md` (*The empty chat*, "A skill button pressed") repeats "no greeting is waited on, spoken or shown before it". Story 8.3, which says it "states the rule for an empty chat", states nothing for a skill button. FR21 and CAP-3 say a persona's words are never hidden.

## Readings that give different outcomes

1. **Skip the activation.** Spawn the persona's session with the skill's invocation as its first stdin turn (the `firstTurn` path skill-first sessions use) and write no `/<agentId>`. Meets the story text exactly: no greeting, no wait. But the session is then a persona's seat that never loaded the persona, so the user's next chat message in it talks to an un-activated model. It contradicts AD-30's "`/bmad-agent-<x>` is still the first turn", and it needs a main-side change to `session.open` plus how a `prompt`-type menu entry runs as a first turn.
2. **Activate, then dispatch, greeting hidden.** Spawn as today, and when the activation turn ends send `menu.dispatch`. The persona is loaded and the serialised turns hold, but the greeting is either drawn (contradicting "no greeting ... shown") or hidden (contradicting FR21 "never hidden", which 8.3 also forbids).
3. **Activate, then dispatch, greeting shown.** As 2, with the activation reply drawn ahead of the run card. Honest, and the same shape as the first-message path in 8.3, but it breaks the criterion's last clause and the UX doc's "no greeting is waited on, spoken or shown".

Nothing in the story, the epic context, the architecture or the UX documents selects between them: each is defended by one document and contradicted by another.

## What would settle it

The owner (or a planning pass) states which of the three the skill-button path takes, and amends the losing documents. Likely edits: Story 8.2's criterion and the dangling "decision 7", `EXPERIENCE.md` (*The empty chat*), and AD-18 or AD-30 if reading 1 wins.

## Scope note for a re-run

Everything else in 8.2 is independent of this gap and was investigated: selecting a tile stops calling `conversation.activate` in `src/renderer/ui/app.tsx` (`onActivate`), and `@name` and notification activation keep their own path (Story 8.6). The empty persona chat shows the skill row when `conversation.sessionOf(agent.id)` is undefined. `SkillRow` is drawn only with a session at `app.tsx:478`, so that condition must change, and the thread introduction's hint line must be reread. The re-run can build all of it once the skill-button reading is settled, or the owner may choose to ship 8.2 with the skill-button criterion moved to Story 8.3.

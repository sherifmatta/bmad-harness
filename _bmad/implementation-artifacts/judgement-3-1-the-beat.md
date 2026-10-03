---
title: 'Judgement 3.1: does the beat land?'
story: '3.1 Press a button and watch a document write itself'
created: '2026-10-03'
status: 'judged-by-claude-pending-sherif-confirmation'
judge: 'Claude (live run); Sherif to confirm'
evidence: 'tests/run-replay.test.ts (REPLAY_TIMELINE=1 prints the timeline below)'
---

# Judgement 3.1: does the beat land?

Epic 3 says 3.1 is the thin slice of the beat, and that a recorded judgement on whether it lands comes before 3.2 onward. The builder cannot make that judgement. This file records what the replay measured, what the real-skill run still has to show, and an empty verdict for Sherif.

## 1. Replay through the real main pipeline

`fixtures/runs/fast-path-sonnet.jsonl` was fed through the real `registerSessionBridge`, the session registry, `session-run` and the folds. Spawn, the clock and the timers were fakes. The recorded drafting turn (the send after line 1639, "Assume. … draft the full PRD now …") went in as a menu dispatch: a prompt entry with code `DP`. Everything before it went in as it was recorded: the activation, and the brain dump as a chat turn.

**Time.** Frames that carry a `timestamp` (`assistant`, `user`) give wall-clock time. Every frame between two of them is placed evenly between. Stream events carry no time of their own, so delta spacing inside one block is an approximation.

**Memlog.** The recording holds no memlog file; it lived in a scratch project. The replay rebuilds it from the `memlog.py init/append` commands the main thread ran through Bash. Each command's lines are applied when its `tool_result` comes back, and the change is reported to `observeArtifact` the way the rail's watcher would report it.

### Timeline (seconds after the dispatch, recorded pace)

| Moment | t | Frame |
| --- | --- | --- |
| `run:started` (card born, feed mounted with no rows) | 0.0 s | 1639 |
| First `run:note` | 704.6 s | 2112 |
| First `doc:prose` (the big `Write` opens) | 708.4 s | 2168 |
| Big `Write` committed (`doc:committed`, 17 sections) | 886.6 s | 6075 |
| `run:finished` → persona `work` to `live` | 2082.1 s | 13045 |

Events main sent after the dispatch, at the recorded pace: `run:started` 1, `run:note` 9, `persona:said` 383, `doc:prose` 1,694, `doc:committed` 33 (1 `Write` + 32 `Edit`s, all `ok`), `persona:state` 2, `run:finished` 1, `session:awaiting-turn` 1.

### Coalescing

| Pace | Big `Write` deltas | `doc:prose` for it | All `doc:prose` in the run |
| --- | --- | --- | --- |
| Full rate (the AC's case) | 3,947 | 1 | 33 (one per call) |
| Recorded pace (100 ms flush) | 3,947 | 1,302 | 1,694 |

At the recorded pace the `Write` streamed for about 178 s at about 22 deltas a second. A 100 ms window joins two or three deltas into each piece. The renderer then paints at most once per animation frame (`run-card.dom.test.tsx`: 3,947 pieces, one DOM write per frame, one React render in total). Text is byte-identical in both cases.

### What the card reads

- **0 to 704 s (11 min 45 s):** a head reading `writing` with a ticking elapsed counter, and an empty body (feed mounted, no rows). The persona's own words (`persona:said`) appear as turns below the card in this window. The card carries none of them.
- **704 s on:** 4 notes land (`assumption`, then 3 `decision`s).
- **708 to 887 s:** the prose streams under the notes with the caret at its tail. At 887 s the write commits.
- **887 to 2,082 s:** 32 revision `Edit`s follow. Each one replaces the visible buffer with its own `new_string` (known limit 6), and 5 more notes land.
- **2,082 s:** `saved · just now · 17 sections`, the caret is removed, and the persona dot moves `work` to `live`.

### Reload mid-run

A `conversation:get` taken just after the big write committed returns the card with its notes, the full 55,053-character prose, its sections and `running` (`tests/run-replay.test.ts`, last case).

## 2. Real-skill run: done 2026-10-03

**Setup.** The built app (`npx electron . <subject> --remote-debugging-port=9222`) on a throwaway project copied from this repo's `.claude/skills` and `_bmad`, with two extra John menu entries in `_bmad/custom/bmad-agent-pm.toml`: `SMK` (a short `Write`, plus a write to `/tmp`) and `DPRD` (a `prompt` entry that invokes `bmad-prd` with the recorded Tidewatch brain dump and "assume, no questions"). A real `claude` 2.1.274 at the user's default model (`opus[1m]`). The page was driven and read over the DevTools protocol; the card was sampled every 20 s.

**Smoke (`SMK`, 16 s).** The whole beat in miniature, and it worked: the card was born on press, the three-section note streamed in with the caret at its tail, the head ended `saved · just now · 3 sections`, the caret was removed, the button row re-enabled, and John's dot went `working` to `live`. The write to `/tmp/outside-project.txt` was denied, no file exists, and John relayed it in his own voice ("blocked: /tmp/outside-project.txt is outside the project ... I didn't attempt a workaround"). The permission deferral is met.

**Real skill (`DPRD`, 57 min 39 s).** Opus wrote documents through `Write` and `Edit` here (not Bash heredocs as the recording suggested), so prose did stream.

| Elapsed | What the card showed |
| --- | --- |
| 0 to 1 min 40 s | head `writing`, ticking elapsed, empty body (and an empty path) |
| 1 min 40 s | 9 notes land at once (one `memlog.py` batch) and prose starts: `addendum.md`, not the PRD |
| 8 min 42 s | the PRD `Write` begins: 123 chars, then about 4,000 chars per 20 s up to 40 KB |
| 16 min 26 s | prose jumps to `inputs/brain-dump.md` (50 KB), then back to `addendum.md` |
| 18 min to 45 min | head path flips between `addendum.md` and `prd.md` with each write or `Edit`; notes trickle in 1 per 1 to 5 min, 24 to 34 |
| 45 min to 57 min | body is a 1.7 KB then 314-character `Edit` fragment; 38 notes |
| 57 min 39 s | `saved · just now · 25 sections`, caret removed, `aria-busy` cleared; persona tile reads `file changed`, not `live` |

On disk: `prd.md` is 154 KB with 19 level-2 headings; `addendum.md`, `inputs/brain-dump.md`, `prd-v1-pre-review.md`, `reconcile-brain-dump.md` and four `review-*.md` files were written too.

## 3. Known limits carried forward

1. **The empty body is met only once the first note lands.** In this recording that was 11 min 45 s after the dispatch, while research subagents ran. 3.4 owns dead-air content.
2. **Opus writes through Bash heredocs.** Such a run shows notes only (`fast-path-opus`, `coaching-path`).
3. **Any in-project `Write`/`Edit` becomes prose,** source files included.
4. **A `projectRoot` spelled unlike the CLI's path drops writes** (`/tmp` versus `/private/tmp`).
5. **Notes are attributed to no card under concurrent runs** in one window.
6. **A revision `Edit` replaces the visible buffer** with its own new text. Patching the buffer, `revising · §N` and the section plan are 3.3. After this run the body shows the last edit's text, not the whole document.
7. **At the recorded pace main still sends about 10 prose events a second per run.** That is a bound, not a coalesce to a handful; the renderer's per-frame paint is what keeps the card cheap.

## 3a. What the live run added

8. **The card is one box for a run that writes many files.** Head path and body follow whichever write is last: `addendum.md`, then `prd.md`, then `brain-dump.md`, then back. The user never sees "the document being written" as one thing, and the PRD (the point of the run) was on the card for under 8 minutes in 57.
9. **`N sections` is wrong for a multi-file run.** The head named `prd.md` and said 25 sections; `prd.md` has 19. The count is the union of `##` headings across every file the run committed (addendum, brain dump, reviews).
10. **The dot did not reach `live`.** After the run the tile read `file changed` (`note`): the rail saw the persona's own file change after the run ended, and `note` outranks `live`. Epic 2's deferral (does a persona's own write raise `note`) bites exactly here. The story's `work` to `live` held in the smoke run and not in the real one.
11. **The card is out of view while the thing it shows happens.** John narrates in chat the whole time; those turns land below the card, so someone following the conversation is looking at his words and the card is scrolled away above. The empty-first-100-seconds and the long middle are not seen unless the user scrolls up.
12. **Dead air was shorter than the replay feared** (1 min 40 s to the first note, not 11 min 45 s), but nothing on the card marks the long middle: 20 minutes with 24 to 34 notes arriving 1 to 5 minutes apart, and a body frozen on an old `addendum.md` buffer.
13. **Revision `Edit`s ended the card on a fragment.** Known limit 6, now seen: the final body was 314 characters of the last edit, under a head that said `saved`.
14. **Live pace and performance were fine.** The card kept up with about 250 characters per second of prose for minutes at a time, the elapsed counter ticked, and the app stayed responsive for 57 minutes. A frame-time trace was not taken.

## 4. Verdict

- [ ] The beat lands. 3.2 onward may start.
- [x] The beat does not land yet. The mechanism is proven; the claim is not.

**Claude's judgement (2026-10-03, from the live run above; Sherif to confirm or overrule).** A button press does produce a card, prose does stream from the write, notes do arrive from the memlog, and the end state is real. For a one-document run (the smoke) the beat lands in full. For the run this product exists for, it does not: the user cannot follow *the document* being authored, because the card follows whatever file was last touched, ends on an edit fragment, counts sections across files, can be off-screen, and does not leave the persona at `live`.

What must change before 3.2 onward, in order of how much of the beat each carries:
1. Give the card one subject. Hold a buffer per path and show the run's primary document (for example the largest or latest `Write` to the planning artifact folder), with other files named but not taking over the body. Revisions patch that buffer (this is 3.3's `Edit` rule, and it should move up).
2. Count sections from the card's own document, not the union across files (the head already names one path).
3. Settle `note` against `live` after a run: the persona's own write must not outrank the finished state.
4. Decide where the card lives while the persona talks: the narration and the card compete, and the card loses.
5. Keep the dead-air content (3.4) as planned; the live gap was shorter than feared but the 20-minute middle is the real risk.

Judged by: Claude, on 2026-10-03, from a live run (smoke 16 s, `bmad-prd` 57 min 39 s). Awaiting Sherif.

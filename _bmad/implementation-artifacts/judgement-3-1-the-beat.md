---
title: 'Judgement 3.1: does the beat land?'
story: '3.1 Press a button and watch a document write itself'
created: '2026-10-03'
status: 'pending-judgement'
judge: 'Sherif'
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

## 2. Real-skill run: pending

Not done by the builder. To do: launch the app on a project with the BMad install (`npm run dev -- <project>`), open John, press a skill button, and watch it through to the end. Record:

- the time to the first note and to the first prose;
- how the dead-air window reads with the head alone (see known limit 1);
- `saved · just now · N sections` and the persona dot reading `live`;
- the permission deferral: that a write outside the project is denied, and that John relays it in his own words. In main, an out-of-project path yields no prose and no commit (unit-tested). John's relay is the CLI's own behaviour and can only be seen live.

## 3. Known limits carried forward

1. **The empty body is met only once the first note lands.** In this recording that was 11 min 45 s after the dispatch, while research subagents ran. 3.4 owns dead-air content.
2. **Opus writes through Bash heredocs.** Such a run shows notes only (`fast-path-opus`, `coaching-path`).
3. **Any in-project `Write`/`Edit` becomes prose,** source files included.
4. **A `projectRoot` spelled unlike the CLI's path drops writes** (`/tmp` versus `/private/tmp`).
5. **Notes are attributed to no card under concurrent runs** in one window.
6. **A revision `Edit` replaces the visible buffer** with its own new text. Patching the buffer, `revising · §N` and the section plan are 3.3. After this run the body shows the last edit's text, not the whole document.
7. **At the recorded pace main still sends about 10 prose events a second per run.** That is a bound, not a coalesce to a handful; the renderer's per-frame paint is what keeps the card cheap.

## 4. Verdict

- [ ] The beat lands. 3.2 onward may start.
- [ ] The beat does not land. What must change first:

Judged by: ____ on ____

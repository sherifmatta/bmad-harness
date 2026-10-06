---
title: 'Told once, quietly, when you are elsewhere'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_revision: '2d56d4bfcff736a7677ac2cec8961af5f1b7b11b'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      The posted banner object is not retained after `told` returns, and Electron may garbage-collect a `Notification` before it is clicked, which would stop its `click` handler from ever firing.
    evidence: |-
      Unverified (maybe-false): it was recalled, not checked against Electron 44, and every test posts through a fake. If true, FR94 (activation raises the window and scrolls to the card) would not work for a banner left unclicked for a while. Holding the object needs a set or map in the notifier, which the Story 3.10 guard forbids as state held across events, so the fix is a decision about that guard, not a patch. The manual check in Verification settles it: run a skill, switch away, wait a minute or two after the banner, click it.
    location: >-
      src/main/windows/run-notification.ts createRunNotifier
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A run takes twelve minutes and the user is deliberately in another window. Today nothing reports that it ended: the card and the rail say so, but only to someone looking at them. FR93 and FR94 ask for one silent native macOS notification per terminal event when the window is unfocused, and for its activation to bring the user back to that run's card and do nothing else.

**Approach:** One new module in `src/main/windows/` (where every macOS call lives) is handed each run event the window is told, with the run's card as it then stands, through one optional hook at the registry's single emit point. On `run:finished`, `run:stopped` or `run:failed` with that session's project window unfocused, it posts one `Notification` whose body states `<Persona> · <file> · <outcome> · <N sections>` and is silent. Its click raises the window and pushes the run's id on one new channel, `run:revealed`; the renderer answers by scrolling that run's card into view through the ref the card already holds, with the one `scrollIntoView` call the renderer has. Nothing is asked of the OS, queued, badged or sounded, and the absence is pinned by guards.

## Boundaries & Constraints

**Always:** Every Electron `Notification` and `BrowserWindow` call for this lives in `src/main/windows/run-notification.ts`; nothing else in `src` names the notification API. "The window" is the session's own project window (`BrowserWindow.fromWebContents(sender)`), read with `isFocused()` at the moment the terminal event is told; a document window is elsewhere. One `Notification` per terminal event, constructed with `silent: true` and shown once; concurrent sessions each get their own. The copy is one `·`-separated line of facts in the harness register: the persona's roster name (else its agent id; omitted with no agent id), the subject document's file name (the last POSIX segment of `subjectOf(card.documents).path`), the outcome word (`card.status`, which is the event's own word) and the subject's confirmed section count through the shared `sectionCount` (`1 section`, `15 sections`, `0 sections`); file and count are omitted together when the run has no subject. The outcome and count are read from the card main holds after the event folded, never recomputed. Activation: a destroyed window means nothing; otherwise `restore()` if minimized, `show()`, `focus()`, then the run id on `run:revealed` to that window alone. The renderer holds the reveal request as it holds the focus request (`focusRunId`): the card named spends it on scroll; a request for a run the conversation's entries do not hold is dropped on arrival. The scroll is instant (`block: 'start'`, no `behavior`), moves no focus, switches no persona, opens nothing and sends no command. `Notification.isSupported()` false means nothing is constructed. A `show()` that throws writes one diagnostic line and nothing else.

**Never:** No Dock badge, `app.dock`, `setBadgeCount`, sound, `sound` option, `flashFrame`, `requestUserAttention`, `app.focus`, or any `app.` call in the module. No permission API: no `requestPermission`, `systemPreferences`, `askFor*`; macOS asks once on its own and the harness never asks again. No timer, queue, debounce, digest or batch in the module, and nothing held across a quit. No notification for a non-terminal event, and none when the window is focused. No new command or event: the fifteen events and seven commands stay; the counts become twenty-two channels and seventeen bridge methods. No `notif*`, `alert`, `sound`, `badge`, `dock` or `attention` word in `src/shared` or `src/preload` (the existing guard). No guidance in the copy: never "ready", "review", "next", "open", "click", "see", "check", "please", "should", "your". No `data-*` attribute, `querySelector` or `getElementById` in the renderer for the target: the card's own ref. No second `scrollIntoView`, `scrollTo`, `scrollTop` or `scrollBy` anywhere in the renderer but the reveal hook. No change to the card's markup, the rail, the fold, the projections or the live region. No `title=` attribute or tooltip in the renderer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Finished, elsewhere | `run:finished` told; window `isFocused()` false; roster name `John`; subject `…/prd.md` with 15 confirmed sections | one `Notification({ body: 'John · prd.md · finished · 15 sections', silent: true })`, `show()` once | No error expected |
| Stopped mid-write | `run:stopped` after a `Write` that streamed but never confirmed (`interrupt-inband`) | `John · prd.md · stopped · 0 sections` | No error expected |
| Failed | `run:failed` (budget cap, or `run/session-ended`) | `John · <file> · failed · N sections`, or `John · failed` when the run wrote nothing | No error expected |
| Focused | any terminal event; `isFocused()` true | nothing constructed, nothing shown | No error expected |
| Not terminal | `run:started`, `run:note`, `doc:prose`, `doc:committed`, `persona:said`, `persona:state`, `session:closed`, `rail:changed` | nothing | No error expected |
| No roster name | the agent is not in the install | the agent id stands in the first slot | No error expected |
| No agent id | a run of a session with no persona | `prd.md · finished · 15 sections` | No error expected |
| One section | subject with one confirmed heading | `… · 1 section` | No error expected |
| Two sessions end | pm and analyst runs end while unfocused | two notifications, each its own line, none coalesced | No error expected |
| Activated, window live | click; window unfocused, minimized or hidden | `restore()` when minimized, `show()`, `focus()`; `run:revealed` with the run id to that window; its card scrolled into view once; persona, documents and sessions unchanged | No error expected |
| Activated, window gone | click after the project window closed | nothing: no window opened, nothing sent | No error expected |
| Unsupported | `Notification.isSupported()` false | nothing constructed; no permission asked, then or ever | No error expected |
| `show()` throws | the OS refuses | one diagnostic line (`run/completion · <message>`); nothing to the window; no retry | Named in the line, swallowed |
| Reveal for an unknown run | `run:revealed` for an id no entry holds (conversation ended) | dropped; nothing scrolls, nothing is held | No error expected |
| Reveal, card present | the terminal card is in the thread | `scrollIntoView({ block: 'start' })` once on the card's root; the request is spent; focus stays where it was | No error expected |

</intent-contract>

## Code Map

- `src/main/session-run.ts:91-100,103-112,122-136,204-230` -- `RunKit` (`now`, `schedule`, `emit`, `recordSaid`, `readText`, `recordRun`), `createRunKit`, `tell()` (applies each event to `service.runs`, reads the card at `:129`, tells the annotations, records, emits at `:133`), `endRun()` (the only place the three terminal events are raised, once). Add `told?: (sender: Sender, event: ContractEvent, card: RunCardSnapshot | undefined) => void` to `RunKit` and call `kit.told?.(sender, event, card)` right after `kit.emit` in `tell()`; nothing else changes.
- `src/main/session-registry.ts:103-120,291-316` -- `SessionRegistryDeps`; `createSessionRegistry` builds the kit at `:315` (`createRunKit({ now, schedule, emit, transcripts, readText })`). Add `told?` to the deps and pass it into the kit.
- `src/main/session-bridge.ts:67-113,421-450` -- `SessionBridgeDeps` and `registerSessionBridge`, which builds the registry at `:430-441`. Add `told?` and pass it through, as `quietMs`/`schedule` are at `:439-440`.
- `src/main/index.ts:70-82` -- the composition root wires the rail's watcher into the session side. Wire `registerSessionBridge({ transcripts, told: createRunNotifier({ agentName: agentNameFor, writeDiagnostic: defaultWriteDiagnostic }).told })`. `src/main/index.test.ts:21-25,67,106-116` mocks `./session-bridge` and asserts `bridgeDeps` equals `{ transcripts: registry }`: amend to `{ transcripts: registry, told: expect.any(Function) }`. Its electron mock has no `Notification`: the notifier must touch Electron only inside `told` and the click handler, never at construction.
- `src/main/bridge-kit.ts:14-19,27-31,67` -- `Sender` (`id`, `send`, `isDestroyed`, `once`), `sendTo` (sends only to a live sender), `defaultWriteDiagnostic`. `src/main/install-bridge.ts:44-51` -- the precedent for `BrowserWindow.fromWebContents(sender as unknown as WebContents)` and a window `focus` listener.
- `src/main/install-model.ts:25-28` -- `agentNameFor(webContentsId, agentId)`: the roster name or `undefined`.
- `src/main/fold/run-card.ts:46-52` -- `subjectOf(documents)`: the card's subject (greatest `written`, earlier on a tie, `undefined` until a `Write` streamed). `src/shared/conversation.ts:99-134` -- `RunCardDocument` (`path`, `sections` of the last confirmed write) and `RunCardSnapshot` (`agentId?`, `status`, `documents`).
- `src/main/windows/run-notification.ts` (new) -- `completionLine({ name, path, outcome, sections })` pure, and `createRunNotifier(deps)` returning `{ told }`. Deps, all injectable: `agentName`, `writeDiagnostic`, `windowOf(sender)` (default `BrowserWindow.fromWebContents`), `post(options)` (default `new Notification(options)`), `isSupported` (default `Notification.isSupported`). Only `src/main/windows/doc-window.ts:58` and `main-window.ts` touch `BrowserWindow` today; `macos-escapes.ts:35-45` shows the module's register for a refused OS call (`writeDiagnostic('doc/reveal · …')`). Electron 44 typings: `node_modules/electron/electron.d.ts:10386` (`class Notification`: `static isSupported()`, `show()`, `on('click', …)` at `:10458`, constructor at `:10580`), `:22793` (`NotificationConstructorOptions`: `title?`, `body?`, `silent?`, `sound?`), `BrowserWindow.fromWebContents` `:5451`, `isFocused` `:5741`, `isMinimized` `:5800`, `restore` `:5959`, `focus` `:5527`.
- `src/shared/section-progress.ts:82-94` -- `STOPPED`, `CONTENTION`, `TerminalWord`; the shared words both processes read. Move `sectionCount` here from `src/renderer/ui/chat/run-status.ts:20-23` with its parameter named `n` (the 3.6 guard at `tests/negative-surface.test.ts:1707-1715` sweeps this file's string and template literals for `\bcount\b`, `\bof\b`, `\btotal\b`); `run-status.ts:91,116` import it; its test moves from `run-status.test.ts:71` to `section-progress.test.ts`.
- `src/shared/channels.ts:21-28,42` -- the document channels and `session:event`; `doc:closed` is the precedent for a main-to-shell push outside the session events. Add `RUN_REVEALED_CHANNEL = 'run:revealed'`. `tests/channels-contract.test.ts:34-37` pins twenty-one and that each literal is spelled once outside `channels.ts`: make it twenty-two.
- `src/preload/harness-api.d.ts:8-10,33-37,89-93`, `src/preload/index.ts:1-55,110-117,200-208` -- the sixteen methods; `onDocClosed` and `onSessionEvent` are the push-subscription shape (wrapper drops the IPC event, returns the unsubscribe). Add `onRunRevealed(listener: (runId: RunId) => void): () => void` beside `onSessionEvent`, importing and re-exporting the channel; "sixteen" becomes "seventeen" in both comments. Pins to amend: `tests/bridge-contract.test.ts:137-161` (the ordered names; add a subscriber test shaped like `:319-330`), `tests/preflight-contract.test.ts:150-171` (the sorted names).
- `src/main/doc-bridge.ts:125-131` -- `entry.parent.webContents.send(DOC_CLOSED_CHANNEL, …)` after `focus()`: the one push-after-raise precedent.
- `src/renderer/ui/outputs/use-doc-open.ts:29-37,45-48` -- `connectDocClosed` guards `typeof bridge?.onDocClosed === 'function'` and returns the unsubscribe; `useDocOpen` reads `window.harness` in the effect, never while rendering. The reveal hook follows this exactly.
- `src/renderer/ui/chat/use-reveal.ts` (new, `.ts`) -- `connectRunRevealed(bridge, onRevealed)` and `useReveal(ref, reveal, onRevealed)`: a layout effect that, when `reveal` is true, calls `ref.current?.scrollIntoView({ block: 'start' })` once and then `onRevealed?.()`. The renderer's only scroll call.
- `src/renderer/ui/chat/run-card.tsx:79-89,109` -- `container` ref and the `focusOnMount`/`onFocused` layout effect, and the `<section className="run-card" … ref={container}>` root. Add `reveal?: boolean` and `onRevealed?: () => void`, passed to `useReveal(container, reveal === true, onRevealed)`. `run-card-line.tsx` is untouched: a terminal card is never a line (`run-status.ts:161-163`).
- `src/renderer/ui/chat/transcript.tsx:74-87,143-153` -- `RunCollapse` (`focusRunId`, `onFocused`) and the `RunCard` draw in `Turns`. Add `revealRunId?` and `onRevealed?` to `RunCollapse`; pass `reveal={collapse?.revealRunId === entry.runId}` and `onRevealed` to the card.
- `src/renderer/ui/app.tsx:75-84,189-203,279` -- `focusRunId`/`expandRun`/`focusSpent`, the `collapse` object, the `Turns` call. Add `revealRunId` state, an effect subscribing through `connectRunRevealed(window.harness, …)` that sets it only when `conversation.entries` holds a run entry with that id, a `revealed` spend callback, and the two new `collapse` fields. `setCurrentId` is not touched on this path.
- Tests to copy from: `tests/terminal-replay.test.ts:36-44,119-211` (the electron mock and `replay()` through the real session bridge with a fake `spawn`, `stopAt`, `thenExits`), `tests/contention-replay.test.ts:1-130` (two personas' sessions in one window), `src/renderer/ui/chat/run-card.dom.test.tsx:1-60,208-270` (jsdom mount, the focus-on-mount tests), `src/renderer/ui/chat/transcript.test.tsx:99,161-172` (`collapse()` helper; `focusRunId` names one card), `src/renderer/ui/app.test.tsx:52-80` (the fake bridge; add `onRunRevealed` there). jsdom has no `scrollIntoView`: stub `Element.prototype.scrollIntoView` in the dom tests.
- Guards to amend in `tests/negative-surface.test.ts`: `:1311-1320` (Epic 2: `\bNotification\b` banned in `ALL_CODE`; sweep all files but the notifier with the whole regex, and the notifier with the regex minus `\bNotification\b`), `:1322-1327` (preload and shared carry no `notif*`: keep as is), `:1463-1466` (Story 3.14: no scroll call in `RENDERER_CODE`; the offenders become exactly `use-reveal.ts: scrollIntoView`), `:1851-1856` (Story 3.9's counts: twenty-two channels, seventeen methods, with a line saying 3.10 added them), `:248-251` and `:1162-1168` (dock badge; `data-*` in the renderer: unchanged, must still pass). Sweep helpers at `:1-130` (`code`, `sources`, `offenders`, `ALL_CODE`, `MAIN_CODE`, `RENDERER_CODE`).
- Read-only evidence: `_bmad/planning-artifacts/epics.md:156-157` (FR93, FR94), `:1889-1924` (Story 3.10), `:464` (notifications share no file, projection or token with the card), `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md:406-430` (Run Completion When Unattended: the table and seven rules), `_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md:225` (macOS calls confined to `windows/`), `_bmad/implementation-artifacts/epic-3-context.md` (Completion when elsewhere; descope boundary), `eslint.config.mjs:141-145` and `tests/layering.test.ts:84-113` (Windows may import anything in main but preload and renderer), `src/renderer/ui/chat/run-status.ts:111-122` (`runLifecycleLine`: `John · saved · 15 sections`, the announcement the copy sits beside).

## Tasks & Acceptance

**Execution:**
- `src/shared/section-progress.ts`, `src/shared/section-progress.test.ts`, `src/renderer/ui/chat/run-status.ts`, `run-status.test.ts` -- move `sectionCount` to shared with its parameter `n`; the renderer imports it -- one spelling of `N sections` for the head, the live region and the notification
- `src/shared/channels.ts` -- add `RUN_REVEALED_CHANNEL = 'run:revealed'` with its doc -- the one push that tells a window which run's card to show
- `src/preload/harness-api.d.ts`, `src/preload/index.ts` -- `onRunRevealed(listener)` beside `onSessionEvent`; seventeen methods -- the renderer hears it with no channel handle
- `src/main/session-run.ts`, `src/main/session-registry.ts`, `src/main/session-bridge.ts` -- optional `told` dep from the bridge down to `RunKit`, called in `tell()` after `emit` -- one seam, every run event, the card as it stands
- `src/main/windows/run-notification.ts`, `run-notification.test.ts` -- `completionLine` and `createRunNotifier`; unit tests for every row of the matrix with fake `windowOf`, `post`, `isSupported` -- the macOS call, in the one place it may live
- `src/main/index.ts`, `src/main/index.test.ts` -- wire the notifier into the session bridge; amend the deps assertion -- the product posts, the tests still read the root
- `src/renderer/ui/chat/use-reveal.ts`, `use-reveal.test.ts` -- `connectRunRevealed` (guarded) and `useReveal` (one `scrollIntoView`, spent through `onRevealed`) -- the renderer's one scroll
- `src/renderer/ui/chat/run-card.tsx`, `transcript.tsx`, `app.tsx` -- `reveal`/`onRevealed` on the card, `revealRunId`/`onRevealed` on `RunCollapse`, the subscription and the drop-if-unknown rule in `App` -- the request reaches the one card and nothing else moves
- `src/renderer/ui/chat/run-card.dom.test.tsx`, `transcript.test.tsx`, `src/renderer/ui/app.test.tsx` -- scrolls once when `reveal` turns true, spends, never focuses; names one card; through the fake bridge: scroll, current persona unchanged, `openDoc`/`dispatchMenu`/`sendTurn`/`openSession` uncalled, unknown id dropped -- the renderer half of FR94
- `tests/completion-replay.test.ts` -- `fast-path-sonnet` (finished), `interrupt-inband` with `stopAt` (stopped), `reviewer-gate-failure-induced` (failed) and two sessions in one window, each through the real session bridge with `told` from a notifier over a fake window and a fake `Notification`: one `show()` per terminal event with the literal line read from the fixture once and pinned (the subject's section count equal to the card's), none when focused, none for any other event, and the click raising the fake window and sending `run:revealed` with the run id -- the beat, replayed
- `tests/negative-surface.test.ts`, `tests/channels-contract.test.ts`, `tests/bridge-contract.test.ts`, `tests/preflight-contract.test.ts` -- relax the two guards to the two files, amend the counts, and add a Story 3.10 block: `\bNotification\b` in the notifier alone; `silent: true` present and no `sound`, `hasReply`, `actions`, `urgency`, `timeoutType`, `icon`; no `requestPermission`, `systemPreferences` or `askFor` anywhere in `src`; no `\bapp\.`, timer, queue, debounce, digest or batch in the notifier; the notifier names exactly the three terminal event names and no other event; its string literals carry no guidance word; `use-reveal.ts` is the only scroll site, says no `smooth` and calls no `focus(`; preload and shared still carry no `notif*`; commands seven, events fifteen, channels twenty-two, methods seventeen -- the absence is the design
- `_bmad/implementation-artifacts/sprint-status.yaml`, `epic-3-context.md` -- mark 3.10 done at the end

**Acceptance Criteria:**
- Given a dispatched run replayed through the real session bridge with its project window unfocused, when its terminal event is told, then exactly one silent native notification is shown whose body is the persona, the file, the outcome and the subject's section count joined by `·`, and nothing is shown for any other event of the run.
- Given the same run with the window focused, when the terminal event is told, then nothing is constructed or shown.
- Given a shown notification, when it is activated, then its window is restored if minimized, shown and focused, the thread scrolls that run's card into view once, and the current persona, the open documents and every session are as they were, with no command sent.
- Given the product's sources, when swept, then the notification API is named in `src/main/windows/run-notification.ts` alone, the renderer's only scroll call is the reveal hook's, no Dock badge, sound or permission API exists anywhere, the preload and shared contract carry no word of it, and the counts are seven commands, fifteen events, twenty-two channels and seventeen bridge methods.

## Spec Change Log

## Review Triage Log

### 2026-10-06 — Review pass
- verdicts: 27 findings — high 0, medium 5, low 17, false 4, maybe-false 1
- findings:
  - `[medium]` `[patch]` Blind hunter: `told` reads the window before checking the sender is alive — real: closing the window mid-run reaches it through the registry's `destroyed` listener (`closeSessions` to `endRun` to `tell`), and a throw there would skip the rest of teardown; fixed with an early return on `sender.isDestroyed()` and tests, one of which fires the listener mid-run in the replay.
  - `[low]` `[reject]` Blind hunter: the banner says `finished` where the window says `saved` — FR93 fixes the banner's outcome word and the card's head word is Story 3.1's; two surfaces, each as specified.
  - `[low]` `[reject]` Blind hunter: a stopped run reads `0 sections` where EXPERIENCE says "the section reached" — the story governs and the spec's design notes record the choice; amending EXPERIENCE is a planning-document edit outside this build.
  - `[low]` `[reject]` Blind hunter: the epic-context rewrite dropped open items — the file is a cache the workflow compiles when planning documents are newer than it, and those items live on in their own specs and change proposals; no behaviour depends on it.
  - `[false]` `[reject]` Blind hunter: spec status, sprint status and epic context disagree — `in-review` is this step's own state and Finalize writes `done`.
  - `[low]` `[reject]` Blind hunter: the manual-check risk is not recorded and its `title` fallback is banned by a guard — it is recorded under Residual risks and in the deferred item; if the fallback is ever needed the guard is edited with it.
  - `[low]` `[reject]` Blind hunter: the document-window-focused case has no row or test — the notifier reads only the project window's focus, so the unfocused-window tests are that case.
  - `[low]` `[patch]` Blind hunter: `completionLine` admits `running` — narrowed to exclude it, with an early return in `told`.
  - `[low]` `[patch]` Blind hunter: the `told` type is spelled twice — one spelling now, `Told` taken from `RunKit`.
  - `[low]` `[patch]` Blind hunter: the wiring test accepts any function — now asserts the notifier was built with the roster lookup and diagnostic writer and that its `told` is what the bridge received.
  - `[low]` `[reject]` Blind hunter: activation gives no cue to a keyboard or screen-reader user — the story says the click scrolls and nothing else, and the spec keeps the live region unchanged; an announcement is new behaviour.
  - `[low]` `[reject]` Blind hunter: `useReveal` spends a request when the ref is null — a card whose reveal is true has mounted its root, so the case cannot occur.
  - `[low]` `[reject]` Blind hunter: the 13,047-frame replay runs twice — test time only, well inside its budget; sharing one run is a restructure for no defect.
  - `[medium]` `[patch]` Edge hunter: destroyed sender at told time — same root cause as the first row, fixed with it.
  - `[medium]` `[patch]` Edge hunter: a throw from `told` aborts the fold step — real, since only `show()` was wrapped; the whole body is now contained and a throw becomes one `run/completion · ` diagnostic line, with tests for a throwing window lookup and a throwing banner constructor.
  - `[low]` `[reject]` Edge hunter: a reveal arriving after a reload and before the conversation loads is dropped — needs a reload and a click inside the load window, and the fix adds held state to the window.
  - `[medium]` `[patch]` Verification gap: the destroyed-sender path through the notifier is untested — same root cause as the first row; tests added at unit and replay level.
  - `[medium]` `[patch]` Verification gap: exceptions from `told` are not contained — same as the edge hunter's second row, fixed with it.
  - `[maybe-false]` `[defer]` Verification gap: the banner object is not retained and Electron may collect it before a click — could not be checked here; the manual check settles it; recorded in `deferred` as medium, unverified.
  - `[low]` `[patch]` Verification gap: the wiring assertion is weak — same as the blind hunter's wiring row, fixed with it.
  - `[low]` `[reject]` Intent audit: the tests stop at injected fakes, a mocked Electron and jsdom, never the OS — unavoidable for an unattended run; the spec names the manual check and it is recorded as a residual risk.
  - `[low]` `[reject]` Intent audit: a guard bans `title` while the spec's manual check allows moving the line to it — same as the blind hunter's sixth row.
  - `[low]` `[reject]` Intent audit: "the window", the stop count and the file name are readings the story leaves open — each is stated in Design Notes and none is a defect.
  - `[false]` `[reject]` Intent audit: the seam covers "exactly one per terminal event" — a confirmation; `endRun` is the only raiser and `tell` the only emitter.
  - `[false]` `[reject]` Intent audit: three earlier guards were relaxed to admit this story — the spec asked for each, and each still pins the rest of its ban.
  - `[low]` `[reject]` Intent audit: the epic-context file was rewritten beyond one line — same as the blind hunter's fourth row.
  - `[false]` `[reject]` Intent audit: closure is partial, with no commit and the spec not yet `done` — the commit and the spec's `done` are Finalize's, run after this triage.

## Design Notes

- **A push channel, not a sixteenth event.** The events are what happened in the domain, folded by four projections and the renderer's own state; "show this card" is a request to one window. `doc:closed` already does this for the document window, so the reveal rides the same shape: a channel, a preload method, a guarded subscription.
- **The hook sits in `tell()`.** Every run event the window is told passes there with the card as it stands after the fold, so the notifier reads `card.status` and the subject's confirmed sections from main's own projection, never recomputes them, and is handed nothing a projection has not seen. It filters to the three terminal names itself, so the "nothing else posts" claim is a test, not a wiring accident.
- **The count, for every outcome.** The story names "the section count" for finished, stopped and failed alike; EXPERIENCE's older row says "the section reached" for a stop. The story governs, and the count is the same number the head says once saved. A stop before any `tool_result` reads `0 sections`: zero, stated plainly, as the foot's `0 words on disk` already is.
- **The file name, not the path.** FR93's own example is `PRD.md`; a macOS banner truncates a long body, and the card is one click away.
- **One line, in the body.** The copy is the one string the story gives, so it goes in `body` whole and `title` is left unset: macOS shows the app's name above it, and a body wraps where a title would truncate.
- **No permission code because Electron has none.** On macOS the first `show()` makes the OS ask, once; the harness has nothing to call and calls nothing, so "nothing asked a second time" is structural. A refused permission makes `show()` a no-op, which is the behaviour asked for.
- **Refs, not DOM queries.** The renderer bans `data-*`, `dataset` and `setAttribute` outright, and the card already holds its root in a ref for focus-on-mount. The reveal is the same request shape as focus: held by the window, named by run id, spent by the card.
- **"The window" is the project window.** FR94 says a notification "does not open a document window", so the product's vocabulary keeps the two apart: a user reading a document window with the project window behind it is elsewhere, and is told.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Run a skill, switch to another app, wait for the end: one banner, no sound, reading `<Name> · <file>.md · finished · N sections`; click it and the harness comes forward scrolled to the card with the same persona current. Repeat with the window focused: no banner. A dev build appears under "Electron" in System Settings → Notifications; if a body-only banner does not appear there, move the one line to `title` and record it. An unattended run cannot do this; record it as a residual risk.

## Auto Run Result

**Summary.** A run that ends while its project window is unfocused now posts one silent native macOS notification, and clicking it brings that run's card into view. A new notifier in `src/main/windows/` hears every run event the window is told, through one optional hook after the registry's single emit, and on a finished, stopped or failed run with the window unfocused it posts `<Persona> · <file> · <outcome> · <N sections>` with `silent: true`. Nothing posts when the window is focused or for any other event, each session's end posts its own line, and there is no badge, sound, permission call, timer or queue. Activation restores the window if minimized, shows and focuses it, and pushes the run's id on a new `run:revealed` channel; the renderer scrolls that card into view once through the ref the card already holds, with the renderer's one scroll call, moving no focus and switching no persona. A throw anywhere in the notifier, and a destroyed window, are contained to one diagnostic line.

**Files changed.** New: `src/main/windows/run-notification.ts` and `.test.ts`, `src/renderer/ui/chat/use-reveal.ts` and `.test.ts`, `tests/completion-replay.test.ts`. Edited: `session-run.ts`, `session-registry.ts`, `session-bridge.ts` (the `told` hook), `index.ts` (wiring), `channels.ts` (`run:revealed`), the preload and its type (`onRunRevealed`), `section-progress.ts` (`sectionCount` moved here), `run-status.ts`, `run-card.tsx`, `transcript.tsx`, `app.tsx`, and the tests those touch, plus `negative-surface`, `channels-contract`, `bridge-contract`, `preflight-contract` and `stop-contract` guards; `sprint-status.yaml` (3.10 done) and `epic-3-context.md` (recompiled, 3.10 and 3.2 marked done).

**Review.** 27 findings from four layers: high 0, medium 5, low 17, false 4, maybe-false 1. Patched in five entries: two medium (a destroyed sender reaching the notifier; a throw from the notifier escaping the fold) and three low (`running` excluded from the line's type, one spelling of the hook's type, a stronger wiring assertion). Deferred, one entry: the posted banner is not retained and may be collected before a click (medium, unverified). Rejected with recorded reasons: the outcome and count wording against the window and EXPERIENCE, the epic-context rewrite, the title fallback against its guard, the document-window case, an activation announcement, a reveal dropped across a reload, replay cost, and the intent auditor's surface observations.

**Follow-up review recommended:** true. Two medium entries were patched on a first pass, both in a path that only runs when the window closes or Electron throws, and neither was seen against real Electron; the unverified risk is how a destroyed `WebContents` and a retained `Notification` behave in the real app. Patched by verdict: high 0, medium 2, low 3.

**Verification performed.** After the patches: `npm run lint` exit 0 with no warnings; `npm run typecheck` exit 0; `npm test` exit 0 (unit 155 files, 3,489 tests; watchers 3 files, 55 tests); `npm run build` exit 0. Every row of the I/O matrix is covered by a test that ran in that run: the notifier's unit tests for each row, and the replay of `fast-path-sonnet` (finished), `interrupt-inband` (stopped), `reviewer-gate-failure-induced` (failed) and two sessions in one window; the renderer rows by the jsdom card, thread and app tests.

**Residual risks.**
- Nothing was observed on macOS. The banner, its click, the window coming forward and the scroll landing on the card were checked only through fakes, a mocked Electron and jsdom. Run the manual check once by hand.
- A body-only banner (no `title`) may not show in System Settings under the dev "Electron" entry; if so the line moves to `title`, and the guard that bans `title` is edited with it.
- The first `show()` makes macOS ask for permission once; a refusal is assumed to make `show()` a no-op, which was not observed.
- The banner object is not retained and may be collected before a click (deferred).
- The epic-context file was recompiled and is shorter than before; open items it once carried live in their own specs and change proposals.

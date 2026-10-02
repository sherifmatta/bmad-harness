# Spike — handoff continuity

**Status:** answered · **Opened:** 2026-10-02 · **Closed:** 2026-10-02 · **Story:** 2.12, Confirm continuity actually holds

## Verdict, up front

**The verdict is conditional on one scoring reading, and the owner's ruling on that reading is open.**

- Under reading **(b)**, B's chat plus the facts B writes into its own workspace log: **continuity holds only for what was written down.**
- Under reading **(a)**, B's chat alone in the first-reply window: **continuity holds only in appearance.** The counted Pass 1 trials score 0 of 3.
- The rubric's wording ("restates >=3 planted facts accurately") does not say which. I chose (b) as the working reading after seeing the results, so neither label is settled here. Detail under "What the verdict turns on".

What does not depend on the reading (counted = the 3 isolated Pass 1 and 2 Pass 2 trials; pilot/control = the 3 pilot-layout Pass 1 trials, the 1 control, and 1 usable pilot-layout Pass 2 trial):

- **Written work.** B opened A's artifact with no path in 3 of 3 counted trials (7 of 7 including 3 pilot and 1 control), and began the PRD from it in 3 of 3 counted (7 of 7 including pilot/control).
- **A decision settled only in chat.** B recovered it in **0 of 2 counted** Pass 2 trials (**0 of 3** including the pilot-layout trial; a second pilot-layout trial is void). B said so honestly (no fabrication), and every one of its replies read as a restart: "there's no work here to pick up", "this is the first time it's been mentioned to me", in a transcript that shows the discussion directly above.
- So **"no handoff presents as a restart" does not stand as written.** It stands for a handoff that follows written work. It fails for a decision reached in chat. The claim has not been weakened to fit; the gap and what would close it are in the sections below, and the planning lines that now disagree are listed with the skill that owns each.
- Adjacent finding, from reading the code: the sysline's file list recognises only `Write` and `Edit`, and A wrote its artifact through `Bash` in 3 of 3 counted trials (6 of 7 including pilot/control), so the sysline would have named no files even after written work (second gap below).

## The question

Does a handoff, which starts a **new** `claude` session that inherits nothing from the previous persona, let the receiving persona pick up the work from what the previous persona left on disk, so that "no handoff presents as a restart" (CAP-8, FR60, Story 2.9) is true in substance and not only on the surface?

Story 2.9 built the model: a handoff opens the next persona's session with its own activation turn and nothing else, writes a sysline `handed off · <from> → <to> · picking up from <files>`, and keeps one transcript. `src/main/sources/session/session-process.ts` (`activationTurn`) sends `/<agentId>` and nothing else as B's first stdin turn; `src/main/session-bridge.ts` (`handoffFor`) builds the sysline from the files the previous persona wrote. Nothing in the app carries content from A to B. Whether the claim holds was recorded as an open question in `_bmad/specs/spec-bmad-visual-harness/.memlog.md` (line 93) and left to this story.

## Why it blocks

The build commits to per-persona sessions with artifact-carried continuity (AD-7, AD-18). If a persona cannot pick up from artifacts, the unbroken transcript and the sysline present continuity that is not there, and the product's headline span, planning to build in one window with no re-briefing (`EXPERIENCE.md` journey 5), would be a surface over a restart.

## What ran

Claude Code CLI **2.1.274**, macOS, model `claude-opus-5[1m]` (the default) in all 22 sessions. Every session used the harness invocation, with `/bmad-agent-<x>` as the first stdin turn:

```
claude -p --input-format stream-json --output-format stream-json \
       --include-partial-messages --verbose --setting-sources project,local \
       --permission-mode bypassPermissions --max-budget-usd 3
```

The control run added `--no-session-persistence` to both sessions. The driver was a throwaway Node script in the session scratchpad, modelled on `scripts/record-run.mjs`: it sends each turn after the previous `result` row, records the NDJSON, timings, tool calls and replies, and closes stdin after the last turn's first `result` row (the CLI still processes any background wake-up before it exits; those rows are kept as later segments). The driver, the raw NDJSON and the scratch projects stayed out of the repo.

**Subject.** A scratch project made of this repo's `.claude/skills/` and `_bmad/` (`_config`, `bmm`, `core`, `custom`, `party-mode`, `render`, `scripts`, `config.toml`, `config.user.toml`), empty `planning-artifacts/`, `implementation-artifacts/` and `docs/`, and a `.claude/settings.json` of `{"autoMemoryEnabled": false}`. Nothing was run against this repo's own artifacts.

**Personas.** A is Mary, `/bmad-agent-analyst`. B is John, `/bmad-agent-pm`. A's second turn is a user message stating four invented facts (a codename, a constraint, a numeric limit, a decision with its reason) and asking for a short product brief in the planning artifacts folder, no questions first. B's turns are `/bmad-agent-pm` then exactly `pick up the work from here`. Nothing else reaches B: no path, summary, transcript, `--resume`, `--continue` or `--session-id`. Each trial uses a fresh scratch project, so there is no carry-over between trials.

**Rubric and verdict mapping** are the spec's, copied into `spike-handoff-continuity-evidence/rubric.fixed.json` with the SHA-256 of the planted-fact files (committed beside it as `planted-facts-pass1.json` and `planted-facts-pass2.json`), stamped 2026-10-02 15:48:38Z, before the first run. That file holds only pre-run content and has no entry for `pass1-control4`, which is a control. Interpretations made after seeing results are in `interpretations.post-hoc.json`.

**Trials.**

| id | pass | layout | counted |
|---|---|---|---|
| pass1-trial1, 2, 3 | 1, A writes, B picks up | isolated (below) | yes |
| pass1-control4 | 1 | isolated, plus no transcript on disk and the copied party-mode memlog stripped | no, control |
| pilot-pass1-trial1, 2, 3 | 1 | pilot layout (below) | no, supporting |
| pass2-trial1, 2 | 2, decision settled in chat only | isolated | yes |
| pilot-pass2-trial1 | 2 | pilot layout | no, supporting |
| pilot-pass2-trial2 | 2 | pilot layout | no, **void** (B read the answer key) |

**Why two layouts.** The first runs (the pilot layout) put each scratch project inside the driver's own directory tree. In `pilot-pass2-trial2` A had written nothing, so B went looking for the work by walking up out of the project and read the planted-facts file and A's scripted turns; its correct answer to "what did we decide" is therefore a leak, not a recovery, and B said as much itself. That trial is void. Every counted trial was re-run with the subject in a fresh system temp directory, `project_name` neutralised so nothing points at this repo, and nothing of the driver above it. No B in the pilot layout touched anything outside its project except `pilot-pass2-trial2`; the isolated layout is the one used for the verdict because it closes the channel rather than relying on B not using it.

**Channels other than the files, named and shown closed** (full audit in the evidence folder's `channels.json`, per-run audit text in each trial file):

- *Auto-memory.* Disabled by `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and by the project setting. Shown closed: `system/init` has no `memory_paths` in any of the 22 sessions; no `memory/` directory exists under any scratch project's folder in the home project store; the set of memory files anywhere under the home Claude folder (5 files, none belonging to a scratch project) was identical before and after every trial. **No memory file anywhere was written by A or read by B.**
- *Instructions and settings.* No user-level `CLAUDE.md` exists; `--setting-sources project,local` leaves out user settings; the scratch project has no `CLAUDE.md` and no persona sidecar.
- *Session transcripts.* Each session leaves a transcript under the home project store, keyed by the scratch directory, so A's transcript sits where B could in principle find it. This channel is **open but unused** in the pilot, isolated and Pass 2 runs: the tool-call audit of every B (main thread and subagents) finds no call that touches it. The control closes it: both sessions ran with `--no-session-persistence`, no transcript file exists for that scratch project, and B behaved as in the other isolated trials.
- *Things inside the scratch project count as artifacts.* The only ones besides A's are the install itself and one oddity: the copy of this repo's `_bmad/party-mode/memories/installed/.memlog.md` (its own project notes), present in the pilot and isolated scratch projects. B read it in `pass2-trial1` and rightly declined to treat it as this project's history. It contains none of the planted facts and was stripped in the control.
- *The web.* B's PRD research subagents used web search in several trials. The facts are invented and cannot be found on the web, so this is not a channel for them.

**Which tool wrote A's artifact** (the Write/Bash split by model is a known trap): in `pilot-pass1-trial1` `Write`; in every other trial `Bash` heredocs (`cat > .../brief.md <<EOF`), with `python3` patches for revisions. A harness that watches only `Write` would not see most of these files, which matters for the sysline's file list (see the caveats).

**Spend.** About $30 across the 22 sessions.

**Evidence.** Per-trial facts (A's artifact, B's tool calls with timings, B's replies verbatim, rubric scoring, channel audit) are committed beside this document in `spike-handoff-continuity-evidence/`, one `.facts.json` per trial, plus `rubric.fixed.json`, `interpretations.post-hoc.json`, the two planted-fact files and `channels.json`. The raw NDJSON, the driver and the scratch projects stayed in the session scratchpad and were not merged. Paths in the evidence are rewritten to `<subject>`, `<scratch>`, `<repo>`, `<subject-slug>` and `<home>`.

## Pass 1: A writes, B picks up

Summary of every Pass 1 trial. "Chat only / chat or own writes" is the count of the four planted facts B restated; "result" is the rubric result under reading (a) / reading (b).

| trial | layout | B opened artifact (turn / s) | began next step | facts (a) / (b) | result (a) / (b) | appearance: greeting / pick-up reply |
|---|---|---|---|---|---|---|
| **pass1-trial1** | isolated | 1 / 18s | yes | 2 / 4 | fail in substance / pass | continuation / continuation |
| **pass1-trial2** | isolated | 1 / 14s | yes | 2 / 4 | fail in substance / pass | continuation / continuation |
| **pass1-trial3** | isolated | 1 / 14s | yes | 2 / 2 | fail in substance / fail in substance | continuation / continuation |
| control4 | isolated, plus --no-session-persistence on both sessions and the copied party-mode memlog removed | 2 / 23s | yes | 2 / 4 | fail in substance / pass | continuation / continuation |
| pilot-trial1 | pilot | 1 / 26s | yes | 4 / 4 | pass / pass | continuation / continuation |
| pilot-trial2 | pilot | 2 / 36s | yes | 3 / 4 | pass / pass | continuation / continuation |
| pilot-trial3 | pilot | 2 / 26s | yes | 4 / 4 | pass / pass | restart / continuation |

What the table shows, as observed:

1. **B finds the work unaided, every time.** Opened A's artifact without a path: 3 of 3 counted, 7 of 7 including pilot/control. During its own activation turn, before the fixed text arrived, it did so in 3 of 3 counted and 4 of 7 overall (the persona's activation loads `{planning_artifacts}` for "artifact scanning", Step 5 of `bmad-agent-pm`), and in the other 3 of 7 (the control and two pilots) in the pick-up turn. This comes from the persona skill's activation, not from anything the harness does.
2. **B builds on it, every time.** 3 of 3 counted (7 of 7 including pilot/control) invoked `bmad-prd` with the brief named as its input and opened a PRD workspace; none asked where to start. (The PRD skill then asks the user for a brain dump, stakes and a working mode. Those are the skill's own interview questions about the project, not "what are we working on".)
3. **B does not reliably recite the facts.** The counted isolated trials restated 2 of 4 in chat each time; the pilot trials restated 4, 3 and 4. I cannot attribute the difference: A wrote one brief in `pilot-pass1-trial1` and a brief plus addendum in the others, and n is small. B wrote at least three of the four facts into its own workspace log in the same window in 2 of 3 counted trials and 5 of 7 overall (counted 2, control 1, pilot 2), in words such as "carried from brief (user-stated)". `pass1-trial3` is the exception: it opened and read everything, began the PRD, and never states "60 people" or the email-over-SMS decision anywhere in its output.
4. **B does not know who wrote the brief.** None of the 7 B sessions (3 counted, 1 control, 3 pilot) mentions Mary or an analyst. In `pass1-trial1` B says "I have a brief that *I* effectively wrote". The sysline names the pair; B's process does not.

### Counted trials in full

The first-reply quotes below are everything B said in the main thread in that window, verbatim, with only the identical 4-row menu table elided. Tool-call lists are cut at nine per turn; the rest are in the evidence files.

#### pass1-trial1 (Harbourlight)

A wrote: `briefs/brief-scratch-project-2026-10-02/.memlog.md`, `briefs/brief-scratch-project-2026-10-02/addendum.md`, `briefs/brief-scratch-project-2026-10-02/brief.md` via Bash heredoc (addendum.md), Bash heredoc (brief.md), Bash python patch. All four planted facts are on disk in `brief.md`, `addendum.md` and the brief's `.memlog.md` (checked by search after A and before B started).

B's tool calls up to its first reply to the fixed text (main thread; times from the turn's start in session B):

- activation turn:
  - 4.5s `Bash` ls -la && echo "---SKILL DIR---" && ls -la .claude/skills/bmad-agent-pm/
  - 8.8s `Bash` uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-agent-pm --project-root . --key agen
  - 11.0s `Bash` cat _bmad/bmm/config.yaml
  - 13.4s `Bash` echo "--- planning-artifacts ---" && ls -la _bmad/planning-artifacts/ 2>/dev/null; echo "--- docs ---" && ls -
  - 15.6s `Bash` find _bmad/planning-artifacts -type f | head -20
  - 18.0s `Bash` head -40 _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/brief.md
- pick-up turn (to the first `result` row):
  - 31.5s `Bash` sed -n '40,400p' _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/brief.md
  - 36.2s `Bash` echo "=== ADDENDUM ===" && cat _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/addendum.md &&
  - 48.1s `Skill` bmad-prd :: Create a PRD for Harbourlight, building on the existing product brief at _bmad/planning-artifacts/
  - 52.1s `Bash` uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-prd --project-root . --key workflow 
  - 56.2s `Bash` echo "--- existing PRD runs ---" && ls -la _bmad/planning-artifacts/prds/ 2>&1; echo "--- skill assets ---" &&
  - 60.0s `Bash` cat .claude/skills/bmad-prd/assets/prd-template.md
  - 74.8s `Bash` mkdir -p _bmad/planning-artifacts/prds/prd-scratch-project-2026-10-02 && cat > _bmad/planning-artifacts/prds/p
  - 81.4s `Bash` W=_bmad/planning-artifacts/prds/prd-scratch-project-2026-10-02 && uv run _bmad/scripts/memlog.py append --work
  - 105.6s `Agent` general-purpose :: Research ferry data feeds and WASM SQLite size
  - ... 2 more calls in this turn (in the evidence file)

Criterion 1, opened the artifact unprompted: **met**, turn 1 at 18.0s (`head -40 _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/brief.md`). B was given no path.
Criterion 3, began a next step building on it: **met**, `bmad-prd :: Create a PRD for Harbourlight, building on the existing product brief at _bmad/planning-artifacts/br` at 48.1s of turn 2.
Criterion 2, restated at least 3 planted facts accurately:

| planted fact | in B's chat (first window) | in B's own writes (first window) |
|---|---|---|
| Kestrel codename | yes | yes |
| 72 hours offline | no | yes |
| 4 MB bundle | yes | yes |
| SQLite over IndexedDB (WebView corrupts IndexedDB) | no | yes |

Counted in chat only: **2 of 4**. Counted in chat or B's own writes: **4 of 4**. Rubric result: **pass** reading (b), **fail in substance** reading (a).

- B's chat names 2 of 4 in its first window; its own memlog append in the same window carries all 4 verbatim ('carry forward verbatim from brief')
- spontaneous extra result row: a background research subagent finished and woke the main thread; counted as a later segment, not a turn

B's first reply, the activation greeting (appearance: **reads as continuation**, names the Harbourlight brief and its folder before being asked, says there is no PRD yet; still re-introduces itself and shows the full menu):

> I'll activate the PM agent. Let me start by resolving the agent customization block.
>
> 📋 Hello Sherif — John here, your Product Manager.
>
> I had a quick look around before we start: there's a draft product brief for **Harbourlight** sitting in `_bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/` — a ferry timetable and delay board for Orkney inter-island commuters, offline-first, with four hard constraints and a stack of flagged `[ASSUMPTION]`s. No PRD yet, no epics, and `docs/` is empty.
>
> That brief is honest about what it doesn't know, which is the right starting point for the conversation I'd like to have with you. A quick reminder: you can call the **`bmad-help`** skill at any time if you want advice on where to go next.
>
> Here's what I can do:
>
> [menu table of 4 rows (PRD, CE, IR, CC) elided here; full text in the evidence file]
>
> Given where things stand, **1 (PRD)** is the obvious next move — the brief is drafted and waiting to be turned into something development can act on. But I'm not going to template-fill it from the brief; those assumptions need you in the room.
>
> What would you like to do?

B's first reply to `pick up the work from here` (appearance: **reads as continuation**, opens a PRD workspace from the brief and its memlog; but calls the brief 'a brief that *I* effectively wrote' where Mary wrote it, so the author is not carried):

> 📋 Right — PRD it is. Let me read the brief in full first, including the addendum and the memlog, so I'm working from what's actually there rather than the summary.
>
> 📋 Good — I've got the whole picture now. Brief, addendum, and memlog all read.
>
> Before I dive in, one thing worth saying plainly: that brief was written autonomously, with no discovery conversation, and it's honest about the cost — six open questions, and several `[ASSUMPTION]` tags on things that materially shape the product (who the operator-facing surface is for, where sailing status even comes from, what platform the 4 MB ceiling applies to). Question 2 is the sharp one: **if there's no operator feed, Kestrel has nothing to sync against**, and that changes the shape of the first release entirely.
>
> I'll pick the work up and drive the PRD. Where I hit those questions I'll put the question to you rather than quietly inventing an answer.
>
> Workspace first, then I'll put the real questions to you.
>
> Workspace is live at `_bmad/planning-artifacts/prds/prd-scratch-project-2026-10-02/`. Constraints and inherited questions are logged.
>
> Two of the brief's open questions are answerable by research rather than by you, and both are load-bearing — I'll get those running while we talk.
>
> 📋 Research is running in the background. While it works, I need you.
>
> Here's my honest position: I have a brief that *I* effectively wrote, grounded in public sources — not in anything you told me beyond four constraints. If I now write a PRD from it, I'm just marking my own homework at higher resolution. So:
>
> **1. Brain dump — tell me about Harbourlight in your own words.**
> Where did this come from? Is there a real commuter, a real conversation, a real frustration behind it, or is it a concept you're exploring? Whatever you've got — ramble is fine, I'll structure it.
>
> **2. Anything else for me to read?**
> Notes, a transcript, emails with the operator, a sketch, a prior attempt, competitor teardowns. Paths or paste; size is not a problem, I extract via subagents rather than swallowing documents whole.
>
> **3. The one that changes the product most.** The brief's Open Question 2 — where does sailing status come from? If there's an operator feed, Kestrel syncs. If it's a human typing "Hoy 14:30 cancelled" into something, then **you're also building the thing that produces the data**, and that's a second product hiding inside this one. Which is it, and do you know yet?
>
> **4. Stakes.** Is this a hobby/exploration, an internal or operator-sanctioned tool, or something you intend to launch publicly? This sets how much rigor I apply and how long the document runs — I'd rather calibrate than pad.
>
> **5. How do you want to work?**
>
> - **Fast path** — I batch the remaining gaps into one or two consolidated questions, then draft the full PRD with `[ASSUMPTION]` tags wherever I inferred. You review, we iterate. Quality tracks how much you give me up front.
> - **Coaching path** — we walk the PM-thinking sections together, one at a time. Slower, much sharper, and the thinking ends up yours rather than mine.
>
> Given that the brief is already one round of me guessing, I'd lean coaching — but it's your call and your time.
>
> Two things available to you at any point: **`bmad-party-mode`** for multiple agent perspectives on a question, and **`bmad-advanced-elicitation`** when you want to go deeper on a specific section. The workspace persists, so you can stop and resume whenever.
>
> Answer what you can — even just 3, 4 and 5 is enough to get moving.

#### pass1-trial2 (Tidewrack)

A wrote: `briefs/brief-scratch-project-2026-10-02/.memlog.md`, `briefs/brief-scratch-project-2026-10-02/addendum.md`, `briefs/brief-scratch-project-2026-10-02/brief.md` via Bash heredoc (addendum.md), Bash heredoc (brief.md), Bash python patch. All four planted facts are on disk in `brief.md`, `addendum.md` and the brief's `.memlog.md` (checked by search after A and before B started).

B's tool calls up to its first reply to the fixed text (main thread; times from the turn's start in session B):

- activation turn:
  - 3.3s `Bash` uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-agent-pm --project-root . --key agen
  - 4.7s `Bash` cat _bmad/bmm/config.yaml 2>&1; echo "---CUSTOM DIR---"; ls -la _bmad/custom/ 2>&1
  - 9.4s `Bash` echo "=== planning-artifacts ==="; ls -la _bmad/planning-artifacts/ 2>&1; echo "=== docs ==="; ls -la docs/ 2>
  - 11.4s `Bash` find _bmad/planning-artifacts/briefs -type f | head -20
  - 13.6s `Bash` head -40 _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/brief.md
- pick-up turn (to the first `result` row):
  - 27.4s `Bash` echo "=== WORDCOUNTS ==="; wc -l _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/*.md; echo; 
  - 29.0s `Bash` echo "=== ADDENDUM ==="; cat _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/addendum.md; ech
  - 38.6s `Skill` bmad-prd :: Create a PRD for Tidewrack. Source input: the existing product brief at _bmad/planning-artifacts/b
  - 41.3s `Bash` uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-prd --project-root . --key workflow 
  - 42.7s `Bash` ls _bmad/bmm/config.user.yaml 2>&1; echo "=== prd skill tree ==="; find .claude/skills/bmad-prd -type f | head
  - 45.9s `Bash` echo "=== existing prds ==="; ls -la _bmad/planning-artifacts/prds/ 2>&1; echo "=== template ==="; cat .claude
  - 56.0s `Bash` WS="_bmad/planning-artifacts/prds/prd-scratch-project-2026-10-02" && mkdir -p "$WS" && cat > "$WS/prd.md" <<'E
  - 67.3s `Bash` WS="_bmad/planning-artifacts/prds/prd-scratch-project-2026-10-02" && for t in \ ⏎   "decision|Fixed fact 1 (pr
  - 85.3s `Agent` general-purpose :: Research offline map + tide data
  - ... 5 more calls in this turn (in the evidence file)

Criterion 1, opened the artifact unprompted: **met**, turn 1 at 13.6s (`head -40 _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/brief.md`). B was given no path.
Criterion 3, began a next step building on it: **met**, `bmad-prd :: Create a PRD for Tidewrack. Source input: the existing product brief at _bmad/planning-artifacts/bri` at 38.6s of turn 2.
Criterion 2, restated at least 3 planted facts accurately:

| planted fact | in B's chat (first window) | in B's own writes (first window) |
|---|---|---|
| Heron codename | no | yes |
| 90 minutes of safe tide | yes | yes |
| 25 MB offline map pack | yes | yes |
| fixed-time shifts over free-roam (coastguard briefs fixed windows) | no | yes |

Counted in chat only: **2 of 4**. Counted in chat or B's own writes: **4 of 4**. Rubric result: **pass** reading (b), **fail in substance** reading (a).

- 'a conversation with the coastguard' in chat is generic and is not scored as the decision; B's memlog append carries all four

B's first reply, the activation greeting (appearance: **reads as continuation**, names the Tidewrack brief and addendum, 'four hard facts'):

> I'll start by resolving the agent customization block.
>
> 📋 Hello Sherif — John here, Product Manager.
>
> I've had a look around. You've got a product brief for **Tidewrack** sitting in `_bmad/planning-artifacts/briefs/` (plus an addendum), written in one pass without a discovery interview — so most of it is flagged `[ASSUMPTION]` and explicitly asking to be corrected. No PRD yet. That's the obvious next move, and it's going to involve me asking you a lot of "why."
>
> A reminder: you can invoke the **`bmad-help`** skill at any time if you want advice on what to do next.
>
> Here's what I can do:
>
> [menu table of 4 rows (PRD, CE, IR, CC) elided here; full text in the evidence file]
>
> Given where things stand, **1 (PRD)** is where I'd start — we've got a brief full of inference and four hard facts, and the PRD is where we turn one into the other.
>
> What would you like to do? (Number, code, or just tell me in your own words.)
>
> *One housekeeping note, unrelated to the above: several claude.ai connectors (Atlassian, Linear, Notion, Slack, and others) need authorization and this session can't run that flow. If you want me reaching into any of those, authorize them in your claude.ai connector settings first.*

B's first reply to `pick up the work from here` (appearance: **reads as continuation**, 'I've read the brief, the addendum, and the memlog'; asks the user for a brain dump rather than for what the project is):

> 📋 Right — PRD it is. Let me read the full brief and addendum first so I'm not asking you things you've already answered.
>
> 📋 Good — I've read all three files. I know where we stand.
>
> The brief has four authoritative facts and about a page and a half of honest guesswork, plus six open questions that were deliberately never asked. Three of those (the live-enforcement question, the 25 MB scope, and the device floor) are the ones that will decide the architecture, so I'm going to want answers on them rather than inherited assumptions.
>
> Starting the PRD now.
>
> Workspace is bound and the four fixed facts are logged. Spinning up research in the background while we talk.
>
> 📋 Right, Sherif. Workspace is open at `_bmad/planning-artifacts/prds/prd-scratch-project-2026-10-02/`, the four fixed facts are logged, and I've got two research subagents out — one chasing the 25 MB offline-map and tide-data-licensing question, one mapping what already exists in beach-clean and tide-safety apps. They'll report back while we work.
>
> Two things you can reach for any time: **`bmad-party-mode`** if you want several agents arguing a decision from different angles, and **`bmad-advanced-elicitation`** if you want me to go deeper on a specific section rather than move on.
>
> Now — I've read the brief, the addendum, and the memlog. Here's my honest read before I ask you anything: **the brief is four facts and a well-written guess.** It says so itself. The problem framing, the users, the success criteria, and the scope boundary are all inference, and the six questions that would actually shape the build were deliberately never asked. I'm not going to launder that guesswork into a PRD and hand it to an architect — that's how you get a system built around assumptions nobody ever agreed to.
>
> So, three things from you.
>
> **1. Brain dump.** Tell me about Tidewrack in your own words — not a summary of the brief, what's actually in your head. Where did this come from? Is there a real group, a real beach, a real coordinator you've talked to? And is there anything else I should read: notes, a funding application, a conversation with the coastguard, an existing app you've seen and hated? Paths or paste, big documents are fine.
>
> **2. Stakes.** Which is this: a hobby/solo build, an internal plan for a group you're part of, or something heading for a real launch with real volunteers on real sand? I'm asking because the answer changes how hard I push on safety requirements. A product whose core promise is "you will not get cut off by the tide" carries a duty of care that a side project doesn't.
>
> **3. Working mode.**
> - **Fast path** — I batch every remaining gap into one or two big consolidated questions, then draft the whole PRD, tagging `[ASSUMPTION]` wherever I inferred. You review and we iterate. Quality tracks how much you give me upfront.
> - **Coaching path** — we walk the PM thinking together, section by section. Slower, but the output is genuinely yours rather than mine with your corrections applied.
>
> Given that the brief already went down the fast path once and came out mostly assumptions, I'd lean coaching here — but it's your call, and if you're short on time, fast path with honest tags beats nothing.
>
> One flag before you answer: of the six open questions, **whether the 90-minute rule is enforced live during a shift or only checked at planning time** is the one I can't paper over. Planning-time-only is a scheduling app. Live-enforced is a safety-critical system that has to keep computing the right answer on a dying phone with no signal — different architecture, different testing burden, different liability. I'll need that one settled whichever path you pick.

#### pass1-trial3 (Mossgate)

A wrote: `briefs/brief-scratch-project-2026-10-02/.memlog.md`, `briefs/brief-scratch-project-2026-10-02/addendum.md`, `briefs/brief-scratch-project-2026-10-02/brief.md` via Bash heredoc (addendum.md), Bash heredoc (brief.md), Bash python patch. All four planted facts are on disk in `brief.md`, `addendum.md` and the brief's `.memlog.md` (checked by search after A and before B started).

B's tool calls up to its first reply to the fixed text (main thread; times from the turn's start in session B):

- activation turn:
  - 4.2s `Bash` ls -la && echo "---SKILL DIR---" && ls -la .claude/skills/bmad-agent-pm/
  - 5.5s `Bash` uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-agent-pm --project-root . --key agen
  - 8.1s `Bash` cat _bmad/bmm/config.yaml 2>&1
  - 9.2s `Bash` ls -la docs/ && echo "---BMAD---" && ls -la _bmad/
  - 11.6s `Bash` find _bmad/planning-artifacts -type f | head -50
  - 14.1s `Bash` head -40 _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/brief.md
- pick-up turn (to the first `result` row):
  - 30.4s `Skill` bmad-prd :: create a PRD for Mossgate from the existing product brief at _bmad/planning-artifacts/briefs/brief
  - 32.2s `Bash` echo "=========== BRIEF ===========" && cat _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/b
  - 34.9s `Bash` uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-prd --project-root . --key workflow 
  - 39.1s `Bash` echo "---PRDS DIR---" && ls -la _bmad/planning-artifacts/prds/ 2>&1 && echo "---SKILL FILES---" && find .claud
  - 40.4s `Bash` cat _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/.memlog.md
  - 59.3s `Bash` cat .claude/skills/bmad-prd/assets/prd-template.md
  - 61.1s `Bash` mkdir -p _bmad/planning-artifacts/prds/prd-scratch-project-2026-10-02 && uv run _bmad/scripts/memlog.py init -
  - 71.4s `Bash` W=_bmad/planning-artifacts/prds/prd-scratch-project-2026-10-02 && cat > $W/prd.md <<'EOF' ⏎ --- ⏎ title: "PRD:
  - 85.8s `Agent` general-purpose :: Research venue booking conventions
  - ... 2 more calls in this turn (in the evidence file)

Criterion 1, opened the artifact unprompted: **met**, turn 1 at 14.1s (`head -40 _bmad/planning-artifacts/briefs/brief-scratch-project-2026-10-02/brief.md`). B was given no path.
Criterion 3, began a next step building on it: **met**, `bmad-prd :: create a PRD for Mossgate from the existing product brief at _bmad/planning-artifacts/briefs/brief-s` at 30.4s of turn 2.
Criterion 2, restated at least 3 planted facts accurately:

| planted fact | in B's chat (first window) | in B's own writes (first window) |
|---|---|---|
| Lantern codename | yes | no |
| 48-hour free cancellation | yes | no |
| 60-person hall limit | named, no value | no |
| email over SMS (no gateway budget) | no | no |

Counted in chat only: **2 of 4**. Counted in chat or B's own writes: **2 of 4**. Rubric result: **fail in substance** reading (b), **fail in substance** reading (a).

- '60 people' is never stated anywhere in B's output; the constraint appears only as 'no capacity breach' and 'fire capacity'
- the decision 'email over SMS' and its reason never appear in B's chat or its writes, in any window of the session
- B opened and read everything and began the PRD; it simply did not carry or recite two of the four facts

B's first reply, the activation greeting (appearance: **reads as continuation**, names the Mossgate brief, 'two hard constraints (no double-booking, no capacity breach)'):

> I'll activate as John, the Product Manager. Let me start by resolving the agent configuration.
>
> 📋 Morning, Sherif — John here, Product Manager.
>
> I've got my bearings: `scratch-project`, and there's already a **product brief for Mossgate** sitting in your planning artifacts — a village hall booking page for three clubs, with two hard constraints (no double-booking, no capacity breach) and an addendum alongside it. Nice and tight in scope. No PRD yet.
>
> A heads-up before we dig in: that brief has an `[ASSUMPTION]` flag on the current process — nobody confirmed how the three clubs coordinate today. That's exactly the kind of gap I'll keep poking at, because a PRD built on an unvalidated workflow assumption tends to ship the wrong increment.
>
> You can call `bmad-help` any time if you want advice on where to go next.
>
> Here's what I can do:
>
> [menu table of 4 rows (PRD, CE, IR, CC) elided here; full text in the evidence file]
>
> Given there's a brief and no PRD, **option 1** is the obvious next step — but tell me what you want. Number, code, or just say it in your own words.

B's first reply to `pick up the work from here` (appearance: **reads as continuation**, 'Picking it up — brief exists, PRD doesn't'; sets out the open questions and proposes defaults):

> 📋 Picking it up — brief exists, PRD doesn't. That's the gap. Let me load the PRD workflow and the full brief.
>
> No prior PRD run — this is a clean **Create**. Let me set up the workspace and read the template.
>
> Workspace bound. Let me seed the PRD file and kick off grounding research while I put questions to you.
>
> 📋 Workspace is live:
>
> ```
> _bmad/planning-artifacts/prds/prd-scratch-project-2026-10-02/
> ├── prd.md        (seeded, status: draft)
> └── .memlog.md    (3 entries)
> ```
>
> I've also got a research subagent out checking how comparable village-hall booking systems handle slot granularity, hirer identity, and late cancellations — it'll ground a couple of my guesses. That runs in the background.
>
> **Working mode:** I'm taking **Fast path**, inferred from precedent — the brief run was explicitly no-discovery, and "pick up the work from here" reads as *proceed*, not *interview me*. Say the word if you'd rather walk the sections together.
>
> But I won't draft on seven unanswered questions and call it a PRD. Here's the thing: your brief's open questions aren't evenly weighted. **Three of them block the FRs.** The other four I can carry as tagged assumptions without hurting anyone downstream.
>
> ### The three that block
>
> **Q6 — Bookable hours and slot granularity.** This one's load-bearing in a way the brief understates. Lantern's entire job is "no two bookings in the same slot" — but *slot* is undefined, so Lantern is currently a guard over a thing with no shape. Arbitrary start/end times make Lantern an overlap-interval problem; fixed slots make it a uniqueness check. Different product, different build.
> → *My default:* **08:00–23:00, one-hour slots.** Clubs book contiguous runs (e.g. 19:00–21:00 = two slots).
>
> **Q4 — Organiser identity, and who may cancel.** Can't write a booking FR without knowing who's holding the pen.
> → *My default:* **no self-signup.** The hall manager pre-registers a few named organisers per club; they sign in by emailed magic link. Three clubs is a fixed, tiny, known set — accounts with passwords are overhead for nobody's benefit. **Cancellation: any organiser of the booking's own club, plus the hall manager.** Club-level rather than person-level, so one organiser's holiday doesn't strand a booking.
>
> **Q1 — Cancellation inside the 48-hour window.** Your addendum already reasons toward the answer: a fee is the most expensive option because payment handling is out of scope.
> → *My default:* **software refuses it and tells the organiser to contact the hall manager.** The booking stays on the record until a human removes it — which keeps the diary authoritative, the whole point of the product.
>
> ### The four I'll carry as assumptions
>
> [menu table of 4 rows (PRD, CE, IR, CC) elided here; full text in the evidence file]
>
> **What I need from you:** either "go" — and I draft on all of the above with every inference tagged `[ASSUMPTION]` — or correct the ones I've got wrong. Correcting Q6 matters most; the other two blockers I'm fairly confident on.
>
> (Any point where you want to go deeper than Fast path allows, `bmad-advanced-elicitation` will push harder on a single section, and `bmad-party-mode` gets you Winston and Sally arguing with me about it.)

### Control and pilot runs


#### pass1-control4 (Pennywhistle), both sessions with --no-session-persistence

A wrote: `briefs/brief-pennywhistle-2026-10-02/.memlog.md`, `briefs/brief-pennywhistle-2026-10-02/addendum.md`, `briefs/brief-pennywhistle-2026-10-02/brief.md` via Bash heredoc (addendum.md), Bash heredoc (brief.md). All four planted facts are on disk in `brief.md`, `addendum.md` and the brief's `.memlog.md` (checked by search after A and before B started).

B's tool calls up to its first reply to the fixed text (main thread; times from the turn's start in session B):

- activation turn:
  - 4.8s `Bash` uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-agent-pm --project-root . --key agen
  - 5.8s `Bash` cat _bmad/bmm/config.yaml 2>&1
  - 11.2s `Bash` ls -la _bmad/planning-artifacts/ 2>&1 | head -30; echo "--- docs ---"; ls -la docs/ 2>&1 | head -20
  - 13.3s `Bash` find _bmad/planning-artifacts/briefs -type f 2>&1
- pick-up turn (to the first `result` row):
  - 23.0s `Bash` cd <subject>/_bmad/planning-artifacts/briefs/brief-pennywhistle-2026-10-02 && wc -l brief.md addendum.md .meml
  - 25.4s `Bash` echo "=== ADDENDUM ===" && cat addendum.md && echo && echo "=== MEMLOG ===" && cat .memlog.md
  - 37.0s `Skill` bmad-prd :: Create a new PRD for Pennywhistle, building on the existing product brief at _bmad/planning-artifa
  - 41.7s `Bash` cd <subject> && uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-prd --project-root .
  - 43.1s `Bash` ls -la _bmad/bmm/config.user.yaml 2>&1; echo "---skill files---"; ls -R .claude/skills/bmad-prd 2>&1 | head -4
  - 60.7s `Bash` ls -la _bmad/planning-artifacts/prds/ 2>&1; echo "--- template size ---"; wc -l .claude/skills/bmad-prd/assets
  - 63.1s `Bash` cat .claude/skills/bmad-prd/assets/prd-template.md
  - 81.0s `Bash` mkdir -p _bmad/planning-artifacts/prds/prd-pennywhistle-2026-10-02 && cat > _bmad/planning-artifacts/prds/prd-
  - 90.7s `Agent` general-purpose :: Research volunteer rota tool landscape
  - ... 2 more calls in this turn (in the evidence file)

Criterion 1, opened the artifact unprompted: **met**, turn 2 at 23.0s (`cd <subject>/_bmad/planning-artifacts/briefs/brief-pennywhistle-2026-10-02 && wc -l brief.md addendum.md .meml`). B was given no path.
Criterion 3, began a next step building on it: **met**, `bmad-prd :: Create a new PRD for Pennywhistle, building on the existing product brief at _bmad/planning-artifact` at 37.0s of turn 2.
Criterion 2, restated at least 3 planted facts accurately:

| planted fact | in B's chat (first window) | in B's own writes (first window) |
|---|---|---|
| Magpie codename | yes | yes |
| 6 consecutive weekly shifts maximum | yes | yes |
| load in under 2 seconds on a 2015 laptop | no | yes |
| shared calendar feed over a native app | no | yes |

Counted in chat only: **2 of 4**. Counted in chat or B's own writes: **4 of 4**. Rubric result: **pass** reading (b), **fail in substance** reading (a).

- no session transcript file exists for A or B under the home project store, so the transcript channel is closed in this run

B's first reply, the activation greeting (appearance: **reads as continuation**, names the Pennywhistle brief and addendum, 'No PRD, no epics yet'):

> I'll activate the PM agent. Let me start by resolving the agent configuration.
>
> 📋 Hi Sherif — John here, your Product Manager.
>
> I had a look around before saying hello. There's a product brief sitting in `_bmad/planning-artifacts/briefs/brief-pennywhistle-2026-10-02/` (brief + addendum). No PRD, no epics yet. So you're at the point where a brief turns into something development can actually execute against.
>
> Heads up: you can invoke the `bmad-help` skill at any time if you want advice on what to do next.
>
> Here's what I can take on:
>
> [menu table of 4 rows (PRD, CE, IR, CC) elided here; full text in the evidence file]
>
> Given there's a brief but no PRD, **1 (PRD)** is the obvious next move — but I'm not going to assume. What do you want to work on?

B's first reply to `pick up the work from here` (appearance: **reads as continuation**, 'On it. Let me read the brief first'; names Magpie and the 6-shift limit as the open points):

> 📋 On it. Let me read the brief first so I'm not walking in cold.
>
> 📋 Right, I've got the picture. Before I start: the brief was written autonomously from four stated facts, and it's honest about that — most of it is tagged `[ASSUMPTION]`, and there are five open questions sitting at the bottom. Two of those bite directly on the PRD:
>
> - **Roles/qualifications** (projection, bar, box office) — Magpie's matching logic is basically undefined without this.
> - **Is the 6-shift limit a hard block or an organiser-overridable default?** — that's a different feature depending on the answer.
>
> I'll drive the PRD and put those questions to you as we go rather than inventing answers. Starting the PRD workflow now.
>
> 📋 Good — I've read `brief.md`, `addendum.md`, and the memlog. Setting up the PRD workspace.
>
> 📋 Workspace is live: `_bmad/planning-artifacts/prds/prd-pennywhistle-2026-10-02/` — `prd.md` seeded, memlog carrying your four stated facts forward. It persists, so we can stop and resume whenever.
>
> Two things before we start properly, Sherif:
>
> **1. Brain dump.** The brief is my only input so far, and it's candid that it was written blind. What else is in your head about Pennywhistle? Talk at me — half-formed is fine. And if there's anything else to read — notes from the cinema, a spreadsheet of the current rota, messages from the organiser, a prior attempt at this — point me at it or paste it. Even "nope, the brief is all there is" is a useful answer, it just tells me how much we're inventing.
>
> **2. Stakes.** Which is this closest to?
> - **Hobby** — you're building it for one cinema, mostly yourself, nobody's reviewing the doc
> - **Internal** — a real deployment at a real venue, a handful of people depend on it
> - **Launch** — this is going somewhere beyond the one cinema, or there's money/reputation on it
>
> That sets how hard I push on rigor and how long the document runs. I'd rather calibrate than hand you an eight-page artifact for a weekend project — or a two-pager when you need the real thing.
>
> While you answer, I've got research running on what already exists in volunteer-rostering land — partly to check the brief's "nothing here is hard to build, they're all more demanding than us" claim actually holds.
>
> One flag I'm carrying, not asking you to answer yet: **the brief never says how many volunteers there are.** Magpie matching across 12 people and across 120 are different products. That's near the top of my list.
>
> *(Any time you want other perspectives on a section, `bmad-party-mode`; for deeper digging on one specific thing, `bmad-advanced-elicitation`.)*

For the three pilot runs the full per-call evidence is in `pilot-pass1-trial1/2/3.facts.json`. Their first replies, in brief:

- `pilot-pass1-trial1`, greeting (continuation): "I've loaded the project context. One artifact on the table: the **Harbourlight** product brief ... Three things from that brief are already load-bearing ... **72-hour offline operation** for the Kestrel sync module, a **4 MB installed bundle ceiling**, and **SQLite over IndexedDB**".
- `pilot-pass1-trial2`, greeting (continuation): "there's already a product brief sitting at `_bmad/planning-artifacts/briefs/brief-bmad-harness-2026-10-02/` (brief + addendum). That's the natural input to a PRD". Pick-up reply names Heron, the 90-minute floor and the 25 MB pack.
- `pilot-pass1-trial3`, greeting (**restart**): "Good to be working with you ... What are we working on? Pick a number, a code, or just tell me what's on your mind". Pick-up reply (continuation): "Picked up the thread ... a booking page for a village hall shared by three clubs ... Lantern, the 48-hour free-cancellation window, the 60-person fire limit, email-over-SMS on cost".

## Pass 2: a decision settled in chat and not written

#### pass2-trial1 (Reedwatch)

A's turns: the activation, then three user messages that settle a decision in conversation (the options, then the choice with its reason), with no request to write anything down. A made 4 tool calls in the whole session, all `Bash` lookups of the install config and the empty planning folder. Files A added to the project: **0**. Files B added: **0**. The decision was on disk nowhere.

A's last reply, closing the session:

> [earlier paragraphs omitted; full text in the evidence file]
>
> **The trigger is volume, but the cost is volume times frost nights.** At 500 holders you're looking at roughly £300 a year in message costs, assuming around twenty warning nights. Comfortable. Just flagging that a bad season moves that number more than a few extra signups do, so if you ever want a cost-based trigger as well as a headcount one, that's the shape of it.
>
> Happy to write this up as a short decision record in `_bmad/planning-artifacts/` — decision, the evidence behind it, the revisit trigger, and the two open questions from earlier that are still unanswered (geography, and alarm-versus-planning). Say the word and I'll draft it. Otherwise, where next — the warning threshold, or the signup flow?

B's tool calls after `pick up the work from here`:
  - 31.4s `Bash` echo "=== ALL files, excluding .claude skills ===" && find . -type f -not -path "./.claude/skills/*" 2>/dev/nu
  - 33.8s `Bash` echo "=== any md/yaml/json outside skills ===" && find . \( -name "*.md" -o -name "*.yaml" -o -name "*.json" -
  - 41.4s `Bash` echo "=== memlog ===" && cat _bmad/party-mode/memories/installed/.memlog.md 2>&1 | head -20 && echo && echo "=
and after `what did we decide about ...`:
  - 61.7s `Bash` echo "=== case-insensitive search for reedwatch / reed ===" && grep -ril "reedwatch" . 2>/dev/null | head -20;
  - 65.6s `Bash` echo "=== memlog full ===" && cat _bmad/party-mode/memories/installed/.memlog.md 2>&1 | tail -15; echo; echo "

B's first reply, the activation greeting (appearance: **reads as restart**):

> I'll activate the PM agent. Let me start by resolving the agent customization block.
>
> The resolver succeeded — no team or user overrides, so the base persona applies. Now loading config.
>
> 📋 Hello Sherif — John here, your Product Manager.
>
> I've loaded the project config for **scratch-project**. Quick read on where we stand: `_bmad/planning-artifacts/`, `_bmad/implementation-artifacts/`, and `docs/` are all empty. Clean slate — nothing's been written yet, which means whatever we start with, we start from your head, not from a document.
>
> A reminder before we dig in: you can invoke the **`bmad-help`** skill at any point if you want advice on what to do next or which part of the method fits your situation.
>
> Here's what I can do:
>
> [menu table of 4 rows (PRD, CE, IR, CC) elided here; full text in the evidence file]
>
> Given the empty workspace, **PRD** is almost certainly where you want to start — items 2 through 4 all assume requirements already exist to break down, check, or revise.
>
> But I'm not going to assume. What are we building, and what's prompted you to pick up the PM hat today?

B's first reply to `pick up the work from here` (appearance: **reads as restart**):

> 📋 Before I pick anything up, let me make sure I'm not missing work that's sitting somewhere I haven't looked.
>
> 📋 Sherif — I searched the whole project, and I have to be straight with you: **there's no work here to pick up.**
>
> Here's exactly what I found:
>
> **Empty:**
> - `_bmad/planning-artifacts/` — no PRD, no brief, no epics, no stories
> - `_bmad/implementation-artifacts/` — no sprint status, no story files
> - `docs/` — empty
>
> **Everything else is installer scaffolding:** config files, Python helper scripts, manifests, and `_bmad/render/` (cached skill templates from the BMAD install, not your work).
>
> One thing worth flagging, because it's the only trace of prior activity and it's a trap:
>
> `_bmad/party-mode/memories/installed/.memlog.md` holds notes from two past party-mode sessions — the agent roundtable arguing about a 4-epic, 44-story plan, with references to a `DESIGN.md`, FR numbers up to FR94, and decisions about epic boundaries. That reads like a project in flight.
>
> **It isn't this one.** Those sessions were about the BMad harness itself as a product, and none of the artifacts they discuss exist on disk here. This is `scratch-project` — the config names it that, and it's bare. If I "picked up from there," I'd be inventing a product from a changelog of arguments about a different one. That's exactly the failure mode Mary named in that very log: *every format described from memory was wrong.*
>
> So — I need one thing from you before I can do anything useful.
>
> **What are we building?**
>
> Rough is fine. A sentence is fine. Specifically what helps me most:
>
> - **Who's the user,** and what are they doing today instead of using your thing?
> - **What breaks** if this doesn't exist?
> - Do you have **anything written down** — notes, a Slack thread, a transcript, a doc elsewhere on your machine? Point me at it and I'll work from that instead of from a blank page.
>
> And if the honest answer is *"I want you to continue the harness work from that memlog"* — say so and point me at where those real artifacts live, because they're not in this directory. I'll go read them properly rather than reconstruct them from party notes.
>
> What's the product?

B's reply to the follow-up question (appearance: **reads as restart**):

> 📋 Let me check whether that name appears anywhere I can see.
>
> 📋 We didn't decide anything about Reedwatch — and I want to be precise about why, because there are two different things that could be going on.
>
> **What I checked:**
> - Grepped the entire project for "Reedwatch" — **zero hits**. The four files matching "reed" are incidental substrings inside BMAD's own skill files (words like "agreed"), not a product.
> - Re-read the full party-mode memlog end to end. It's about the BMad harness's epic plan — cards, feeds, FR numbers, sprint-status formats. No Reedwatch, no distribution or channel discussion anywhere in it.
> - Checked the session scratchpad: empty.
> - `planning-artifacts/`, `implementation-artifacts/`, `docs/`: still empty.
>
> **And in this conversation,** Reedwatch hasn't come up before now. This session began with you activating me, I reported the project was bare, you said "pick up the work from here," I said there was none. That's the whole record.
>
> So I have no decision to report back to you. If I produced one — "we agreed on a design-partner motion, community-led, waitlist first" — I'd be making it up, and it would be the exact failure the memlog itself names: *every format described from memory was wrong.* A fabricated channel strategy is worse than a format defect, because you'd act on it.
>
> **Two possibilities, and they need different things from you:**
>
> 1. **Reedwatch is real and lives somewhere else** — another repo, a doc, a Slack thread, a different Claude session. Point me at it and I'll read it properly. That's the fastest path and I'd rather work from your actual decisions than reconstruct them.
>
> 2. **Reedwatch is real but the decision lives only in your head** (or was made in a conversation that left no artifact). Then let's make it now, properly — and write it down this time so the next session doesn't have this problem.
>
> If it's #2, I'll need the raw material before I can be useful on distribution. "How should it reach people" is downstream of three things I don't know yet:
>
> - **What is Reedwatch, and who is it for?** Name suggests monitoring or watching something — but I'm pattern-matching on a word, which is guessing.
> - **How do those people currently find tools like this?** Channel follows where attention already is, not where we'd like it to be.
> - **Is this acquisition at zero users, or scaling a motion that already works?** Completely different answers.
>
> Which is it — does Reedwatch have a paper trail somewhere, or are we starting it here?

Decision on disk: **no**. Decision recovered by B: **no**. B fabricated a decision: **no**.

- A wrote no file in the project (only the settings stub exists); the decision was never on disk
- A ended with an offer, not a write: 'Happy to write this up as a short decision record ... Say the word'
- B did not fabricate; it grepped the project for the topic, found nothing, and said so
- B also read a copied party-mode memlog (this repo's own notes, a scratch-construction artefact) and correctly declined to treat it as this project's history

#### pass2-trial2 (Quillbox)

A's turns: the activation, then three user messages that settle a decision in conversation (the options, then the choice with its reason), with no request to write anything down. A made 5 tool calls in the whole session, all `Bash` lookups of the install config and the empty planning folder. Files A added to the project: **0**. Files B added: **0**. The decision was on disk nowhere.

A's last reply, closing the session:

> [earlier paragraphs omitted; full text in the evidence file]
>
> And a small feature that punches above its weight: **publish the moon phase for each week** on the entry form. Takes an afternoon to compute, and it means people rank slots sensibly instead of discovering in week three that they drew the full moon.
>
> Want me to capture this as a **product brief** — the decision, the rationale including your 70%, and the open questions — so it survives the conversation? Or keep going and nail down the standby mechanics first?

B's tool calls after `pick up the work from here`:
  - 25.9s `Bash` echo "=== all non-skill files under _bmad ===" && find _bmad -type f -not -path "*/scripts/*" | head -40 && ec
and after `what did we decide about ...`:
  - 47.9s `Bash` echo "=== grep Quillbox (case-insensitive, whole project) ===" && grep -ril "quillbox" . 2>/dev/null | head -2

B's first reply, the activation greeting (appearance: **reads as restart**):

> I'll activate as John, the Product Manager. Let me start by resolving the agent configuration.
>
> 📋 Hello Sherif — John here, Product Manager.
>
> I work the way good product work actually gets done: user interviews before templates, smallest validated increment before grand plans, user value first with technical feasibility as the constraint. Expect me to ask "why?" more than once.
>
> Quick read of where you stand: `_bmad/planning-artifacts/` and `docs/` are both empty, so **scratch-project** is a blank slate. Nothing upstream to build on yet.
>
> You can invoke the **`bmad-help`** skill at any time if you want advice on what to tackle next.
>
> ### Menu
>
> [menu table of 4 rows (PRD, CE, IR, CC) elided here; full text in the evidence file]
>
> Pick a number, a code, or just describe what you're after.
>
> One honest flag before you choose: with no artifacts on disk, items 2–4 have nothing to chew on — epics need requirements, readiness needs something to assess, and course correction needs a course. **PRD (1)** is almost certainly your start. If you'd rather go further upstream than a PRD — a rough idea that needs pressure-testing, or market research first — say so and I'll point you at the right skill instead of forcing you through mine.
>
> So: what are we building, and who's hurting without it?

B's first reply to `pick up the work from here` (appearance: **reads as restart**):

> 📋 Let me check whether there's work in flight I haven't seen before I assume a blank slate.
>
> 📋 I checked properly before answering, Sherif — and I have to give you the straight read rather than pretend there's a thread to pull.
>
> **There is no work in flight.** What I found:
>
> - `_bmad/planning-artifacts/` — empty. No brief, no PRD, no epics.
> - `_bmad/implementation-artifacts/` — empty. No stories, no sprint status.
> - `docs/` — empty. No project knowledge.
> - Not a git repository, so there's no history to recover context from either.
> - The only files under `_bmad/` are the installer's own scaffolding: config, manifests, and the rendered skill templates under `_bmad/render/`. That's BMAD's plumbing, not your product.
>
> So "from here" is the starting line. Nothing was lost — nothing was ever written.
>
> I'm not going to invent a product and hand you a PRD for it. That's the one thing that would genuinely waste your time: a polished document built on an assumption I made up, which you'd then have to unpick. PRDs emerge from interviews, not from me filling a template with plausible-sounding guesses.
>
> What I need from you is the seed. Honestly, one or two sentences is enough to start:
>
> - **What are we building?** Even rough — "a scheduling tool for clinic staff," "an internal dashboard for support tickets."
> - **Who's hurting without it, and how do they cope today?** The workaround people use right now tells me more than a feature list does.
>
> Give me that and I'll run the PRD interview from there — and I'll push on the *why* until the requirements are ones development can actually ship against.
>
> Two alternatives if a PRD isn't the right altitude yet:
>
> - The idea is still half-formed and you want it pressure-tested before committing → **`bmad-forge-idea`**.
> - You need market or competitive evidence before shaping requirements → **`bmad-deep-recon`** (Mary, the analyst, owns that ground).
>
> Either way — what's the product, and whose problem is it?

B's reply to the follow-up question (appearance: **reads as restart**):

> 📋 Let me search rather than answer from memory.
>
> 📋 Nothing was decided — there's no record of Quillbox anywhere, and no prior discussion of it between us.
>
> What I checked:
>
> - **`grep -ri "quillbox"` across the entire project: zero hits.** Not in artifacts, not in docs, not in config, not even in the BMAD scaffolding.
> - **`grep -ri "reservation"`: only matches inside `.claude/skills/`** — BMAD's own tooling files (`bmad-sprint-planning/scripts/sprint_plan.py`, `bmad-spec` templates, build review prompts). That's the framework's internal vocabulary, nothing to do with your product.
> - Our conversation in this session started with your `/bmad-agent-pm` invocation. There's no earlier exchange where reservations came up.
>
> I won't reconstruct a decision from the product name. I could spin you a plausible-sounding reservation model — hold-then-confirm, TTL on the hold, overbooking policy — and it would read like something we agreed. It isn't. Handing you a fabricated decision as recall is worse than being unhelpful, because you'd build on it.
>
> This is the second time you've pointed at work that should exist, which makes me think something structural is off rather than it being a memory gap:
>
> 1. **Wrong working directory.** This project is `scratch-project` at a temp path (`<subject>`) — a scratch sandbox, no git. If Quillbox lives in a real repo, I'm simply looking in the wrong place. Point me at the path and I'll read what's there.
> 2. **Different session.** If the reservation discussion happened in another Claude Code conversation, that context didn't carry here. Paste the relevant notes or the artifact and I'll pick it straight up.
> 3. **It was a conversation elsewhere entirely** — a call, a doc, Slack — and was never written down. In which case the decision exists in your head and we should capture it now, while it's recoverable.
>
> If it's (3), that's real PM work and I'm ready: tell me what Quillbox is, what a "reservation" means in it — a seat, a slot, a unit of inventory, something else — and I'll interview you properly, then write it down so this question has an answer next time.
>
> Which of the three is it?

Decision on disk: **no**. Decision recovered by B: **no**. B fabricated a decision: **no**.

- A wrote no file; it ended by asking 'Want me to capture this as a product brief ... so it survives the conversation?'
- B grepped for the topic and found nothing; no fabrication

#### Pilot runs

- `pilot-pass2-trial1`: same shape. A's last reply said "**Decision recorded:** D-001 — SMS only for v1" and made no tool call that writes a file, so nothing was recorded. B made 7 tool calls, none outside the project, and answered "We didn't decide anything about Reedwatch — this is the first time it's been mentioned to me".
- `pilot-pass2-trial2`: **void**, as above. A also wrote nothing; B's correct recital of the decision came from the leaked answer key and it said so ("I did not recover it from continuity").

Result for Pass 2: **0 of 2 counted trials recovered the decision; 0 of 3 including the one usable pilot-layout trial** (the second pilot-layout trial is void). In all three the decision was on disk nowhere, and in all three A ended without writing it: one offered to ("Say the word and I'll draft it"), one asked "Want me to capture this as a product brief", one claimed it was recorded when it was not.

## What the verdict turns on

The rubric says B "restates >=3 planted facts accurately". It does not say where. B's replies are fluent and name the work, but they often name two facts and carry the other two only into the workspace log they open (`carried from brief (user-stated): ...`). So:

- Reading (a), B's chat alone **in the first-reply window** (activation greeting through the first `result` row after the fixed text): the 3 counted Pass 1 trials score 2, 2 and 2 of 4, so **0 of 3 pass**, and by the spec's own mapping the verdict would be **holds only in appearance**. On the same reading the 3 pilot trials score 3 of 3 and the 1 control 0 of 1, so across all seven Pass 1 trials it is 3 of 7. This figure is for the first window only. Over the full session's chat, `pass1-trial1` would pass: a later reply (after a background research subagent finished) mentions the SQLite constraint, though not IndexedDB, giving Kestrel, 4 MB and SQLite, so the counted figure under (a) would be 1 of 3, not 0 of 3. That later reply is truncated to 1,500 characters in the evidence file; the full text is in the raw NDJSON, which is not committed.
- Reading (b), chat or B's own writes in the same window: the 3 counted trials score 4, 4 and 2 of 4, so **2 of 3 pass**, and with Pass 2 unrecovered the mapping gives **holds only for what was written down**. Across all seven (3 counted, 3 pilot, 1 control) it is 6 of 7.

I used reading (b) as the working one, and the owner's ruling is open. My reasons: the rubric's wording does not restrict it to chat, and a persona that logs the four facts accurately in its own workspace has them, whether or not it recites them to the user. This is a choice made after seeing the results, and it is the more favourable of the two, so it is stated rather than buried. The owner may prefer (a), in which case the label is "holds only in appearance". What does not move under either reading: B found the work and began the next step in 3 of 3 counted trials (7 of 7 including pilot/control), and failed to recover a chat-only decision in 0 of 2 counted Pass 2 trials (0 of 3 including the pilot-layout trial). What the reading changes is how much B says out loud, not whether it found the work.

Other ambiguities, as observed:

- "First reply" is the activation greeting plus the reply that ends at the first `result` row after the fixed text. A background research subagent finishing wakes B's main thread and produces a further reply (`spontaneousExtraResultRows` in each file); those are later segments and are not counted in the first window. They sometimes add facts (`pass1-trial1` mentions the SQLite constraint only there; see reading (a) above).
- "Accurately" is applied to the distinguishing content: the codename, the number with its unit, the chosen option. A constraint named without its number ("no capacity breach", `pass1-trial3`) is marked "named, no value" (`partial: true`, with the counted flag false) and not counted.
- Pass 2's rule speaks of "Pass 2's written decision". Nothing was written in any valid trial, so the reading used is: recovered means B stated the settled decision correctly from something legitimately available to it.
- Criterion 3 ("proposes or begins a next step that builds on them rather than asking where to start") was scored as met whenever B invoked `bmad-prd` on the brief, even where B then asked the user questions. In `pass1-trial1` B asks "where did this come from?" and "anything else for me to read?" after opening a PRD workspace from the brief; the same applies to the other Pass 1 trials. The reading that those are the PRD skill's own interview questions about the project, not "where do we start", is mine, was made after seeing the replies, and is not in the fixed rubric. Read strictly, criterion 3 is arguable in every Pass 1 trial.
- `pass1-trial3` is a plain fail under both readings (2 of 4, with a third named but without its value). It is counted as a fail, not smoothed.

## The appearance axis, separately

Of the 14 first replies in the seven Pass 1 trials (greeting and pick-up reply each; 6 of 6 counted, 2 of 2 control, 5 of 6 pilot), 13 read as continuation: they name the brief and its folder or the project, and say there is no PRD yet. One, the greeting in `pilot-pass1-trial3`, reads as a restart ("What are we working on?") before the pick-up reply recovers. The greeting still re-introduces John and shows the full menu every time; that is the persona's activation, not a restart of the work.

Of the nine labelled replies in the three usable Pass 2 trials (six in the 2 counted, three in the pilot-layout trial), **9 read as restart**. The user in the app would see Mary and the user settle a decision, click John's tile, see the sysline `handed off · Mary → John` (with no `picking up from`, because nothing was written, exactly as Story 2.9 specifies), and then read John say the project is a blank slate. The sysline is honest. John's words contradict the transcript above them.

## Verdict against the claim

Scored against the rubric and mapping fixed in the spec:

- Pass 1 passes **2 of 3** counted trials under reading (b) (0 of 3 under (a), first window); Pass 2's chat-only decision is **not recovered** (0 of 2 counted). By the mapping, under (b) **continuity holds only for what was written down**, and under (a) it holds only in appearance. Either way there is a gap, recorded as one.
- "No handoff presents as a restart": **does not stand unqualified.** It stands where the previous persona's work reached disk. It does not stand where the user and the previous persona settled something in conversation, which is ordinary use: the persona offered or claimed to record it in 3 of 3 usable Pass 2 trials (2 counted, 1 pilot-layout) and wrote nothing.
- CAP-8's "prior context intact across every handoff" was already narrowed in the planning memlog to "in substance, not in process, insofar as memlog-then-derive puts the context on disk". This spike supports exactly that narrowing, and adds that conversation outside a skill workflow is not put on disk by anything today. The workflows that did write (`bmad-product-brief`) put every planted fact into the artifact in 7 of 7 trials (3 counted, 1 control, 3 pilot), so memlog-then-derive works where a workflow runs; it does not cover a chat.

## The gap, and what would close it

**The gap.** A decision or conclusion reached in conversation with A, outside a workflow, is not on disk when B opens, so B cannot pick it up and presents as a restart.

Candidates, to weigh and not to build:

| candidate | closes Pass 2? | what the evidence says |
|---|---|---|
| A closes a turn by writing the decision to its memlog | **Yes, at the source** | The only candidate that acts on the gap. It is a persona-skill behaviour (owner: the `bmad-agent-*` skills, tried through a `bmad-customize` override such as a persistent fact or an `activation_steps_append` entry). Not tested here, and the evidence is mixed on whether a prompt alone will hold: in 3 of 3 usable Pass 2 sessions (2 counted, 1 pilot-layout) A did not write unprompted, and one claimed it had. |
| The harness hands B the sysline's file list as its first user turn | No | In Pass 2 the list is empty. For written work it adds little: B found the files itself in 3 of 3 counted trials (7 of 7 including pilot/control). It would also end the property that B's process receives only `/<agentId>` (`activationTurn`). |
| A harness-written handoff note on disk | Only if it carries chat content | That means the harness authoring words from the transcript and writing them into the project, which `SPEC.md:85` ("The harness writes nothing into the project") and the rule that the harness never authors persona words rule out as stated. |
| Re-word the claim to "no handoff presents as a restart after written work" | No, it narrows the claim | This is the move the spec forbids doing quietly. It is an amendment for the owning skills to make explicitly, not something this spike does. |

**A second, adjacent gap, found by reading the code and not by running it.** In 6 of the 7 Pass 1 trials A wrote its artifact with `Bash` heredocs, and most revised it with `python3` patches. The sysline's file list comes from `foldWrittenPaths` (`src/main/fold/written-paths.ts`), which recognises only `Write` and `Edit` tool blocks (`WRITE_FIELDS` in `src/main/fold/route-frame.ts:71`) and drops `.memlog.md`. So after those six runs the sysline would read `handed off · Mary → John` with no `picking up from`, the same bare line the app shows after Pass 2, where nothing was written, even though a brief and an addendum were on disk and B found them. Only `pilot-pass1-trial1` (A used `Write`) would have named a file. The sysline never claims continuity, so it is not false, but it can understate it, and the user cannot tell "A wrote nothing" from "A wrote through Bash". This is the Write-versus-Bash split `fixtures/runs/README.md` already records for Epic 3's `doc:prose`; the handoff path has the same blind spot. A remedy belongs with whoever decides how a document write inside a Bash command is recognised (candidate for Story 2.13, or Epic 3's interpreter work), not here.

Nothing here changes Story 2.9's behaviour. Whichever candidate is chosen, a cheap way to test it is to repeat Pass 2 with the change and the same scoring.

## Planning lines that now disagree

Not edited here; each is owned by the skill named. The memlog is append-only, so line 91 is superseded by the decision appended to it, not rewritten.

| line | says | now | owning skill |
|---|---|---|---|
| `_bmad/specs/spec-bmad-visual-harness/.memlog.md:91` | "'No handoff presents as a restart' holds unchanged." | Holds only after written work. | bmad-spec |
| `_bmad/specs/spec-bmad-visual-harness/.memlog.md:93` | open question: does per-persona sessions plus artifact-carried continuity satisfy CAP-8? | Answered: for written work, yes; for a chat-only decision, no. | bmad-spec |
| `_bmad/specs/spec-bmad-visual-harness/SPEC.md:62` | "No handoff presents as a restart, a new thread or a cleared history." then "the receiving persona can pick up the work from what is on disk" | The second sentence is borne out for written work; the first is unconditional and is not. | bmad-spec |
| `_bmad/planning-artifacts/epics.md:111` (FR60) and `:1308` (Story 2.9 AC) | "No handoff presents as a restart" | Same qualification. | bmad-create-epics-and-stories |
| `_bmad/planning-artifacts/epics.md:428`, `:1024`, `:1299` | "hand off ... without a restart", "without a restart or a re-briefing" | Same. | bmad-create-epics-and-stories |
| `_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md:124` (AD-7) | "CAP-8's 'no handoff presents as a restart' holds; its 'prior context intact' holds in substance only insofar as BMad's memlog-then-derive puts that context on disk" | The second clause is exactly right; the first is not unconditional. | bmad-architecture |
| `.../architecture-bmad-harness-2026-09-23/.memlog.md:17` | "'no handoff presents as a restart' is satisfied by unbroken scrollback plus artifacts" | Not satisfied when the decision is unwritten. | bmad-architecture |
| `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md:116` | the corrected sysline "satisfies CAP-8's 'no handoff presents as a restart' better ... because the transcript is continuous and the artifacts are named and on disk" | True where artifacts exist; the sysline carries no files when none were written, and B can then read as a restart. | bmad-ux |
| `.../EXPERIENCE.md:567` (journey 5, "no restart and no re-briefing") | planning to build in one window | Supported for the demo path, which runs through written PRD and epics. | bmad-ux |

## Caveats and risks, as observed

1. **One pair, one model, one project shape.** Only Mary to John, only the default model, only a tiny project with one folder of artifacts. A handoff to Amelia, a project with many artifacts, a populated `docs/`, or a long planning arc was not tried. Discovery by activation scan may behave differently with fifty files.
2. **The written-work half used a skill workflow.** A wrote through `bmad-product-brief`, which keeps a memlog. A planning artifact produced by plain chat editing was not tried. Pass 2 is the nearest probe and it failed.
3. **n is small and B's recitation varies.** 3 counted Pass 1 trials, 2 counted Pass 2 trials. The 2-versus-4 difference in recited facts between the pilot and isolated layouts is unexplained.
4. **B's pick-up reaction is expensive.** John treats `pick up the work from here` as "start the next workflow", and the PRD skill runs research subagents: B's cost in Pass 1 was $0.64 to $2.99 per trial. In the app a handoff is just a tile click plus whatever the user types, so this is a property of the test stimulus.
5. **The sysline file list was read from the code, not run.** The second gap above rests on reading `written-paths.ts` and `route-frame.ts`; no bridge ran. The evidence for the model's behaviour (Bash heredocs in 3 of 3 counted and 6 of 7 overall) is observed.
6. **No real Electron run.** Everything here is the CLI behind the bridge; the sysline and transcript were not rendered.
7. **The party-mode memlog copy** in the pilot and isolated scratch projects was this repo's own notes. It did not change any planted-fact result and was stripped in the control.

## Decision

Record the finding as conditional on the scoring reading: **continuity holds only for what was written down** under reading (b), **holds only in appearance** under reading (a), with the owner's ruling open, and with the gap above in either case. "No handoff presents as a restart" is not confirmed as written; the narrowing and the remedy are for the owning skills, not for this spike. No harness code, command or event changes; Story 2.9's behaviour stands. The decision is appended to the project memlog through `memlog.py`, the stale lines are carried in this story's `deferred`, and the scratch projects, driver and raw NDJSON were not merged.

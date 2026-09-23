# Spike — skill execution model

**Status:** answered · **Opened:** 2026-09-23 · **Closed:** 2026-09-23 · **Timebox:** 1 day

## The question

What runs a BMad skill when the harness presses a skill button, and can the harness observe
that run closely enough to render CAP-5 — a document writing itself, section by section?

This is a **feasibility unknown, not a decision.** Everything else in the spec is a choice
someone can make from an armchair. This one can invalidate the product thesis, so it gets
settled with evidence.

## Why it blocks

`SPEC.md` capabilities that hang on the answer: **CAP-5** (visible live authoring),
**CAP-6** (filesystem rail), **CAP-11** (stop a run), **CAP-12** (failed runs legible).

CAP-5 is the money moment — *watch the PRD write itself, John pushing back, a face on him.*
If it isn't achievable at the fidelity `ui-surfaces.md` promises, the spec needs reworking
before anyone builds a window.

## Not in scope for this spike

**Build nothing.** No harness code, no window, no scaffolding, no `package.json`. The output of
this spike is a decision and the evidence for it — if it leaves behind anything but findings and
throwaway scratch, it overran.

No BMad skill runs a spike; this is ordinary investigation. `bmad-build` implements stories and
there are none yet. `bmad-spec` is used *after*, to fold the answer back in.

Test 1 requires a real `bmad-prd` run. Point it at a throwaway subject, not at the harness — the
harness already has its contract, and a stray `prd-*/` folder is noise in the planning artifacts.
Delete the run folder afterwards.

## Required reading

- `../specs/spec-bmad-visual-harness/SPEC.md` — the contract
- `../specs/spec-bmad-visual-harness/ui-surfaces.md` — "Live authoring" section, what the card must show
- `../brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html` — the binding mockup; open it in a browser and watch the live-writing pane

## What we already suspect

Reading `.claude/skills/bmad-prd/SKILL.md`: BMad skills follow a **memlog-then-derive**
pattern. `prd.md` is created early with `status: draft` frontmatter, then Discovery runs as a
conversation while decisions accumulate in `.memlog.md`, then `## Finalize` renders the
document.

If the substantive document render happens in one burst at finalize, **there is no section-by-
section prose to stream** and the mockup's live-writing card is showing something BMad does not
actually do. That is the likeliest way this spike comes back negative — and it is a fact about
BMad skill design, not about the runtime. Test it first, because it is also the cheapest test.

## Tests, in order of how likely they are to kill CAP-5

### 1. Does a BMad skill author progressively? (no harness needed)

Run `bmad-prd` in this repo in a throwaway session and watch the file from outside:

```bash
fswatch -x _bmad/planning-artifacts/ | tee /tmp/prd-writes.log
# or, crude but sufficient:
while :; do printf '%s %s\n' "$(date +%T)" "$(wc -c < path/to/prd.md)"; sleep 1; done
```

Record: how many distinct writes land on `prd.md`, their sizes, and where they fall relative to
the conversation. Do the same for `.memlog.md`.

**Decides:** whether "§4 of 9, prose streaming in" describes anything real.

### 2. Can Claude Code as a subprocess emit usable events?

```bash
claude -p "<prompt that invokes bmad-prd>" --output-format stream-json --verbose > run.ndjson
```

Inspect the NDJSON for: assistant text deltas, `Write`/`Edit` tool calls naming `prd.md` with
their content, and anything that would let you say "section 4 of 9".

**Decides:** whether the path you already use day-to-day can drive the UI.

### 3. Same question via the Agent SDK

Can it load `.claude/skills/` and run `bmad-prd` with identical behaviour, but with streaming
and tool-call events as first-class objects? Weigh against the CAP-1 constraint: the harness
must keep *reading* the install, not grow its own model of how BMad runs.

## Decision criteria

Pick the path that supplies all three, or document which is unavailable:

1. File-write events as they happen, with content
2. The assistant's own text, streaming — this is the "John pushes back" beat
3. Enough structure to render progress against a known plan, not a percentage

## If test 1 comes back "one big write at finalize"

Three options, in preference order — do not silently pick one, bring them back:

1. **Drive the card from `.memlog.md` instead of the document.** It is appended entry by entry
   throughout the run, it is BMad's canonical record, and it is already a live progress stream.
   "Watch the decisions accumulate, then the document lands" may be a truer money moment than
   watching prose appear — and it is the one BMad actually emits.
2. **Make the conversation the live beat** and the document render the payoff. The elicitation
   loop is long, inherently streamable, and is where the pushback lives.
3. **Change the local skills to render progressively.** They are in `.claude/skills/` and
   editable. Costs the most and pulls against "don't redesign the method" — the method is the
   pipeline, but skill internals are close enough to warrant care.

## Write back

Append findings to `../specs/spec-bmad-visual-harness/.memlog.md`:

```bash
uv run _bmad/scripts/memlog.py append \
  --workspace _bmad/specs/spec-bmad-visual-harness \
  --type decision --text "Execution model: <what you chose and why>"
```

Then re-run `/bmad-spec` against the spec folder so SPEC.md is re-derived — it is the single
writer, and hand-edits get overwritten. If CAP-5's success criterion has to change, say so
explicitly; that is a thesis change, not a detail.

---

# Findings

**Answer: CAP-5 is achievable at the fidelity the mockup promises — but not from the source the
spike assumed.** BMad does not author section-by-section *on disk*; it does author
section-by-section *on the wire*. The live-writing card is real. It is fed by the runtime's
tool-input stream, not by watching the file.

Run with Claude Code CLI 2.1.267, model `claude-opus-5[1m]`, against an isolated copy of this
repo's `.claude/skills/` + `_bmad/` in scratch. Subject: "RecipeBox", a throwaway internal tool.
Nothing was written into this repo's planning artifacts.

## Test 1 — does a BMad skill author progressively? **No, not on disk.**

Two runs, both watched from outside at 200ms resolution.

**Run A — headless, Fast path** (`claude -p`, complete brief supplied):

```
t=  95.7s  create  .memlog.md     +144B
t= 114.8s  modify  .memlog.md     +226B
t= 115.0s  modify  .memlog.md    +1493B
t= 516.2s  create  prd.md       +68394B   <-- the entire PRD, one write
t= 558.3s  modify  .memlog.md    +1019B
t= 565.5s  modify  prd.md         +174B   <-- 20+ small revision edits follow,
t= 574.8s  modify  prd.md         +434B       one every 5-10s, through t=686s
...                                           final size 78,445B, 15 top-level sections
```

**Run B — interactive, Coaching path** (scripted user turns over `--input-format stream-json`):

```
t=  68.7s  create  .memlog.md     +117B
t= 156.1s  create  prd.md         +219B   <-- frontmatter stub only
t= 251.0s  modify  prd.md        +7798B   <-- §0, §1, §2, §2.1, §2.2, §2.3 in ONE write
t= 349.4s  create  addendum.md  +10506B   <-- one write
```

So the coaching path walks the *conversation* section by section but commits *batches* of
sections, and every commit is a whole-file `Write`, never an append. There is no filesystem
event that means "§4 started".

`.memlog.md` behaves as the spike predicted: appended entry by entry throughout, with
substantive content. Two caveats for the watcher — it is written by **atomic temp-file rename**
(`memlog.py`), and rapid appends coalesce (three landed inside 400ms in Run A).

## Test 2 — can the CLI subprocess emit usable events? **Yes, all three criteria.**

`claude -p --output-format stream-json --include-partial-messages --verbose`

The single 68KB write in Run A was not a single event. The assistant message carrying it
decomposed into:

| delta type | events | chars |
|---|---|---|
| `input_json_delta` | **5,795** | **69,031** |
| `thinking_delta` | 28 | — |
| `text_delta` | 6 | 87 |

Reconstructing the accumulating `content` buffer at intervals shows a document growing in order:

```
  2% of deltas ->     149 chars,  2 headings  (# PRD, ## 0. Document Purpose)
 10%           ->   5,894 chars,  7 headings  (... ### 2.3 Key User Journeys)
 25%           ->  16,006 chars, 10 headings  (... ### 4.1 Ingredient Catalogue)
 50%           ->  33,989 chars, 14 headings  (... ### 4.5 Allergen Flagging)
 75%           ->  51,174 chars, 23 headings  (... ## 7. Cross-Cutting NFRs)
100%           ->  68,039 chars, 30 headings
```

Against the decision criteria:

1. **File-write events with content — yes.** `content_block_start` names the tool; the payload
   streams as `input_json_delta`; `tool_result` confirms the write landed.
2. **Assistant text streaming — yes.** Rich in the interactive run, near-absent in headless (87
   chars). The "John pushes back" beat is real and it is a *coaching-path* phenomenon. Run B,
   verbatim: *"That's a summary, not a vision — a vision has to say why it matters and what
   'good' feels like. That part has to come from you."* It headed that turn `# §1 — Vision`.
3. **Structure — yes, with one gap.** Headings parse out of the streaming buffer live.
   `system/task_progress` carries subagent description, token count, `last_tool_name` and
   duration. `parent_tool_use_id` separates subagent chatter from the persona's own voice.
   The gap is the *denominator* — see risks.

## Test 3 — the Agent SDK

The SDK runs the same Claude Code binary as a library, loads `.claude/skills/` through
`settingSources: ['project']` + `cwd`, dispatches `/bmad-prd` identically, and emits the same
message union (`SDKPartialAssistantMessage` under `includePartialMessages`). It adds
`interrupt()`, `canUseTool` and hooks as typed callbacks instead of signals and flags.

One constraint decides it: Anthropic's SDK terms state that third-party products built on the
Agent SDK must use **API-key authentication, not claude.ai login**. A harness the user runs on
their own machine, spawning the `claude` binary they already installed and authenticated, sits
outside that. That is the difference that matters, not ergonomics.

## CAP-11 / CAP-12 — stop semantics (Run C)

SIGINT sent to `claude -p` immediately after the third tool call was announced:

- Process exited **rc=0 within 250ms**.
- Final `result`: `subtype: "error_during_execution"`, `is_error: true`,
  `stop_reason: "tool_use"`, with `duration_ms`. A stopped run is distinguishable from a
  finished one.
- The in-flight tool got `tool_result` with `is_error: true` — *"The user doesn't want to
  proceed with this tool use. The tool use was rejected"*. The harness knows exactly which
  section did **not** land.
- `doc.md` on disk was **byte-for-byte the last successful write**: 3,373B, §1 and §2 complete,
  §3 absent. The SPEC constraint "leaves the file byte-for-byte as written" holds for free.

Also observed, and useful: the model narrates each write before making it — *"Now the Target
User section."*, *"Next, the Glossary."*, and in Run A's revision pass *"Now updating the
assumptions index and adding a risk for the PPDS gap."* That is a per-section status line in
the persona's own voice, available without any parsing.

## Risks this surfaced

1. **The card and the rail must be fed from different sources.** The card renders an in-flight
   write that is not yet on disk; the rail renders the filesystem. This does not violate "no
   second source of truth" — the card is a view of a write in progress, not a model of project
   state — but SPEC.md currently implies both come from the filesystem, and that is wrong.
2. **`tool_use` precedes the disk write.** Run C proved an announced `Write` can fail to land.
   Mark a section written on `tool_result`, never on `tool_use`.
3. **The denominator is not known upfront.** Run A adapted the template's 0–9 Essential Spine
   into 15 sections. "§4 of 9" needs a predicted total: the template spine plus the memlog's own
   concern-scan entry, which explicitly names the Adapt-In sections pulled.
4. **Dead air during subagent work is the real spinner risk — not authoring.** Discovery
   research and the Finalize reviewer gate run as parallel subagents; the main thread emits
   nothing but `system/task_progress` for minutes at a time. This, not the document render, is
   where "no spinner substitutes at any point" is hard to honour. `.memlog.md` is the only
   substantive live signal in those windows.
5. **Whole-file rewrites.** Document commits use `Write`, not `Edit`. Incremental diffing must
   come from the stream; comparing file versions gives a whole-file replacement.
6. **Latency.** Run A reached a complete 78KB PRD in ~12 minutes; Run B's first document commit
   landed 4 minutes in. The card has plenty to show, but a skill button is a multi-minute
   commitment and the UI should say so.

## Decision

**Claude Code CLI as a subprocess**, with
`--output-format stream-json --include-partial-messages --setting-sources project,local`.
It supplies all three decision criteria, runs on the user's existing auth, and keeps reading the
install rather than modelling it (CAP-1). Revisit the Agent SDK only if the harness ships as a
product carrying its own API key.

On the spike's three fallbacks: option 3 (**change the local skills**) is **unnecessary** — the
premise that there is no section-by-section prose to stream is false. Option 1 (**drive the card
from `.memlog.md`**) is not needed as the primary but should be adopted as the *secondary* feed,
because it is the only live signal during subagent dead air (risk 4). Option 2 (**make the
conversation the live beat**) is already true in the coaching path and needs no change.

**CAP-5's success criterion stands as written.** No thesis change. The correction is to
SPEC.md's implicit data source, not to what the user sees.

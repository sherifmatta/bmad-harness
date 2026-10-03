# Spike — the product's real argv against a real `claude`

Run 2026-10-03, `claude` 2.1.274, default model, on a throwaway subject project (a copy of this repo's `.claude/` and `_bmad/` config and scripts). Closes Epic 2 retro item 25 (sprint key `epic-2-retro-item-25-run-the-story-2-4-voice-difference-check`) and finding F16. Cited by Story 2.4 (voice) and Story 2.12 (handoff).

## What ran

Every session used the product's own argv, read from `SESSION_ARGS` in `src/main/sources/session/session-process.ts` by the runner (`spike-product-argv-check-evidence/run.mjs`) and refused if it held a permission mode, a model or a system prompt:

`claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`

No `--permission-mode`, no `--model`. Same spawn shape as the product: own process group, stdin and stdout piped. `/bmad-agent-<x>` was the first stdin turn, each next turn went on the previous `result` row. Five sessions, 9 turns, USD 5.69. Per-session facts (replies, tool names, `permission_denials`, result fields) are in `spike-product-argv-check-evidence/*.summary.json`; the raw frame logs were not kept, because they carry the operator's home path.

## Finding 1 — voice differs between two agents given the same prompt (Story 2.4). Met, n=1 pair.

Mary (`bmad-agent-analyst`) and John (`bmad-agent-pm`), same turn: "In three sentences, introduce yourself and tell me what you would ask first about a product idea I am about to describe." Both ended `success` / `end_turn`.

- Mary: opens with 📊, names herself Business Analyst, frames her work as evidence-backed briefs, asks who has the problem and what they do now, calls the workaround "the real competitor", and closes "Go ahead — describe the idea."
- John: opens with 📋, Product Manager, frames his work as interrogating assumptions, asks the same underlying question in his own words, and warns "I'll be asking 'why' a lot".

The two replies differ in icon, role, framing and phrasing while converging on the same first question. The harness added nothing to either. One pair, one prompt, one model.

## Finding 2 — under the product's argv a persona cannot run `uv` or write a file. Blocking for Epic 3.

`-p` with no permission mode has no one to ask, so a tool call that needs approval is denied and reported in the `result` row's `permission_denials`. Observed:

| Tool call | Outcome |
| --- | --- |
| `Read` of any project file | allowed |
| Simple read-only `Bash` (`ls`, `cat`) | allowed |
| `Bash` `uv run _bmad/scripts/resolve_customization.py ...` (the activation step of every `bmad-agent-*` skill) | **denied**, 5 of 5 sessions |
| `Bash` with a `for` loop | denied ("Contains for_statement") |
| `Write` of `notes/hello.md` | **denied**; the file was not created; the persona reported "the write was blocked" and asked the user to approve it |

Consequences:

- Every persona activation hits the denial. The skill's documented fallback worked (each persona resolved the agent block by reading the three TOML files by hand and said so in its greeting: "the resolver script needed a permission I couldn't get"). Activation succeeds, but the persona opens with a note about a missing permission, which is the persona narrating a harness limit in the user's first view of the room.
- **No document write can succeed**, and Epic 3's whole premise (watch a document write itself) is unreachable with this argv. The corpus was recorded with `--permission-mode bypassPermissions`, so it does not show this.
- `--setting-sources project,local` excludes the `user` source, so the operator's own allow rules do not apply either. Only an allow rule in the target project's `.claude/settings*.json` would, and the harness writes nothing into the project.
- The prompt-less denial reads, in the transcript, as the persona's own failure ("it did not work"), because the harness shows persona words unaltered.

Not tried: `--permission-mode acceptEdits`, `--allowedTools`, `--permission-prompt-tool stdio` (an approval round trip through the harness), a project `.claude/settings.json` allow list, or `bypassPermissions` on the product's argv. Choosing among them changes `SESSION_ARGS`, `tests/session-contract.test.ts` (which pins the absence of `--permission-mode`), AD-18 and the zero-write rule, so it is a decision for Sherif and the architect, not a fix made here.

## Finding 3 — a chat-only decision does not survive a handoff. Gap confirmed with the real argv (Story 2.12), n=1.

Mary was told, chat only and with no write to disk: the product is called Lantern, the first user is solo founders, the first release has no accounts. She confirmed all three and added a caution about "no accounts". No file was written (and none could have been, Finding 2). A new session for John then got "Mary and I just talked. What did we decide, and where do you pick up?"

John said "I wasn't in that conversation, and I have no transcript of it. Fresh session, empty memory", searched the project, and described only the brainstorm folder he found on disk. None of Lantern, solo founders or no accounts appeared. That matches the Pass 2 result in `spike-handoff-continuity.md` (0 of 3), now observed with the product's argv. It also shows John answering honestly rather than inventing, which is the good half of the gap.

Confound: the subject project held a copy of this repo's `_bmad/brainstorming/` folder, so John had an artifact to find. It does not change the verdict for the chat-only decision, which was not recovered either way.

## Limits

One run of each scenario, one model, one persona pair, a subject project that is not a real BMad project, no real Electron (the sessions were spawned by a script, not the app). The default model resolved at run time was not recorded in the summaries beyond the CLI default.

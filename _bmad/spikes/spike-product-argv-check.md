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

Choosing a remedy changes `SESSION_ARGS`, `tests/session-contract.test.ts` (which pins the absence of `--permission-mode`) and AD-18, so it is a decision for Sherif and the architect. Finding 4 tests the options.

## Finding 3 — a chat-only decision does not survive a handoff. Gap confirmed with the real argv (Story 2.12), n=1.

Mary was told, chat only and with no write to disk: the product is called Lantern, the first user is solo founders, the first release has no accounts. She confirmed all three and added a caution about "no accounts". No file was written (and none could have been, Finding 2). A new session for John then got "Mary and I just talked. What did we decide, and where do you pick up?"

John said "I wasn't in that conversation, and I have no transcript of it. Fresh session, empty memory", searched the project, and described only the brainstorm folder he found on disk. None of Lantern, solo founders or no accounts appeared. That matches the Pass 2 result in `spike-handoff-continuity.md` (0 of 3), now observed with the product's argv. It also shows John answering honestly rather than inventing, which is the good half of the gap.

Confound: the subject project held a copy of this repo's `_bmad/brainstorming/` folder, so John had an artifact to find. It does not change the verdict for the chat-only decision, which was not recovered either way.

## Finding 4 — four ways to give sessions permission, tried on the same turn (item 32)

Same subject setup, `/bmad-agent-analyst` then one turn: "Create `notes/a.md` with the Write tool containing exactly: a. Then create `notes/b.md` using a bash heredoc containing exactly: b." The product argv plus one extra flag each. Evidence: `spike-product-argv-check-evidence/{accept-edits,prompt-tool,settings-file}.*`.

| Extra flag | Activation (`uv run` resolver) | `Write` | Bash heredoc `cat > f <<EOF` | Notes |
| --- | --- | --- | --- | --- |
| none (Finding 2) | denied | denied | not tried | |
| `--permission-mode acceptEdits` | **denied** (2 denials) | works | works on the second try; `mkdir`, `cat` redirect inside the project allowed, chained `&&` commands denied | `uv run` still needs approval, so every persona still narrates the missing permission |
| `--settings <file>` with `allow: [Write, Edit, Bash(uv run:*), Bash(python3:*), Bash(cat:*), Bash(mkdir:*)]`, the file kept outside the project | **works**, no denials | works | **denied**: the allow rule matches `cat` but the redirect to a file is checked separately, and every heredoc attempt (five Bash calls) was denied | a rule list cannot cover model-dependent Bash document writes (opus carries documents in through heredocs, `fixtures/runs/README.md`) |
| `--permission-prompt-tool stdio`, harness answers `allow` | works, 0 denials | works | works | the CLI sends a `control_request` with `subtype: "can_use_tool"` (`tool_name`, `input`) on stdout for every call that would prompt, and waits for a `control_response`. Four were sent in the one turn. An unanswered request would hold the turn open |

An inline JSON string passed to `--settings` was rejected ("Invalid JSON provided to --settings") by this CLI version; a file path works. `bypassPermissions` is known to work (the whole corpus used it) and was not re-run.

What this means for the choice:

- `acceptEdits` and a static allow list each leave a hole that Epic 3 hits (the resolver call, or Bash document writes). Neither is sufficient alone.
- Two options remain: `bypassPermissions` (no checks at all; one flag; the corpus already reflects it), or `--permission-prompt-tool stdio` with the harness answering each `can_use_tool` request from a fixed policy (for example allow when the path is inside the project root, deny otherwise). The second keeps a boundary and adds one inbound frame type to handle, which must always be answered or the turn wedges (the wedged-turn escape from Epic 2 retro item 18 would be the backstop).

## Finding 5 — the chosen policy, run through the product's own code against a real `claude` (item 32). Met, n=1.

Run 2026-10-03, `claude` 2.1.274, default model. Built from `spec-session-permission-policy.md`: `SESSION_ARGS` now ends `--permission-prompt-tool stdio`, `spawnSession` answers every `control_request` with `subtype: "can_use_tool"` by its `request_id` from an injected `decide`, and `decide` is `decidePermission` (`src/main/fold/permission-policy.ts`) over the session's project root, a data directory, the home directory and the real canonicaliser (`src/main/sources/session/canonical-path.ts`). The runner (`run.mjs policy`) bundles those three modules from `src/` with esbuild and drives them directly; the registry and Electron were not in the loop. The subject project was given as a `/tmp/...` path, so the CLI's own absolute paths (under `/private/tmp/...`) only matched the root through canonicalisation. Same subject setup as Finding 4, `/bmad-agent-analyst` then one turn: create `notes/a.md` with `Write`, `notes/b.md` with a Bash heredoc, and `c.md` in a sibling directory outside the project with `Write`, then report what worked and why. Evidence: `spike-product-argv-check-evidence/policy.{summary,files}.json` (paths shown as `<subject>` and `<base>`). The run was repeated after the review fixes to the Bash scan, and the evidence files are from that second run: same outcomes (activation with no denials, inside `Write` and heredoc created, outside `Write` denied and refused by the persona, no file created).

| Permission request (in order) | Answer |
| --- | --- |
| `Bash` `uv run _bmad/scripts/resolve_customization.py ... 2>&1` (activation) | allow |
| `Write` `<subject>/notes/a.md` | allow |
| `Bash` `mkdir -p <subject>/notes && cat > <subject>/notes/b.md <<...` | allow |
| `Write` `<base>/policy-outside/c.md` | deny: `blocked: <base>/policy-outside/c.md is outside the project` |
| `Bash` `ls -l notes/ && ... && ls -l <base>/ 2>&1` (the persona checking its work) | deny: `blocked: <base>/ is outside the project` |

- Activation: `result` `success`, `permission_denials: []`. The greeting no longer mentions the resolver needing a permission (Finding 2). It did carry an unrelated note that the claude.ai connectors are not authorized in the session; whether that note recurs, and whether the harness should do anything about it, is not tested here.
- `notes/a.md` and `notes/b.md` exist; `policy-outside/c.md` does not.
- The deny shape `{behavior: "deny", message}` is what this CLI accepts: both denials appear in the turn's `permission_denials` with their tool input, the turn still ended `success` / `end_turn`, and the persona quoted the message verbatim and said the block "came from the harness, not from a filesystem permission error". It said it then re-ran its check without the outside path.
- No control frame reached `onFrame` (`controlFramesHandedToOnFrame: 0`), and no turn waited on an answer.

What it does not show: a run inside the real app (the registry's per-project wiring and `userData` are covered by `session-bridge.test.ts`, not by this run), an `Edit`, a read outside the project, a `cancel`, or any model but the default. The Bash rule is a boundary on paths written in the command, not a sandbox: the allowed `uv run` call could itself touch anything.

## Limits

One run of each scenario, one model, one persona pair, a subject project that is not a real BMad project, no real Electron (the sessions were spawned by a script, not the app). The default model resolved at run time was not recorded in the summaries beyond the CLI default.

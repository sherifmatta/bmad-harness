# Spike: what a persona's seat does when it was never activated

Measured 2026-10-19 for Story 8.3's open item (`ARCHITECTURE-SPINE.md`, Open Items: *A seat opened by a skill button is not activated as its persona*).

**Question.** A seat started by a skill button has the skill as its first stdin turn and no `/bmad-agent-<x>`. What does the model do with the user's next chat message in it: answer as the persona, or not?

**Method.** `claude` 2.1.285, run in this repository with the harness's own argv (`SESSION_ARGS`) plus `--max-budget-usd 1.5`, driven by `spike-unactivated-seat-evidence/probe.mjs` (stream-json on stdin, a read-only permission policy that denies everything but `Read`, `Glob`, `Grep` and `Skill`). Two sessions, the same second message: *"Before we continue: who are you, and what is your name and role? Answer in two sentences, in your own voice."* n=1 each.

| Seat | First stdin turn | Answer to the second message |
|------|------------------|------------------------------|
| skill-first | `/bmad-brainstorming` | "I'm Claude, an AI assistant made by Anthropic, running here as a Claude Code agent on the Sonnet 5.5 model. In this session my role is brainstorming coach: ..." |
| activated | `/bmad-agent-analyst` | "📊 I'm Mary, the Business Analyst. I turn vague needs into precise, evidence-backed requirements ... with Porter's strategic rigor and Minto's structured thinking. I get a treasure hunter's thrill ..." |

**Finding.** A seat whose first turn is a skill answers as the base model with the skill's role, not as the persona: no name, no title, none of the persona's voice. The skill's own context is not enough.

**Caveat.** The permission policy denied the activation's own config script in both runs (`probe: read-only`), and Mary still loaded from `customize.toml`; the harness's real policy allows more. One sample each, so this shows the direction, not a rate. The frame recordings the probe writes (`<label>.jsonl`) were not kept; the answers above are quoted from its printed output, and its `cwd` is this repository's path. Only an identity question was asked: a message that answers a question the skill itself asked, mid-run, was not tried.

**Decision (Story 8.3 spec).** The first chat message a user sends into a seat that was never activated writes `/<agentId>` first, then the message once the activation turn has ended, as the first-message path does. The skill button's own start is unchanged.

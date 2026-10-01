# Scope tiers

SPEC.md capabilities are the **Must** set. This file holds what was deliberately deferred but
not rejected. Downstream may not build these as part of the capability contract; they are
recorded so the next planning pass starts from the decision already made.

## Deferred from a Must — party mode's structured tracking

Cut from CAP-9 for want of a data source, not for want of value. CAP-9's disagreement-and-decision
structure is therefore **not met in v1** (`SPEC.md` CAP-9;
`../../planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md`
*Spec Amendments Required*). `bmad-party-mode` emits prose and is explicitly instructed never to
produce summaries or takeaways, so nothing here can be populated today.

| Item | Note |
|---|---|
| *Open disagreements* panel | Parties (stacked faces), status (`unresolved` / `proposed`), the substance, and age (`since turn 3 · 2 exchanges`). |
| *Decisions so far* panel | Same missing source. |
| Transcript `disagrees` / `evidence` tags and quoted-turn references | Same missing source. |
| *Pause room* | A lifecycle state distinct from stop, which neither CAP-11 nor the session model models. Waits on the same second pass. |

**Revisit when** a structured source exists — most plausibly a `_bmad/custom/` override making
the party skill emit machine-readable markers. Party v1 ships the room itself: chosen cast,
permanently visible faces, lit speaker, no turn-taking gate, the *Room* panel, and the summary
written to `_bmad/`.

## Should — wanted in v1 if it fits, cut before any Must

| Item | Note |
|---|---|
| Help section explaining BMad to newcomers | The original ask for the whole product. Survived convergence as Should, not Must. The shell reserves the entry point. |
| Persona face reacts to state | Neutral idle, thinking while a skill runs, changed when a doc it owns changes on disk. Partly realised by the state vocabulary in `ui-surfaces.md`; the *facial* reaction is the deferred part. The portrait function already accepts `state`, so this needs no signature change. |

## Could — worth building, no v1 commitment

| Item | Note |
|---|---|
| Hover a persona tile to preview its skill buttons | Content is already free from the resolved menu. |
| "Second opinion" on any document in the rail | Pick two personas, they argue for three bounded turns, then stop. Bounded and cheap — no autonomy. |
| Refusal-with-handoff | An off-speciality question gets "that's Mary's — want me to loop her in?" with an `@Mary` chip. Teaches the org chart without a help page. |
| Idle barks surfacing rejected alternatives | "I still think we should've gone event-driven, but the client wanted REST" — the ADR's options-not-chosen section spoken aloud. Ties to the source finding that "I don't understand why" and "venting surfaces rejected alternatives" are the same idea. |

## Platform and packaging, deferred

| Item | Revisit when |
|---|---|
| Signing, notarization, auto-update, distribution | Someone other than the author is meant to install it. |
| Windows and Linux support | A non-macOS user appears. Platform-specific calls are confined to one module, so the port is additive. |
| Light theme | The mockup defines one dark palette; the spec assumes dark only. |
| Multi-project windows and cross-project state | One project per window is a spec assumption; nothing in the architecture depends on it staying true. |
| Long scrollback virtualization | A persisted transcript is long enough to measure. |
| The Agent SDK as the runtime | Only if the harness ever ships carrying its own API key. Rejected on authentication, not ergonomics — see `execution-model.md`. |

## Why these are tiered, not cut

The Won't list in SPEC.md Non-goals was cut on a principle: it was all **autonomy**. Nothing
here is autonomy — each item is more presence, more legibility, or more explanation. They lost
on budget, on a missing data source, or on platform reach, not on thesis.

---
title: 'The planning contract says what actually governs the build'
type: 'chore'
created: '2026-09-30'
status: 'done'
baseline_commit: '8d4bbf1d68410988f25a654cf8109646382ea5f7'
baseline_revision: '8d4bbf1d68410988f25a654cf8109646382ea5f7'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `epics.md` FR83 still has `run.stop(runId)` send `SIGINT`, the mechanism the stop spike disproved, and nothing in the corrected contract tells an implementer that FR83 is stale.
    evidence: |-
      `execution-model.md` *Stop and failure* now states the in-band interrupt and that `SIGINT` ends the session, and `SPEC.md` open question 1 is closed on that basis. FR83, FR87's `stop_reason` detector and FR90's Branch B carve-out in `epics.md` (and `epics.md:1643`) still describe the refuted mechanism; Story 3.7 implements FR83. `epics.md` is outside this story's boundaries and the finding is already recorded in `deferred-work.md` under the Story 1.1 entry. What would settle it: an amended Story 1.13 or a planning pass on `epics.md` that corrects FR83/FR87/FR90.
    location: >-
      _bmad/planning-artifacts/epics.md:FR83
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `SPEC.md` and its companions are the "complete, preservation-validated contract", but the Architecture Spine overrides parts of them (its *Spec Amendments Required* table), three external formats were written from memory and are wrong, and two UX decisions supersede architecture invariants. A reader implementing from the contract can build a rule that has already been superseded.

**Approach:** Reconcile the five files under `_bmad/specs/spec-bmad-visual-harness/` in place, documentation only. Every edit names the decision that overrides the old text, and no edit changes what any capability is for.

## Boundaries & Constraints

**Always:**
- **Audit before editing.** The companions already carry much of the amended substance (persona session, `skill`-or-`prompt`, `[agents.*]` roster, resolvers, prerequisites, concurrency, the collapsed card). For each of the eight amendments, read the current text; edit only where it is missing, imprecise, or uncited. Do not rewrite text that is already right.
- **The eight amendments** (`ARCHITECTURE-SPINE.md:340-353`; AD numbers from its headings): (1) runtime unit is a persona session, not a subprocess per skill (AD-18) — `execution-model.md`; (2) a menu entry carries exactly one of `skill` or `prompt` (AD-9) — `bmad-install-contract.md` and CAP-4; (3) authoritative roster is `_bmad/config.toml` `[agents.*]` (AD-10) — `bmad-install-contract.md`; (4) effective configuration comes from BMad's resolvers, not raw `customize.toml` (AD-8) — SPEC constraint and CAP-3 (CAP-3's success text and the install contract's roster must not say the persona→skill mapping or identity is read from `customize.toml`); (5) zero configuration is not zero prerequisites (AD-17) — SPEC constraint, CAP-1 and the contract's *Prerequisites*; (6) CAP-9's disagreement-and-decision structure is **not met in v1**, stated as such, deferred for want of a data source (`scope-tiers.md`); (7) personas may run concurrently (AD-11) — SPEC constraint and `execution-model.md`; (8) a non-active persona's card collapses to a live one-line state (AD-11), not prose plus the not-yet-written list — CAP-5 and `ui-surfaces.md`.
- **Three format corrections**, each citing the file it was read from, not recalled: (a) `execution-model.md` states the memlog's **open kind vocabulary** (the host skill supplies it; the writer enforces none; entries render as `(kind)` or `(kind by who)`) and that **entries carry no per-entry timestamp** (the only time is the file-level `updated:` frontmatter) — cite `_bmad/scripts/memlog.py` docstring; (b) `bmad-install-contract.md` states the sprint status file's `development_status` is a **flat map** (`epic-N`, `N-M-<slug>`, `epic-N-retrospective` share one namespace; structure is in key shape) with a **six-value** vocabulary — `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`, `optional` — replacing the "planned, started and unstarted" three-way reading; cite `.claude/skills/bmad-sprint-planning/sprint-status-template.yaml`; the harness v1 still reads presence only (FR10, epics.md:40); (c) `ui-surfaces.md` drops `§N of M` from the rail row's states (`writing · §N`, `stopped · §N`); cite `EXPERIENCE.md:239` ("the denominator is deleted … the rail annotation loses its denominator too"). The same `of M` rule is stated for the card in `execution-model.md` *Progress against a plan*, which still calls for a denominator: correct it to the head reading `writing · §N <Name>` with the predicted plan feeding the foot's not-yet-written list, headings-win and never-renumber rules unchanged.
- **Two UX supersessions**, each naming the overriding decision: the party side panel is **240px** in place of AD-14's 288px (`DESIGN.md:465-471`, `epics.md` UX-DR8); the portrait legibility floor is **32px** in place of AD-16's "legible from 20px" (`DESIGN.md:536`, `epics.md` FR79), the 20px case served by the initials token (FR82). Record in `ui-surfaces.md` (party side panel; Portraits section — its "20px in stacked faces" line is the superseded reading).
- **Citation form.** Each edit carries a short parenthetical or sentence naming its source — e.g. `(ARCHITECTURE-SPINE.md AD-11)` — using relative paths from the file being edited. The SPEC already lists the spine in `companions:`.
- **Open questions.** `SPEC.md` open question 1 (can a run be stopped without ending the session) was settled by the stop spike; mark it closed with the answer and cite `execution-model.md` *Stop and failure* and `../../spikes/spike-stop-semantics.md`. Questions 2 and 3 are product judgements and stay open.
- Preserve each file's existing voice, heading structure and line wrapping; a SPEC edit stays one or two sentences.

**Never:**
- Never change a capability's intent, success criteria beyond the stated amendments, a non-goal, or the order/number of CAPs. CAP-9 is *annotated* as not met, not rewritten or removed.
- Never touch `epics.md`, `ARCHITECTURE-SPINE.md`, `EXPERIENCE.md`, `DESIGN.md`, any source or test file, `package.json`, the mockup or the spikes. The deferred findings recorded for Story 1.1 (FR83 `SIGINT`, FR87 `stop_reason`, FR90, `epics.md:1643`) live in frozen files and are out of scope here; do not edit `deferred-work.md` for them.
- Never add a requirement, a new companion file, or a fact not verified against a file named in this spec. Never edit `.memlog.md` under the spec folder.
- Never write copy that guides the user to a next step; these are contract documents, not UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Amendment already present | `execution-model.md` already says persona session | cite AD-18 if uncited; no rewrite | — |
| Amendment absent or stale | `ui-surfaces.md` rail states carry `of M` | corrected, with the superseding source named | — |
| Source disagrees with spec | memlog or sprint status format differs from what the spec says | the file read wins; the spec states what the file shows and cites it | — |
| Out-of-scope superseded text | FR83 `SIGINT` in `epics.md` | left alone | already recorded in `deferred-work.md` |

</intent-contract>

## Code Map

All under `_bmad/specs/spec-bmad-visual-harness/` (read in planning; line numbers as of baseline):
- `SPEC.md` -- CAP-3 `:42` (success still correct; no `customize.toml` claim), CAP-4 `:46` (skill-or-prompt already stated, uncited), CAP-5 `:50` (collapsed card present, uncited), CAP-9 `:66` (deferral present, not stated as "not met in v1"), constraints `:82` (concurrency), `:86` (resolvers), `:88` (prerequisites), Open Questions `:129-131`. `companions:` already lists the spine.
- `execution-model.md` -- runtime `:8-44` (persona session; cites AD-18 at `:5`), *What feeds which surface* `:46-74`, **Progress against a plan `:76-89`** (still demands a denominator), *Stop and failure* `:107-132` (already carries the spike result), *Filesystem watcher constraints* `:145-152` (memlog atomic rename; add the vocabulary and timestamp facts near `:73-74` / `:161-163` where `.memlog.md` is named).
- `bmad-install-contract.md` -- resolvers `:6-25`, roster `:27-44` (already `[agents.*]`), menu `:46-62` (already one-of), **Project state `:76-87` (`:80` "planned, started and unstarted")**, prerequisites `:91-100`. AD-8/9/10/17 uncited.
- `ui-surfaces.md` -- rail row states `:24-27` (**`writing · §N of M`**, **`stopped · §N of M`**), card `:51-75`, party side panel `:91-95` (no width stated; the token contract it defers to `:5-8` still says 288), Portraits `:110-119` (**"20px in stacked faces"**).
- `scope-tiers.md` -- CAP-9 deferral `:7-23`; likely no edit beyond a cross-reference.
- Evidence to read, not edit: `ARCHITECTURE-SPINE.md:120-204` (AD-7…AD-21), `:340-353`; `_bmad/scripts/memlog.py:1-60` (open vocabulary, `updated:` only); `.claude/skills/bmad-sprint-planning/sprint-status-template.yaml`; `EXPERIENCE.md:239`; `DESIGN.md:465-471,536`; `epics.md:40,83,234,136,972-975`.

## Tasks & Acceptance

**Execution:**
- `_bmad/specs/spec-bmad-visual-harness/SPEC.md` -- cite AD-9/8/17/11 on CAP-4, the resolver and prerequisite constraints, concurrency and CAP-5's collapsed card; state CAP-9's disagreement-and-decision structure is not met in v1; close open question 1 citing the spike -- amendments 2, 4–8
- `_bmad/specs/spec-bmad-visual-harness/execution-model.md` -- add the memlog's open kind vocabulary and absence of per-entry timestamps (cite `memlog.py`); replace the `of M` denominator in *Progress against a plan* with the no-denominator head and foot list (cite `EXPERIENCE.md`); confirm AD-18 and AD-11 are cited at the runtime and concurrency text -- amendments 1, 7; format (a)
- `_bmad/specs/spec-bmad-visual-harness/bmad-install-contract.md` -- cite AD-9, AD-10, AD-8, AD-17; replace the sprint status three-way reading with the flat map and six-value vocabulary (cite the template) while keeping "presence only in v1" -- amendments 2–5; format (b)
- `_bmad/specs/spec-bmad-visual-harness/ui-surfaces.md` -- drop `of M` from the rail row states; record the party side panel as 240px (not 288px) and the portrait floor as 32px (not 20px), naming `DESIGN.md` and the epics ids; cite AD-11 on the collapsed card -- amendment 8; format (c); both supersessions
- `_bmad/specs/spec-bmad-visual-harness/scope-tiers.md` -- only if needed: point the CAP-9 deferral at SPEC's "not met in v1" wording -- amendment 6

**Acceptance Criteria:**
- Given the spine's *Spec Amendments Required* table, when the files are read, then all eight amendments are stated in `SPEC.md` or its companions (persona session; one of `skill`/`prompt`; `[agents.*]` roster; resolvers over raw `customize.toml`; zero configuration is not zero prerequisites; CAP-9's disagreement structure not met in v1; concurrent personas; non-active card collapses to a live one-line state), each edit citing the AD or document that overrides it
- Given the three mis-specified formats, then `execution-model.md` states the open kind vocabulary and no per-entry timestamp, `bmad-install-contract.md` states the flat map and six-value vocabulary and no longer says "planned, started and unstarted", and `ui-surfaces.md` rail states carry no `§N of M`; each cites the file it was read from, and each fact matches that file when re-checked
- Given the two UX supersessions, then `ui-surfaces.md` records 240px in place of 288px and a 32px floor in place of 20px, each naming `DESIGN.md` and the epics requirement that overrode it
- Given every edit, then none changes a capability's intent: the CAP list, ids, intents and non-goals are unchanged, and `git diff --stat` touches only files under `_bmad/specs/spec-bmad-visual-harness/` plus this spec and the sprint status
- Given the contract's cross-references, then every `.md` path or `AD-N`/`DESIGN.md`/`EXPERIENCE.md` line cited in an edit resolves to a real file and heading
- Given the repo gates, then `npm run lint`, `npm run typecheck` and `npm test` still exit zero (nothing in `src/` or `tests/` changed)

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass
- verdicts: 18 findings — high 0, medium 1, low 17, false 0, maybe-false 0 (Blind Hunter 10, Edge Case Hunter 7, Verification Gap 0, Intent Alignment 1 descriptive)
- findings:
  - `[low]` `[patch]` Blind Hunter: the sprint-status vocabulary is incomplete — it omits `action_items`/`open`, presents `optional` as the retrospectives' only value (a held one is `done`), and cites an example template — patched: the bullet now says `optional` is for a retrospective not yet held, names `action_items` as a separate top-level list with its own `open` status, and cites this project's own `sprint-status.yaml` beside the template.
  - `[low]` `[reject]` Blind Hunter: the CAP-3 edit blurs the persona→skill mapping with the roster — the roster (AD-10, `[agents.*]`) is what feeds the portrait, name and title CAP-3 names, the edit cites AD-8 and AD-10 for exactly those two claims, and CAP-4 carries the menu/skill side; nothing is claimed that the spine does not state.
  - `[low]` `[reject]` Blind Hunter: citation form is inconsistent (bare `ARCHITECTURE-SPINE.md` in some files, full relative path in others) — the bare name is each file's existing convention (`execution-model.md:5` already reads that way) and `SPEC.md` lists the spine in `companions:`; uniform full paths would add clutter at about eight sites for no reader gain.
  - `[low]` `[patch]` Blind Hunter: the 288px sentence says "the token contract above" though the contract lives in the spine — patched: the sentence now says "the spine's token contract", and the file's opening paragraph states that this file's supersessions (party panel width, portrait floor) override the spine's literals.
  - `[low]` `[reject]` Blind Hunter: the spec folder's `.memlog.md` still carries `§N of M` — it is the historical decision log, append-only by design, and not part of the contract the companions list; editing it is forbidden by the spec and would rewrite history.
  - `[low]` `[patch]` Blind Hunter: the portrait citation names a *Legibility* heading that is a bold lead-in, not a heading — patched: it cites the paragraph under the `### Portrait` heading.
  - `[medium]` `[defer]` Blind Hunter: `SPEC.md` now says `SIGINT` ends the session while `epics.md` FR83 still has the harness send it — pre-existing (the Story 1.1 deferral already records it), in a file outside this story's boundaries; carried into the `deferred` list above.
  - `[low]` `[patch]` Blind Hunter: line wrapping was not preserved — patched: the `ui-surfaces.md` portrait paragraph and the `scope-tiers.md` CAP-9 sentence are reflowed to the files' ~100-column wrap.
  - `[low]` `[reject]` Blind Hunter: this spec's own bookkeeping is thin (empty logs, sprint status not in the diff, grep is a negative check) — the logs are filled by this pass, the sprint status is the finalisation step after review, and the fix is to edit the spec; the positive checks are the manual source re-reads the Verification section names, which the review re-ran.
  - `[low]` `[reject]` Blind Hunter: the closed open question carries no date and a bold "Closed." that differs from the others' voice, and diverges from the spine's "1 and 2 closed" — the spine row was written against an earlier question list, which the Design Notes record; a date adds nothing, since the spike evidence is cited.
  - `[low]` `[patch]` Edge Case Hunter: the memlog render forms omit `(by who)` for an entry with `--by` and no `--type` — patched: the bullet now lists `(kind)`, `(kind by who)`, `(by who)` and the plain note, as `memlog.py`'s docstring states.
  - `[low]` `[patch]` Edge Case Hunter: the sprint-status bullet does not say an unrecognised status must degrade (FR10) — patched: added.
  - `[low]` `[patch]` Edge Case Hunter: the format correction omits the `MM-DD-YYYY HH:MM` timestamp format and the `action_items` list — patched together with the first row.
  - `[low]` `[reject]` Edge Case Hunter: `stopped · §N` has no stated rendering when no section was in flight — inventing that rendering is a new decision no source makes; the rail annotation is derived from the last confirmed write, and an absent section number is an Epic 3 question when the annotation is built.
  - `[low]` `[patch]` Edge Case Hunter: "not a three-way reading" and "replaces an earlier reading" negate a reading the contract no longer states — patched: the sprint-status bullet now names it (`planned` / `started` / `unstarted`).
  - `[low]` `[reject]` Edge Case Hunter (claim): citations are not uniformly "relative paths from the file being edited" — same as the Blind Hunter citation-form row.
  - `[low]` `[patch]` Edge Case Hunter (claim): the token-contract paragraph at the top of `ui-surfaces.md` still defers to the spine's 288px with no pointer — patched with the Blind Hunter 288px row (the opening paragraph now names the two supersessions).
  - `[low]` `[reject]` Intent Alignment (descriptive): the intent's second half — commit and close — sits on the tracking and version-control surface the diff does not contain — those are this run's finalisation steps (sprint status, then commit), done after review; the first half matches the story's epics.md acceptance criteria.

## Design Notes

**Why "audit before editing".** The spine's amendment table was written when the companions still said otherwise; the companions were later brought in line with most of it (and the stop spike with the rest of `execution-model.md`), without citations. Rewriting settled text risks drift for no gain; the remaining defect is mostly missing provenance plus the three formats and the two supersessions, which were never applied.

**Why the card's denominator is in scope.** The AC names only the rail row, but `EXPERIENCE.md:239` states one rule for both (a counter going 9 → 15 reads as a defect), and `execution-model.md` is the file an implementer reads for the card. Leaving its `§4 of 9` would keep exactly the superseded rule this story exists to remove.

**Why open question 1 only.** The spine row says questions 1 and 2 are closed, but it was written against an earlier question list; the current `SPEC.md` questions 2 (continuity in transcript vs process) and 3 (queued composer) are judgements the spine does not settle.

## Verification

**Commands:**
- `grep -nE 'of M|planned, started|20px in stacked|customize\.toml' _bmad/specs/spec-bmad-visual-harness/*.md` -- expected: no stale `§N of M` on a rail row, no "planned, started and unstarted", no persona→skill mapping read from `customize.toml` as authority; remaining hits are deliberate (the amendment's own "raw `customize.toml` omits overrides" wording)
- `git diff --stat` -- expected: only files under `_bmad/specs/spec-bmad-visual-harness/`
- `npm run lint && npm run typecheck && npm test` -- expected: all exit zero

**Manual checks (if no CLI):**
- Re-open `memlog.py`, `sprint-status-template.yaml`, `EXPERIENCE.md:239`, `DESIGN.md:465-471,536` and confirm each fact written matches its source verbatim in substance
- Read `SPEC.md` top to bottom: CAP intents unchanged, CAP-9 reads as not met in v1

## Auto Run Result

Status: done

**What was implemented.** The planning contract under `_bmad/specs/spec-bmad-visual-harness/` now states what governs the build, and each edit names its source. An audit first showed the companions already carried most of the eight spine amendments (persona session, `skill`-or-`prompt`, `[agents.*]` roster, resolvers, prerequisites, concurrency, collapsed card) without citing the decision behind them; those now cite AD-8, AD-9, AD-10, AD-11, AD-17 and AD-18, and CAP-9 is stated as **not met in v1**. Three formats were corrected from the files they were read from: `execution-model.md` states the memlog's open kind vocabulary and the absence of per-entry timestamps (`memlog.py`); `bmad-install-contract.md` states the sprint status file's flat map and six-value vocabulary, timestamp format, separate `action_items` list and degrade-on-unknown rule, in place of the three-way reading (the sprint-planning template and this project's own file); and `ui-surfaces.md` drops `§N of M` from the rail states (`EXPERIENCE.md`). The same denominator rule is applied to the card in `execution-model.md` *Progress against a plan*. `ui-surfaces.md` records the party side panel at 240px in place of AD-14's 288px and the portrait legibility floor at 32px in place of AD-16's 20px, naming `DESIGN.md` and the epics ids. `SPEC.md` open question 1 is closed on the stop spike's evidence; questions 2 and 3 stay open. No capability's intent changed.

**Files changed.**
- `_bmad/specs/spec-bmad-visual-harness/SPEC.md` — AD citations on CAP-1, CAP-3, CAP-4, CAP-5 and the concurrency, resolver and prerequisite constraints; CAP-9 not met in v1; open question 1 closed.
- `_bmad/specs/spec-bmad-visual-harness/execution-model.md` — denominator removed from *Progress against a plan*; memlog vocabulary and timestamp bullet; AD-11 cite.
- `_bmad/specs/spec-bmad-visual-harness/bmad-install-contract.md` — AD-8/9/10/17 cites; sprint status format.
- `_bmad/specs/spec-bmad-visual-harness/ui-surfaces.md` — rail states without `of M`; AD-11 cite; 240px panel; 32px floor; opening note that those two override the spine.
- `_bmad/specs/spec-bmad-visual-harness/scope-tiers.md` — CAP-9 deferral points at "not met in v1".
- This spec.

**Review findings.** 18 findings across four layers (Blind Hunter 10, Edge Case Hunter 7, Verification Gap 0, Intent Alignment 1) — 0 high, 1 medium, 17 low. Patches applied (9 rows, all low): sprint-status vocabulary completeness, unrecognised-status degrade, timestamp format and `action_items`, naming the replaced three-way reading, the `(by who)` memlog form, the 288px pointer, the portrait citation heading, and two reflowed paragraphs. Deferred (1, in frontmatter): `epics.md` FR83 still sends `SIGINT`, in a file outside this story's boundaries and already recorded under the Story 1.1 deferral. Rejected with reasons: see the triage log — the heavier ones are the CAP-3 roster wording (accurate to AD-10), bare spine citations (the files' existing convention), the historical `.memlog.md` still carrying `of M`, and `stopped · §N` with no section (a decision no source makes).

**Follow-up review recommended: false.** No high and no two mediums were patched; the nine patches were low-severity wording and citation fixes, each re-checked against its source.

**Verification.** `npm run lint`, `npm run typecheck` and `npm test` exit zero after the patches (1345 tests across 65 files, unchanged — no code or test changed). The spec's grep finds no `of M`, no "planned, started" and no "20px in stacked" outside the one unrelated "six of Mary's ten entries" match; the remaining `customize.toml` hits are the deliberate "raw omits overrides" wording. Every cited relative path resolves (`../../scripts/memlog.py`, `../../spikes/spike-stop-semantics.md`, `../../../.claude/skills/bmad-sprint-planning/sprint-status-template.yaml`, the planning documents, the project's `sprint-status.yaml`). The memlog, sprint-status, `EXPERIENCE.md`, `DESIGN.md` and spine facts were re-read against their sources. The I/O matrix rows are documentation audit cases with no test surface; each was checked by the grep and source re-reads above, not by an automated test. `git diff --stat` touches only the five spec files plus this spec; the sprint status is updated in the finalisation step.

**Residual risks.** The spine's AD-14 still says 288px and AD-16 still says 20px (frozen, `ui-surfaces.md` says they are overridden); `epics.md` FR83/FR87/FR90 still describe the refuted stop mechanism (deferred above). The `.memlog.md` decision log under the spec folder still carries the superseded `of M` text by design. An earlier full `npm test` run during implementation hit the known intermittent real-watcher failures (`watch-artifacts`, `watch-install`) on some runs; both of this pass's runs were green and nothing under `src/` or `tests/` changed.

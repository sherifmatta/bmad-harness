# Validation Report — bmad-harness

- **DESIGN.md:** `/Users/sherifmatta/Learnings/bmad-harness/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md`
- **EXPERIENCE.md:** `/Users/sherifmatta/Learnings/bmad-harness/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md`
- **Run at:** 2026-10-09T13:23:04-0400

## Overall verdict
The pair is usable as a contract. No colour token lacks a hex, every token reference (including the new initials sizes) resolves except the pre-existing opacity group, DESIGN.md's section order is canonical, and EXPERIENCE.md has every required default. Nothing is critical; two findings are high.

The 2026-10-09 chat-look edit landed cleanly where it rewrote things (flat row, initials disc, inline clock time, the handoff wording, the run-list mode names). It left residue where it did not rewrite (the Layout binding-constants table, Typography head, Shapes card, Elevation's inset rule, the portrait mockup's description) and it opened three real gaps: a header Stop with no command for a plain chat turn, a handoff line whose skill half no v1 flow can produce, and a party live turn whose ground and edge are undecided.

## Category verdicts
- Flow coverage — adequate
- Token completeness — adequate
- Component coverage — thin
- State coverage — adequate
- Visual reference coverage — adequate
- Bloat & overspecification — adequate
- Inheritance discipline — adequate
- Shape fit — adequate
- Consistency of the 2026-10-09 chat-look edit — mostly consistent, with leftovers

## Findings by severity

### Critical (0)

### High (2)

**[Token completeness]** — 26 light-theme token names have no dark entry in colors (§ DESIGN.md:126-151, 311, 370, 392-396, 406-408, 471, 497, 932, 994, 998)
The dark values of cast-speaking-*, send-*, tile-current, scrollbar-thumb*, win-light, status-pill-*, party-live-ground and others live only as literals in components and prose. That is the defect AD-14 names and it breaks 'no component names a theme': a component with #393939 is correct in dark only. Verified: 26 light-only names.
Fix: Add the dark values to colors under the same 26 names and make the components reference them. The code's tokens.css already names both sets.

**[Component coverage]** — Header Stop has no command for a plain chat turn (§ EXPERIENCE.md:154, 690)
The spine says Stop dispatches run.stop(runId) and is the same stop for the turn in flight. A plain chat turn is not a run and has no runId. Verified: commands.ts has only run.stop and session.close.
Fix: Decide: Stop appears only while a run is in flight (a chat turn in flight shows close session), or hand a turn.stop command to bmad-architecture. Resolve together with the open Stop vs close session item.

### Medium (21)

**[Flow coverage]** — Key Flows claim overreaches; CAP-1 and CAP-7 have no flow (§ EXPERIENCE.md:58, 997)
The intro says the three flows are what every rule was derived from, but Welcome, Theme, Output folder, Resizing, the Board and the chat look came later with no flow, and zero-config discovery with its preflight failure (CAP-1) and reviewing a finished document in its own window (CAP-7) have none.
Fix: Reword the claim, and add one short Flow 4: Welcome, open a folder, a Preflight check 3 failure, a second open that succeeds, a document opened from the rail.

**[Flow coverage]** — Tile click and @name triggers for the handoff are not in the tables (§ EXPERIENCE.md:147, 178)
Flow 3 says a tile click opens a new process and emits the sysline. Neither Component Patterns nor Interaction Primitives says that, and nothing says what a click on a persona who already has a live session does.
Fix: Add the trigger and the already-has-a-session case to the Persona tile row and the @<name> row.

**[Token completeness]** — {opacity.idle} points at a group that does not exist (§ DESIGN.md:1028, 1057; EXPERIENCE.md:669)
The cast-card opacities .42/.72/1 and the file icon .75 are literals. EXPERIENCE also states a CSS variable name, which its own rule forbids.
Fix: Add an opacity group (idle, hover, speaking, icon) and reference it; in EXPERIENCE use {opacity.idle}.

**[Token completeness]** — Chat header and Run step have no components entry; dimensions are prose literals (§ DESIGN.md:858, 919-922)
Header 46px, 0 16px, 10px gaps, Stop 3px 10px; step grid 14px · 1fr · auto, 9px gap, 3px padding. Run note has a grid token; these two do not. initials.threadFont is a prose string with literals. Document-card has no run-list head tokens.
Fix: Add chat-header and run-step to components, add spacing.chat-head, express threadFont through role tokens.

**[Token completeness]** — Binding constants table is stale against the frontmatter (§ DESIGN.md:659, 666, 674, 255, 703)
Rail 348px, two halves, 'portrait 32 transcript / 38 chat header', 'chat sub-line max 72ch' all predate the three-column layout and the one-line header. The responsive bullet still describes the rail moving below with two halves.
Fix: Rewrite the rows (sidebar, rail, header, portrait sizes), delete spacing.chat-sub-max, align the responsive bullet with EXPERIENCE.md:673.

**[Token completeness]** — Running step's elapsed is drawn at faint while EXPERIENCE says it carries the liveness (§ EXPERIENCE.md:283; DESIGN.md:862, 933)
Under reduced motion 'now' carries the liveness, but faint is 3.5:1 and the accessibility rule forbids a faint string as the only carrier of a fact. The contrast table has no row for the initials discs.
Fix: Draw the running step's elapsed at dim; add the two disc pairs to the table; state the clock time restates nothing load-bearing.

**[Component coverage]** — No behavioural row for Conversation turn, Chat header, Run step, Run note, Status dot, Tags, Follow control, Splitter, Folder heading, Outputs head, Welcome (§ EXPERIENCE.md Component Patterns)
Behaviour exists in dedicated sections, but a consumer extracting from the table finds nothing and no pointer. Chat header and Run step are the two just added.
Fix: Add one row each, pointing to the owning section.

**[Component coverage]** — Two phantom components: the handoff chip and stacked faces (§ DESIGN.md:293, 628, 738-740, 804-807, 891)
Specified in DESIGN with no Components row and no EXPERIENCE behaviour; their only named v1 consumers are cut (refusal-with-handoff is banned for v1, the party stack-face panel is deferred).
Fix: Mark both deferred with the source of need, or remove them and rounded.pill.

**[Component coverage]** — Named but never given a visual spec: install chip, branch chip, status pill, run chip, end-session control, close session (§ EXPERIENCE.md:81, 191; DESIGN.md:627, 732, 922)
The status pill has only light-theme tokens and the header spec says 'the existing status pill'.
Fix: Add anatomy rows, or mark each 'as built, not respecified'.

**[Component coverage]** — Document card head disagrees across the two files (§ DESIGN.md:836; EXPERIENCE.md:263, 800)
DESIGN draws the run-list head as skill name, run, working, elapsed, always. EXPERIENCE says a phase word shows only if a feed states one, else path or skill name and elapsed, and never says where the phase word sits relative to working.
Fix: State one head grammar for run-list mode: the slot for the phase word, whether working is always shown, its colour.

**[State coverage]** — Two run-card states are undefined (§ EXPERIENCE.md:265, 761, 823)
(1) Between run:started and the first note or step the expanded body has nothing to draw, contradicting 'the card never has an empty body'. (2) The finished row says 'saved · just now · N sections', false for a run that writes no document, and Voice and Tone rule 3 forbids claiming what did not happen.
Fix: Define the empty-at-start body (the head's working plus elapsed is already there; say so), and add a 'finished, no document' row.

**[State coverage]** — Steps are absent from the accessibility policy; the keyboard table omits several controls (§ EXPERIENCE.md:976, 939-954)
Notes are announced politely; steps are not covered and the check and cross marks need accessible names. The Keyboard reach table omits the header Stop/close session, Inbox rows, Board cards and Message actions.
Fix: Add rows; decide steps are not announced (the run lifecycle is) and say why.

**[Visual reference coverage]** — DESIGN.md says 'the screenshot' five times but never names or links it; both sources lists are incomplete (§ DESIGN.md Conversation turn, Initials, Chat header, Run step, Document card)
A DESIGN-only reader cannot resolve it. DESIGN's sources omits files its body links; EXPERIENCE's omits document-card-dead-air.html and the PNG.
Fix: Link the PNG at Conversation turn and Chat header; reconcile both sources lists.

**[Visual reference coverage]** — Three linked mockups still draw what the spine now rejects (§ follow-the-thread, rail-resize-collapse, light-a-shell; DESIGN.md:750)
Container turns, a washed user turn with a left rule, and 32px portraits in the thread. portrait.html is described as showing portraits 'in context on tiles, turns and cast cards'. The spines-win sentence appears per mockup, not once.
Fix: State spines-win once near the top of each file and add 'turn rendering here is superseded by the chat look' to the four links.

**[Bloat & overspecification]** — The contract carries its own changelog (§ 44 dated annotations; EXPERIENCE.md:657, 756-775, 136)
'Amended / Replaces / Added' prose, Dead Air options B and C, the 68,394-byte evidence narrative, the Paperclip provenance paragraph, the palette-A history. The memlog already holds this.
Fix: Keep the current rule and one reason; move history to .memlog.md.

**[Inheritance discipline]** — Source clauses the chat look contradicts are not acknowledged as superseded (§ SPEC.md CAP-3, CAP-10; ui-surfaces.md; scope-tiers.md)
CAP-3 ('portrait, name, title and state render in the chat header'), CAP-10, ui-surfaces portrait sizes and the party transcript line, 'dark theme only'. The memlog override names only AD-16; the spines name no CAP. Architecture and story-dev derive from CAP-3.
Fix: Add a short Supersedes list, as done for 288px and the 20px floor, naming each clause and the date.

**[Inheritance discipline]** — Name drift left by the edit (§ DESIGN.md:636, 645; EXPERIENCE.md:146, 178, 474, 655, 702, 899, 908, 942)
Typography head is 'chat-header persona name' at 14px but the header uses name at 12.5px; Voice and Tone says persona voice is body-ui while turn words are base; role vs title; stale names 'Persona tile | rail', 'Rail — Team half', 'View switch toggles 1:1 ↔ Party', 'one switch, no third view'; Context panel vs rail vs right panel.
Fix: Pick one term each and sweep.

**[Inheritance discipline]** — EXPERIENCE says it never uses a literal size yet restates several; the new initials tokens are never referenced from it (§ EXPERIENCE.md:32, 149, 681, 987)
26px, 22px, 20px, the 24px follow threshold, 16/64px key steps.
Fix: Use the tokens; keep behavioural numbers as behaviour constants and say so.

**[Chat-look consistency]** — (a) Portrait residue in four places (§ DESIGN.md:674, 750, 636, 255, 1057)
Binding constants still lists 32 transcript and 38 chat header; portrait.html described as showing 'turns'; Typography head is the chat-header name; Board Agents says 'portrait or initials' without choosing.
Fix: See token 4, visual 2 and inheritance 2.

**[Chat-look consistency]** — (b) The party live turn is half-decided (§ DESIGN.md:716, 734, 146, 914; EXPERIENCE.md:692)
Conversation turn keeps 'the one inset rule left' as an assumption, but Elevation states it as fact, Shapes card still lists conversation turn and party turn as 6px containers, and party-live-ground is neither kept nor removed. A flat row with a ground and a rule is not a flat row.
Fix: Decide edge and ground together, drop both from the card row, flag Elevation.

**[Chat-look consistency]** — (d) The '· <skill>' half of the handoff line has no v1 producer (§ EXPERIENCE.md:178, 182, Flow 3; Voice and Tone Do example)
Tile click and @name never name a skill, and Flow 3 says none is named, yet the Do example shows 'handed to Amelia · bmad-build'. The skill-name source is not handed to architecture.
Fix: Say the skill half is dormant until a handoff-with-skill exists or drop it from the example. Handed to the architecture task.

### Low (21)

**[Flow coverage]** — Flow 2 has no failure path (§ EXPERIENCE.md Flow 2)
Party has a stop and a summary write that can be refused (output folder gone).
Fix: One italic Failure line.

**[Flow coverage]** — Flow 1 step 4 describes the card body as the run-note feed alone (§ EXPERIENCE.md:286)
With the run list in force, steps join the list once the main-side event exists.
Fix: One clause.

**[Token completeness]** — accent-wash and accent-edge retained with no owner (§ DESIGN.md:61-62, 107-108)
Kept 'until a story removes it'; the code still has --inset-turn-user.
Fix: Delete them from the contract and let the removing story cite the memlog.

**[Component coverage]** — DESIGN Tags specify labels that EXPERIENCE says v1 ships none of (§ DESIGN.md:867-872; EXPERIENCE.md:131, 899)
evidence, concedes · partly, disagrees · <name>, unresolved.
Fix: Label the deferred ones in DESIGN.

**[State coverage]** — Unspecified failure states
Board with a missing or malformed sprint-status.yaml; a document window whose file is deleted while open; a session that exits unexpectedly mid-session.

**[State coverage]** — Three elapsed formats with no rule (§ EXPERIENCE.md:312)
'working · 0s', '4m 12s' and '0:03'.
Fix: One format note in Typography or Voice and Tone.

**[State coverage]** — Run list ordering and rules not fully stated (§ DESIGN.md:845, 858)
A running step stays where it started when a note arrives under it; steps have no rule between rows while consecutive notes have a line-soft rule, and the two are interleaved.

**[Visual reference coverage]** — Orphans (§ DESIGN.md:563)
welcome-screen.html is unreferenced; light-b-shell and light-b-welcome appear only as the unlinked glob light-b-*.

**[Bloat & overspecification]** — Portrait geometry restates the mockup and AD-16 (§ DESIGN.md:765-775)
Draw order, per-shape opacities and colours.
Fix: Keep invariants only: purity, light source, parameters, derivation.

**[Bloat & overspecification]** — Proposed anatomy specifies unbuilt surfaces to token level (§ DESIGN.md:1018-1060)
'Which become stories is not yet chosen.'

**[Bloat & overspecification]** — Light-theme derivation list restates the hexes in colors-light (§ DESIGN.md:563-574)

**[Inheritance discipline]** — 'the dedicated note-blue token' is stale (§ EXPERIENCE.md:239)
note is #8e8e93 grey.

**[Inheritance discipline]** — Ids cited that are not in sources (§ FR78, FR94, NFR23, NFR27, UX-DR12, Story 1.1, Story 3.14, epics.md)
Fix: Add epics.md to sources or cite the capability instead.

**[Shape fit]** — DESIGN has a Responsive subsection; EXPERIENCE has no Responsive section (§ EXPERIENCE Resizing, Following the thread, Layout)
Behaviour at ≤1180 and ≤1000px is spread across three sections.
Fix: A three-line pointer section.

**[Shape fit]** — Both files are status: final while four items are open (§ both frontmatters)
Stop vs close session, party live turn, skill-name source, register split.
Fix: Keep final with an Open items list (see below).

**[Chat-look consistency]** — (a) CAP-3, CAP-10 and ui-surfaces still require portraits in the header and transcript (§ SPEC.md; ui-surfaces.md)
Fix: See inheritance 1.

**[Chat-look consistency]** — (b) No Do's and Don'ts row for the flat row; message actions anchor to a box (§ DESIGN.md:1044)
Fix: Add the row; say 'the turn row'.

**[Chat-look consistency]** — (e) Run-list leftovers (§ DESIGN.md:1072, 612)
The Do's and Don'ts register-split row and the 'do not add a label' sentence were not amended for steps; head grammar, elapsed colour and states are covered above.

**[Chat-look consistency]** — (g) The four open items carry different tags (§ both files)
Stop vs close session is ASSUMPTION — OPEN; the party edge, skill-name source and register split are tagged inconsistently or not at all, so a grep finds one of four.
Fix: Tag all four [OPEN] and list them once near the top of each file.

**[Chat-look consistency]** — (h) AD-3 overstated for skill names (§ EXPERIENCE.md Voice and Tone)
AD-3 keeps resolved names out of the renderer; main does resolve skill entries. The real gap is that the renderer's event carries only the menu code.
Fix: Say that.

**[Chat-look consistency]** — (h) AD-11 mis-cited for the stop control and 'four mandated fields' (§ EXPERIENCE.md:690, 821)
Stop is CAP-11 and run.stop; the four fields are CAP-5 plus the collapse line.
Fix: Cite CAP-11 and CAP-5.

## Reviewer files
- `review-rubric.md`

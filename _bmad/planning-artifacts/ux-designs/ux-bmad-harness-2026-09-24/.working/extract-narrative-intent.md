# Extraction — brainstorm-intent.md (+ .memlog.md and mockup in-world copy)

Sources: `[intent]` brainstorm-intent.md · `[memlog]` the brainstorm's own log (user quotes tagged `(idea by user)` etc.) · `[mockup]` harness-mockup.html in-world copy

## 1. Emotional and experiential intent

**The governing feeling: presence**
> "A desktop harness that you point at any BMad-installed project and **it becomes a room where the BMad team visibly works**." `[intent]`
> "make the method feel **interactive and present — like having a whole company at your fingertips** — instead of a flat list of terminal prompts." `[intent]`
> "**Presence, not autonomy.** … The harness's job is not to make the agents *do* more — it is to make them ***visible***." `[intent]`

**Working with people, not agents**
> "The value isn't fixing pain - it's that this doesn't exist today. '**Working with PEOPLE, not agents**': bouncing ideas off each other, reaching a conclusion together, then going off to build it" `[memlog]`
> "'Working with people not agents' + 'disagreement is a thrill' + party mode are **one idea wearing three hats. Party mode is the product's heart, not a feature**" `[memlog]`

**Thrill (explicitly named)**
> "Team disagreement is a **THRILL, not stress** - 'we're digging deeper for the best idea'. **Friction is a feature: the harness should stage productive conflict, not a chorus of agreement**" `[memlog]`

**Belonging to a real organization**
> "The money moment that proves it: watching the PRD write itself, John pushing back on you, and a face attached to him. **The combination is what makes it feel like part of a real organization.**" `[intent]`

**Legibility as a feeling**
> "it is the BMad feature most crippled by the terminal (**five speakers collapsing into one undifferentiated wall of text**). **The face solves real legibility here, not just charm.**" `[intent]`

**Understanding the *why* — the emotional root of the stall**
> "the stall is '**I dont know which command comes next, and sometimes I dont understand WHY**'" `[memlog]`
> "'I dont understand WHY' and 'venting surfaces rejected alternatives' are the same idea - **the missing why lives in what was considered and not chosen**" `[memlog]`
> "**the driest box in any ADR becomes the most interesting thing on screen**" `[memlog]`

**Watching, not being told**
> "**you WATCH the why instead of being told it**" `[memlog]`
> "**Documents write VISIBLY and live** — **the authoring is the UI, not a spinner.** This is the core demo beat." `[intent]`

**Honesty as a designed feeling**
> "the binding decision is that **the trade is stated to the user, never hidden**." `[intent]`
> "**Does a queued composer read as honest, or as broken?**" `[intent]`
> "Indicator carries the alert, **conversation carries the meaning**." `[intent]`
> "I lean B, but **I'd rather be wrong out loud** than have you discover FR-7 in a review three weeks from now." `[mockup]`

**Feelings to avoid**
| Avoid | Verbatim |
|---|---|
| Childish / game-like | "**Top risk: it feels childish, too game-like, and loses the perceived intelligence**" |
| Just another prompt box | "**Must not feel like just another chat box for prompting an AI.** If it reads as a prompt window with a portrait glued on, **it has failed**." |
| Condescension / fake personhood | "**Fake personhood is a trust liability a plain prompt doesn't carry - theatre-grade disagreement will feel condescending**" |
| Waiting / opacity | "the authoring is the UI, **not a spinner**"; "**a collapsed card is still not a spinner**" |
| Being told what to do | "**NO opinionated next-step guidance.**" |
| Cuteness | "**personality that carries information instead of cuteness**" |
| Overbuild | "**SCOPE PULLBACK (important): stop overthinking.**" |

## 2. Anti-patterns and aversions
- "**Do not redesign the BMad method.**"
- "**Must not feel like just another chat box for prompting an AI.**"
- "**No second source of truth.**"
- "**Animation must carry information**, never decoration"
- "**The harness writes nothing into the project.**"
- "It never **locks, reverts, patches or restores.**"
- **Cut as overbuild:** "Chat-app information architecture — channels, multiple simultaneous threads, group workspaces." / "**NOT a chat app rebuild.** Want: a visual way to talk to agent personas while doing the work, **to escape terminal UI/UX**. BMad already documents its outputs - **surfacing those in a SIDEBAR is more than enough**"
- **Cut as autonomy:** async/overnight work · agents picking up work unprompted · long-term memory across weeks
- **Explicitly rejected:** "**no highlighting, badging or recommending 'the right next move.'**" · "**Unread badges / RPG quest markers.**"
- **Rejected art:** "**Not pixel art, not JRPG sprites, not cartoon.**" · "**PERSONAS NEED REAL FACES, not emoji icons. The customize.toml icon field is not enough**" · "the **icon is never rendered as a portrait**"
- **Anti-rot:** "**Reading the install rather than modelling it is what keeps the harness from rotting when BMad updates**" · config files "**never read directly**"
- "**a skill-only dispatcher would leave 60% of that menu inert**"

**Offhand aversions worth keeping** (in-world, `[mockup]`):
> "Give me an event history and I can show a merchant exactly where their money is. Don't, and **I'm designing a spinner with a good excuse**." — Sally
> "**A date that silently changes is worse than a range.** I'd rather show 'Thu–Fri' and be right than 'Thursday' and apologise." — Sally
> "That's a **trade-off, not a verdict**." — Winston
> "'Boring' describes the choice we'd be making, **not the code we'd be making it in**." — Amelia
> "**Stopping at FR-7, because I don't want to write your decision for you.**" — John

## 3. References
**Positive:** company-directory portrait / illustrated headshot of a plausible colleague (**the adopted direction**) · work chat app, Slack-shaped (metaphor kept, IA cut) · old-school RPG (relocated, de-literalised) · profile picture ("a small picture in the corner, more than an icon") · **the terminal as the foil** — "A terminal genuinely cannot do this; that span is the differentiator."
**Negative:** pixel art · JRPG sprites · cartoon · emoji icons · RPG quest marker `!` (**rejected → Won't**) · the generic LLM chat window

**Human references inside the persona identities** (these set the register of the writing) `[mockup]`:
- **John** — "Marty Cagan and Teresa Torres… **Bezos's six-pager discipline**"
- **Mary** — "**Michael Porter's strategic rigor and Barbara Minto's Pyramid Principle**"
- **Winston** — "**Martin Fowler's pragmatism and Werner Vogels's cloud-scale realism**"
- **Sally** — "**Don Norman's human-centered design and Alan Cooper's persona discipline**"
- **Amelia** — "**Kent Beck's TDD and the Pragmatic Programmer's precision**"

## 4. Protagonists and narrated sessions

**The real audience:** "**Engineers on the team who bounce off BMad's prompt-only surface.** The method works; the surface doesn't." · "For engineers on **Sherif's** team". Failure image: "**the engineer uses it twice and goes back to the terminal**."

**Session A — "Demo Tape", five beats** `[memlog]`:
1. "click [Create PRD] and **WATCH HIM WRITE IT** - live authoring visible, not a spinner"
2. "**John asks for my opinion, we go back and forth on the output in chat**"
3. "**we make a decision, the output updates and SAVES** - visible in the rail"
4. "**call epic creation, then sprint planning** - moving through skills without leaving the conversation"
5. "**call on Amelia to pick up the work and start** - persona handoff from planning to build"
> "The demo is **one continuous session that moves ACROSS personas (John x3 → Amelia)**. Persona handoff is a first-class interaction, **not a restart**"

**The climax:** "watching the PRD write itself, John pushing back on you, and a face attached to him" — stated as a *combination*; no single element is the beat.

**Session B — the mockup's scripted session (binding).** Protagonist "**You**" / initials **SM** / role "**sherif**". `~/work/falcon`, branch `feat/payouts-prd`. Subject: merchant payouts, EU only for v1.
- `session resumed · 3 earlier turns hidden · context: product-brief.md, research/market-2026-09-14.md`
- **14:02 You:** "Same scope we agreed Tuesday… **Start the PRD off the brief, don't re-interview me.**"
- **14:02 John:** "**Two silences already**… **Writing now** — I'll flag the second one when I get to it." + run chip `PRD · bmad-prd · step 4/9 · writing to _bmad/PRD.md`
- **14:04** the live card, status "**writing · §4 Functional Requirements**", footer "1,118 words · 9 sections · autosave on". FR-1…FR-6 type in; **halts mid-line at FR-7**
- **14:05 the climax beat:** "**Stopping at FR-7, because I don't want to write your decision for you.**" / "Those two can't both be true in v1… the difference is **about a week of Amelia's time**."
  - **A** "Scheduled only. Manual trigger is a non-goal." · **B** "Manual trigger, rate-limited…" (**"John leans here"** — only B carries it) · **C** "**Neither — my reasoning is different.**"
  - "I lean B, but **I'd rather be wrong out loud**… Which is it?" + handoff chip "**Winston flagged the idempotency cost in `architecture.md` — loop him in?**"
- **Resolution on B:** "Then it's a **requirement with teeth, not a button**… **Saved.**" — caret stops, card flips to "**saved · just now · 9 sections**", dot work→live, rail row drops "writing", header becomes "idle · PRD.md saved". **The writing→saved transition is the literal payoff of the beat.**
- **On A:** "…so nobody relitigates it in review — and **Sally gets told, because 'you can't do this' is a design problem the moment it's a rule**."
- **On C:** "**Then I'll stop writing and listen.**"

**Session C — party mode (binding).** Topic "payouts — extend billing-svc, or stand up the ledger now?", chips "5 participants" / "2 open disagreements" / "turn 11 · 6m 40s". Sysline: "**room opened by you · all five agents present · no turn order enforced**."
- **John frames + time-boxes:** "**Ten minutes on this, then it goes into the PRD's constraints section as written and I stop reopening it.**"
- **Winston:** "**I'll say the unpopular thing first**… **Boring technology buys us the ability to be wrong cheaply**" / "**That's a trade-off, not a verdict.**"
- **Amelia** `disagrees · Winston` + quote-back: "**Disagree.** `billing-svc/src/ledger/reconcile.ts` is 1,412 lines, no idempotency key, and the retry path is a `setTimeout`."
- **Mary** `evidence`: "**Both of you are arguing cost. Nobody has said what changes for the merchant**… of 214 payout tickets last quarter, 61% are 'where is my money'… **and John, this is aimed at you**"
- **Sally** `disagrees · framing`: "**I want to push on the framing itself. You've all called this an internal decision. It isn't.**" / "**The architecture picks how many honest states I'm able to draw.**"
- **Winston** `concedes · partly`: "**The idempotency point lands**… **Middle path**… **nobody operates Kafka for one producer**."
- **You, jumping in mid-room:** "**Hold on** — Mary, if 61% is 'where is my money', is the event log enough on its own…?"
- **Mary, live, typing:** "**Not on its own.** … **Winston, does your Postgres-first version still give me a date I can stand behind…?**"
- Composer: placeholder "**Jump in — the room won't wait for a turn…**", hints "**no turn gate · your message interrupts the current speaker**"

## 5. Art direction
> "**Art direction is the childish-risk decision; there is no neutral option.**"
> "Target is a **company-directory portrait — an illustrated headshot of a plausible colleague**. Not pixel art, not JRPG sprites, not cartoon. **Real faces plus a restrained UI is what buys the intelligence back.**"
> "The point is putting a **FACE** on the agent for personality - **a small picture in the corner, more than an icon**"
> "**Procedural inline SVG**, curated parameters for the five core personas and parameters **derived deterministically from the agent id** for any other installed agent." / "**No external assets, no licensing dependency**"

**Vocabulary from the mockup:** `skin`, `shade`, `hair`, `style` (`short`/`long`/`curly`/`receding`/`bun`), `fringe` (`straight`/`sweep`), `crown`, `beard` (`full`/`close`), `glasses` (`rect`/`round`), `earrings`, `shirt`, `collar`, `bg`. Always `border-radius:50%`, always `role="img"` with `aria-label="${name}, ${title}"`.

**Palette is muted and desaturated, never saturated or primary.** Backgrounds `#2a3340 / #2f3742 / #2f3a3c / #383345 / #333c3a`; shirts `#465260 / #3c4756 / #3c4a4b / #4b4053 / #3f4b45`; skins span `#efc6a1` through `#7d4f30` — **five visibly distinct skin tones**. Eye white is warm off-white `#f3eee9`, mouth `#9c6152` — **no pure white, no pure black anywhere in the face**.

**Surrounding restraint:** a **single** accent at 12% for fills; muted status colours; 13px/1.55 system sans; mono reserved for paths, run chips, state and metadata; radius 5px — **soft, not rounded**; section headings 10.5px uppercase `.09em` dim. **The disagreement tag is the only warm-toned chip on screen — friction is the one thing given its own colour.**

## 6. Motion, sound, ambience
> "**Animation must carry information**, never decoration: **a thinking face because a skill is actually running, a pulse because a file is actually being written**."
> "Presence bound to real state: '**Amelia is typing...' because a build is actually running**… **never cosmetic**"

Measured cadences `[mockup]`: doc prose **26ms/char**; party speech **2 chars/34ms** (visibly faster — *a person talking vs a person writing*) · caret `blink 1.05s steps(1)` — **a hard on/off, never a fade** · pulse `1.5s`, opacity 1→**.35**→1, **slow and shallow; nothing strobes** · equaliser `.9s`, 3→8px, staggered `.15s` — **the only ambient-looking motion in the app, and it is bound to who is speaking right now** · cast cards `.42` / `.72` / `1` with `.25s ease` — **presence is expressed by dimming, never removal** · tile expand `.16s` — a reveal, not a slide · felt latency: solo reply **620ms**, decision **520ms**, party **700ms** — **deliberately short but non-zero, a beat of thought**

**Sound: there is no mention of audio anywhere** — not in the intent doc, not in the memlog, not in the mockup. Given the gamification aversion, **silence should be read as intentional**; any sound proposal is a new decision, not an inherited one.

**Ambience comes from state lines, not effects:** "drafting PRD.md · §4/9", "idle · last active 41m ago", "edited architecture.md · 41m ago", "test watcher running · 84 passing", "appending · live".

## 7. Stakes and risk, in the author's voice
> "**TOP RISK: feels too childish, too game-like, missing the intelligence of it all - engineer uses it twice and returns to the terminal**"
> "**If it reads as a prompt window with a portrait glued on, it has failed.**"
> "**Fake personhood is a trust liability a plain prompt doesn't carry**" → **disagreement must be evidence-bearing, never performed.** The mockup obeys: every disagreement cites a file, a line count, a ticket percentage, or a day estimate.
> "**The value isn't fixing pain - it's that this doesn't exist today.**"
> "**The harness spans planning and build in one window**… **A terminal genuinely cannot do this; that span is the differentiator.**"
> "**PARTY MODE promoted to MUST - user overruled coach's Should.**" / "Party mode is **the highest-payoff screen in the harness**"

**Nervousness, as live open questions** — two of the three are **pure UX readability questions**:
> "**Can a run be stopped without also ending the persona's session?**… the trade is **stated to the user, never hidden.**"
> "**Does a conversation that is continuous in transcript and artifacts, but not in process, satisfy the money moment?**"
> "**Does a queued composer read as honest, or as broken?** Queued-and-visible is the intent; **only real use decides**."

**First-run failure image:** "**an empty room**" — "names whichever is missing rather than opening to an empty room." Worth carrying into EXPERIENCE.md verbatim.

## 8. The personas as characters
> "A persona's `identity` and `communication_style` are **not injected by the harness at all**… **That is what makes the persona talk like the persona.**"

| Persona | Title | Communication style |
|---|---|---|
| **John** | Product Manager | "**Detective's 'why?' relentless. Direct, data-sharp, cuts through fluff.**" |
| **Mary** | Business Analyst | "**Treasure hunter's excitement for patterns, McKinsey memo's structure for findings.**" |
| **Winston** | System Architect | "**Calm and pragmatic. Answers with trade-offs, not verdicts.**" |
| **Sally** | UX Designer | "**Paints pictures with words. Empathetic advocate.**" |
| **Amelia** | Senior Software Engineer | "**Ultra-succinct. Speaks in file paths and AC IDs.**" |

Cast order is fixed: `["mary","john","sally","winston","amelia"]`.

**Disagreement vocabulary:** `disagrees · <name>` · `disagrees · framing` · `evidence` · `concedes · partly` · `answers` · `builds on` · `decides` · `speaking` · `present · listening` · `unresolved` · `proposed` · `awaiting your call`. **Every disagreeing turn carries a quote-back block naming what it is replying to.** Personas may reject the *question*, not just the answer.

**Behaviours toward the user:** pushes back and refuses to decide for you · declares its lean then defers · offers a third door · invites interruption ("**stop me the moment you disagree**") · contradicts you ("**That contradicts the brief. I'm not going to smooth it over**") · names cost before you ask · addresses another persona in front of you · time-boxes itself · explains its own failures

**Cut but useful as tone:** remembering past conversations (cut) · following up when stuck (cut) · **asking YOU for your opinion — survives as the elicitation loop / FR-7 pushback** · picking up work unprompted (cut) · venting (survives only as Could-level idle barks)

## Where the author changed their mind
| # | Earlier | Later |
|---|---|---|
| 1 | a work chat app with channels + DMs | "**stop overthinking. NOT a chat app rebuild**" — **metaphor survives, IA is gone** |
| 2 | unread badge = RPG `!` quest marker | **Won't.** The clearest gamification aversion |
| 3 | "old-school RPG feel (talking-head portrait + chat bubbles)" | de-literalised, then **relocated to the party screen, not the 1-on-1** |
| 4 | party mode a Should | **promoted to Must by the author over the coach** — the strongest authorial override |
| 5 | teammate memory/follow-up/pickup/venting | all cut as autonomy; venting demoted to Could |
| 6 | "talk to one agent, get results, move to the next" | "**that was a description of the terminal, not a requirement**" — **concurrency now permitted** |
| 7 | rail icon pulses while the file is being written | single whole-file write means **no on-disk window** — the pulse lives, its **source** changed to the run stream |
| 8 | assumed progressive authoring on disk | one burst on disk, but **~5,800 incremental events over the wire — the money moment stands**; `.memlog.md` covers **the quiet windows** |
| 9 | roster read from each agent's `customize.toml` | **`_bmad/config.toml` `[agents.*]` is authoritative; config files never read directly** → ⚠️ **the mockup's visible copy is now factually stale** |
| 10 | skill buttons dispatch a `skill` | exactly one of `skill` or `prompt`; **both dispatch as a turn** |
| 11 | party side panels fully designed in the mockup | **deferred — no data source.** ⚠️ **Direct conflict between the two binding documents.** DESIGN.md must decide what occupies that 288px rail in v1 |
| 12 | one subprocess per skill run | **long-lived persona session; no second kind of run** |
| 13 | portraits possibly falling back to the icon | resolved: procedural SVG, **icon never a portrait** |
| 14 | the five core personas | **every installed agent gets a tile and a 1:1** |
| 15 | "zero configuration" | "**zero configuration is not zero prerequisites**" — a first-run screen now exists and needs designing |

## Three things to carry straight into the spines
1. **"Not a spinner" is the spine of the whole experience** — it recurs four times in three registers. **Every waiting state in the product must answer it.**
2. **Friction is the feature most likely to be sanded off in implementation.** The rule the mockup sets: **disagreement must carry evidence, or it must not ship.**
3. **Two of the three unresolved risks are UX-readability questions.** EXPERIENCE.md is the document that answers them, and the binding stance for both is already set: **state the trade to the user, never hide it.**

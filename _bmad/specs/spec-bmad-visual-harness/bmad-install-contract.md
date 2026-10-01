# BMad install read-contract

What the harness reads off disk, and how. Reading the install rather than modelling it is what
keeps the harness from rotting when BMad updates — see the corresponding constraint in SPEC.md.

## Read it through BMad's own resolvers

Configuration files are **never read directly**. Effective configuration comes from invoking
BMad's own resolvers and consuming the merged JSON
(`../../planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md`
AD-8, which replaces an earlier reading of each agent's `customize.toml`):

| Resolver | Yields |
|---|---|
| `_bmad/scripts/resolve_config.py` | core config and the `[agents.*]` roster |
| `_bmad/scripts/resolve_customization.py` | per-agent and per-skill customization, overrides applied |
| the party skill's own `scripts/resolve_party.py` | party configuration |

They do not all live in one directory. Reading `config.toml` or `customize.toml` raw skips the
`_bmad/custom/` override layer, which is exactly the rot this contract exists to prevent — the
harness implements no TOML layering of its own.

Every resolver invocation is bounded by a timeout and has a defined failure path: a failed
resolve degrades to the last good result and surfaces a named error. It never silently yields an
empty roster. Configuration files are watched and re-resolved on change; re-resolution updates
the roster and the menus and **never touches a live session**, so an agent that vanishes from the
install keeps its session and its stop control until the user closes it.

## The agent roster: `_bmad/config.toml` `[agents.*]`

The `[agents.*]` tables in the resolved config are the authoritative roster, not each agent's
`customize.toml` (`ARCHITECTURE-SPINE.md` AD-10).

| Field | Feeds |
|---|---|
| `name` | persona tile, chat header, party cast |
| `title` | tile subtitle, party turn header |
| `icon` | chrome only — never rendered as a portrait (CAP-10) |
| `description` | persona detail |
| `module`, `team` | grouping |

Agents are **enumerated from this roster**, never by globbing skill directories on a name prefix
— that would hardcode BMad's layout, which CAP-1 forbids.

`identity` and `communication_style` are **not harness-injected**. The persona session activates
the agent's own skill, which loads them itself. That is what makes the persona talk like the
persona (CAP-3).

## The menu: per-agent resolved customization

Each menu entry carries `code` (the key), `description` (the button label) and **exactly one of
`skill` or `prompt`**, not always `skill` (`ARCHITECTURE-SPINE.md` AD-9). The button shows
`description` and keys off `code`.

Both dispatch as a turn into the live persona session:

- `skill` → sent as `/<skill-name>`
- `prompt` → sent as its text verbatim

An entry with neither is a discovery error surfaced to the user, never a silent no-op. A
`skill`-only dispatcher would leave six of Mary's ten entries inert — 60% of that menu.

**Menu entries resolve in main, never in the renderer.** The renderer sends a `code`; the
privileged side resolves it against the currently resolved configuration and decides `skill`
versus `prompt`. A renderer holding a resolved skill name goes stale the instant the install is
re-resolved.

## Observed menus (5 core personas)

| Persona | Title | Menu codes |
|---|---|---|
| Mary | Business Analyst | BP, MR, DR, TR, CB, WB, CR, UV, TS, PC |
| John | Product Manager | PRD → `bmad-prd`, CE → `bmad-create-epics-and-stories`, IR → `bmad-sprint-planning`, CC → `bmad-correct-course` |
| Sally | UX Designer | CU |
| Winston | System Architect | CA, IR |
| Amelia | Senior Software Engineer | BD, QA, CR, SP, ER |

Menu contents are read live; this table is the observed shape, not a hardcode target.

## Project state: `_bmad/`

- Every pipeline stage writes artifacts under `_bmad/`, so pipeline position is physically
  observable — the harness never asks the user where they are and never stores its own answer.
- A sprint status file, `_bmad/implementation-artifacts/sprint-status.yaml`, records where each
  epic, story and retrospective stands. Its `development_status` is a **flat map**: `epic-N`,
  `N-M-<slug>` and `epic-N-retrospective` keys share one namespace, so the structure is in the
  key shape, not in nesting. Its status vocabulary is **six values** — `backlog`,
  `ready-for-dev`, `in-progress`, `review`, `done`, plus `optional` for a retrospective not yet
  held — not the three-way `planned` / `started` / `unstarted` reading this contract once carried.
  Timestamps are `MM-DD-YYYY HH:MM`, not ISO. A separate top-level `action_items` list, outside
  `development_status`, carries its own `open` status. Read from
  `../../../.claude/skills/bmad-sprint-planning/sprint-status-template.yaml` (an example, the
  format's source) and this project's own `../../implementation-artifacts/sprint-status.yaml`. The
  harness v1 reads the file's **presence only**, as one more artifact, and does not parse it; a
  future parser must degrade on an unrecognised status rather than break
  (`../../planning-artifacts/epics.md` FR10).
- The outputs rail watches this tree (CAP-6). Observed artifact classes: `product-brief.md`,
  `PRD.md`, `architecture.md`, `sprint-status.yaml`, `DESIGN.md`, `EXPERIENCE.md`,
  research outputs, and party summaries under `_bmad/party/`.
- A rail row's **owner** comes from the session that wrote the file where the harness observed
  that write, and otherwise from the artifact class, since BMad personas own mostly disjoint
  artifacts. A party transcript is owned by the room, which has no single agent. A row whose
  owner cannot be derived shows none rather than guessing.

Discovery is zero-configuration: pointing the harness at a project root is the whole setup.

## Prerequisites, checked at launch

Zero configuration is not zero prerequisites (`ARCHITECTURE-SPINE.md` AD-17). Launch verifies,
and names the specific failure with its remedy rather than opening an empty room:

- `claude` on `PATH` and authenticated.
- `uv` with Python 3.11+, for the resolvers.
- The target project resolves **at least one agent**. A user-scoped rather than project-scoped
  BMad install resolves none under `--setting-sources project,local` — the exact empty room this
  check exists to prevent.

## Already shipped in BMad

`bmad-party-mode` is installed and working today: group conversation, user participation and
joint decisions all function. CAP-9 is a surfacing problem, not a capability to build — the
only part of the original fantasy that was unbuildable ("they keep talking without me") is cut
as autonomy.

What the skill does **not** emit is structure: it produces prose and is explicitly instructed
never to produce summaries or takeaways, which is why CAP-9's disagreement and decision tracking
has no data source in v1 (`scope-tiers.md`).

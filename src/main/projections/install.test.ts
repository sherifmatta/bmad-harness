import { describe, expect, it } from 'vitest'
import type { InstallSnapshot } from '../../shared/install'
import type {
  InstallSource,
  MenuResult,
  ResolverFailure,
  RosterResult
} from '../sources/install/resolvers'
import type { ResolvedMenuEntry } from '../sources/install/schema'
import type { PrerequisiteChecks, ToolCheck } from '../sources/preflight/tools'
import { createInstallProjection } from './install'

const agent = (id: string, name: string) => ({
  id,
  module: 'bmm',
  team: 't',
  name,
  title: `${name} title`,
  icon: 'i',
  description: `${name} description`
})

const entry = (code: string, action: ResolvedMenuEntry['action']): ResolvedMenuEntry => ({
  code,
  description: `${code} does a thing`,
  action
})

const failure = (kind: ResolverFailure['kind'], detail = 'exit 1'): { ok: false; failure: ResolverFailure } => ({
  ok: false,
  failure: { kind, detail, diagnostic: `diag · ${detail}` }
})

const menuOk = (entries: ResolvedMenuEntry[], problems: string[] = []): MenuResult => ({
  ok: true,
  entries,
  problems: problems.map((message) => ({ message }))
})

/** A source told what to answer, and able to count what it was asked. */
function scripted() {
  const state: {
    roster: RosterResult | (() => Promise<RosterResult>)
    menus: Record<string, MenuResult | (() => Promise<MenuResult>)>
    rosterCalls: number
    skills: string[][] | (() => Promise<string[][]>)
    skillCalls: number
  } = { roster: { ok: true, agents: [] }, menus: {}, rosterCalls: 0, skills: [], skillCalls: 0 }
  const source: InstallSource = {
    async resolveRoster() {
      state.rosterCalls += 1
      const answer = state.roster
      return typeof answer === 'function' ? answer() : answer
    },
    async resolveMenu(id) {
      const answer = state.menus[id] ?? menuOk([])
      return typeof answer === 'function' ? answer() : answer
    },
    async resolveOutputFolder() {
      return { ok: true, folder: null }
    },
    async resolveSkills() {
      state.skillCalls += 1
      const answer = state.skills
      return typeof answer === 'function' ? answer() : answer
    }
  }
  return { state, source }
}

/** Tools told what to answer, and able to count what they were asked. */
function scriptedChecks() {
  const state: { claude: ToolCheck; uv: ToolCheck; claudeCalls: number; uvCalls: number } = {
    claude: { ok: true },
    uv: { ok: true },
    claudeCalls: 0,
    uvCalls: 0
  }
  const checks: PrerequisiteChecks = {
    async checkClaude() {
      state.claudeCalls += 1
      return state.claude
    },
    async checkUv() {
      state.uvCalls += 1
      return state.uv
    }
  }
  return { state: state, checks }
}

function build(withChecks = false) {
  const { state, source } = scripted()
  const scriptedTools = scriptedChecks()
  const emitted: InstallSnapshot[] = []
  const diagnostics: string[] = []
  const projection = createInstallProjection({
    source,
    ...(withChecks ? { checks: scriptedTools.checks } : {}),
    onChange: (snapshot) => emitted.push(snapshot),
    onDiagnostic: (line) => diagnostics.push(line)
  })
  return { state, tools: scriptedTools.state, projection, emitted, diagnostics }
}

const NO_AGENTS = {
  code: 'preflight/no-agents',
  message:
    'no agents · looked for agents in this project, under --setting-sources project,local · a bmad install scoped to the user rather than the project resolves none there · install bmad into this project, or open one that has it'
}

const mary = agent('bmad-agent-analyst', 'Mary')
const john = agent('bmad-agent-pm', 'John')

describe('a first success', () => {
  it('builds the roster and every menu into one snapshot and emits it once', async () => {
    const { state, projection, emitted } = build()
    state.roster = { ok: true, agents: [mary, john] }
    state.menus[mary.id] = menuOk([entry('BP', { kind: 'skill', skill: 'bmad-brainstorming' })])

    await projection.refresh()

    expect(emitted).toHaveLength(1)
    expect(projection.snapshot()).toEqual({
      revision: 1,
      agents: [mary, john],
      menus: {
        [mary.id]: [{ code: 'BP', description: 'BP does a thing' }],
        [john.id]: []
      },
      errors: [],
      preflight: [],
      skills: []
    })
    expect(emitted[0]).toEqual(projection.snapshot())
  })

  it('holds skill and prompt in main only, and never lets either reach a snapshot', async () => {
    const { state, projection, emitted } = build()
    state.roster = { ok: true, agents: [mary] }
    state.menus[mary.id] = menuOk([
      entry('BP', { kind: 'skill', skill: 'bmad-brainstorming' }),
      entry('MR', { kind: 'prompt', prompt: 'Invoke the recon thing.' })
    ])

    await projection.refresh()

    expect(projection.menuEntry(mary.id, 'BP')?.action).toEqual({
      kind: 'skill',
      skill: 'bmad-brainstorming'
    })
    expect(projection.menuEntry(mary.id, 'MR')?.action.kind).toBe('prompt')
    expect(projection.menuEntry(mary.id, 'ZZ')).toBeUndefined()
    for (const text of [JSON.stringify(projection.snapshot()), JSON.stringify(emitted)]) {
      expect(text).not.toMatch(/"skill"|"prompt"/)
      expect(text).not.toContain('bmad-brainstorming')
      expect(text).not.toContain('recon thing')
    }
  })

  it('reads a valid empty roster as no agents, no error, and one no-agents line', async () => {
    const { projection, emitted } = build()

    await projection.refresh()

    expect(projection.snapshot()).toEqual({
      revision: 1,
      agents: [],
      menus: {},
      errors: [],
      preflight: [NO_AGENTS],
      skills: []
    })
    expect(emitted).toHaveLength(1)
  })
})

describe('degrading to last good', () => {
  it.each([
    ['invocation-failed', 'resolver/invocation-failed'],
    ['timeout', 'resolver/timeout'],
    ['unexpected-shape', 'resolver/unexpected-shape']
  ] as const)('keeps the roster on %s, names one error, and clears it on success', async (kind, code) => {
    const { state, projection, diagnostics } = build()
    state.roster = { ok: true, agents: [mary, john] }
    await projection.refresh()

    state.roster = failure(kind)
    await projection.refresh()
    const degraded = projection.snapshot()
    expect(degraded.agents).toEqual([mary, john])
    expect(degraded.errors).toHaveLength(1)
    expect(degraded.errors[0]).toMatchObject({ code, detail: 'exit 1' })
    expect(diagnostics).toEqual([`${code} · diag · exit 1`])

    state.roster = { ok: true, agents: [mary, john] }
    await projection.refresh()
    expect(projection.snapshot().errors).toEqual([])
    expect(projection.snapshot().agents).toEqual([mary, john])
  })

  it('never has an empty roster without an error when there is no last good', async () => {
    const { state, projection } = build()
    state.roster = failure('invocation-failed', 'spawn ENOENT')

    await projection.refresh()

    const snapshot = projection.snapshot()
    expect(snapshot.agents).toEqual([])
    expect(snapshot.errors).toEqual([
      {
        code: 'resolver/invocation-failed',
        message: 'roster · resolver failed',
        detail: 'spawn ENOENT'
      }
    ])
  })

  it('keeps menus independent per agent', async () => {
    const { state, projection } = build()
    state.roster = { ok: true, agents: [mary, john] }
    state.menus[mary.id] = menuOk([entry('BP', { kind: 'skill', skill: 's' })])
    state.menus[john.id] = menuOk([entry('CP', { kind: 'skill', skill: 't' })])
    await projection.refresh()

    state.menus[mary.id] = failure('invocation-failed')
    state.menus[john.id] = menuOk([entry('CP', { kind: 'skill', skill: 't' }), entry('VP', { kind: 'skill', skill: 'u' })])
    await projection.refresh()

    const snapshot = projection.snapshot()
    expect(snapshot.menus[mary.id].map((e) => e.code)).toEqual(['BP'])
    expect(snapshot.menus[john.id].map((e) => e.code)).toEqual(['CP', 'VP'])
    expect(snapshot.errors).toEqual([
      {
        code: 'resolver/invocation-failed',
        message: 'menu · Mary · resolver failed',
        detail: `${mary.id} · exit 1`
      }
    ])
    expect(projection.menuEntry(mary.id, 'BP')).toBeDefined()
  })

  it('gives an agent with no last good menu an empty one', async () => {
    const { state, projection } = build()
    state.roster = { ok: true, agents: [mary] }
    state.menus[mary.id] = failure('timeout', 'exceeded 15000ms')

    await projection.refresh()

    expect(projection.snapshot().menus[mary.id]).toEqual([])
    expect(projection.snapshot().errors[0].code).toBe('resolver/timeout')
  })

  it('names each malformed entry once, with the agent id as detail', async () => {
    const { state, projection } = build()
    state.roster = { ok: true, agents: [mary] }
    state.menus[mary.id] = menuOk(
      [entry('BP', { kind: 'skill', skill: 's' })],
      ['menu · Mary · entry X1 has neither skill nor prompt', 'menu · Mary · entry 3 has no code']
    )

    await projection.refresh()

    expect(projection.snapshot().errors).toEqual([
      {
        code: 'menu/entry-malformed',
        message: 'menu · Mary · entry X1 has neither skill nor prompt',
        detail: mary.id
      },
      { code: 'menu/entry-malformed', message: 'menu · Mary · entry 3 has no code', detail: mary.id }
    ])
    expect(projection.snapshot().menus[mary.id].map((e) => e.code)).toEqual(['BP'])
  })

  it('drops a vanished agent, its menu and its dispatch entries', async () => {
    const { state, projection } = build()
    state.roster = { ok: true, agents: [mary, john] }
    state.menus[john.id] = menuOk([entry('CP', { kind: 'skill', skill: 't' })])
    await projection.refresh()

    state.roster = { ok: true, agents: [mary] }
    await projection.refresh()

    expect(projection.snapshot().agents).toEqual([mary])
    expect(Object.keys(projection.snapshot().menus)).toEqual([mary.id])
    expect(projection.menuEntry(john.id, 'CP')).toBeUndefined()
  })
})

describe('emission', () => {
  it('does not emit or bump the revision for an identical refresh', async () => {
    const { state, projection, emitted } = build()
    state.roster = { ok: true, agents: [mary] }

    await projection.refresh()
    await projection.refresh()
    await projection.refresh()

    expect(emitted).toHaveLength(1)
    expect(projection.snapshot().revision).toBe(1)
  })

  it('bumps the revision monotonically when the view changes', async () => {
    const { state, projection, emitted } = build()
    state.roster = { ok: true, agents: [mary] }
    await projection.refresh()
    state.roster = { ok: true, agents: [mary, john] }
    await projection.refresh()

    expect(emitted.map((s) => s.revision)).toEqual([1, 2])
  })

  it('collapses concurrent refreshes into one run plus one trailing run', async () => {
    const { state, projection, emitted } = build()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    state.roster = async () => {
      await gate
      return { ok: true, agents: [mary] }
    }

    const runs = [projection.refresh(), projection.refresh(), projection.refresh(), projection.refresh()]
    release()
    await Promise.all(runs)

    expect(state.rosterCalls).toBe(2)
    expect(emitted).toHaveLength(1)
  })

  it('drops an in-flight result after dispose and emits nothing', async () => {
    const { state, projection, emitted } = build()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    state.roster = async () => {
      await gate
      return { ok: true, agents: [mary] }
    }

    const pending = projection.refresh()
    projection.dispose()
    release()
    await pending

    expect(emitted).toHaveLength(0)
    expect(projection.snapshot().agents).toEqual([])
    await projection.refresh()
    expect(state.rosterCalls).toBe(1)
  })

  it('turns an unexpected throw into install/unexpected without rejecting', async () => {
    const { state, projection, diagnostics } = build()
    state.roster = async () => {
      throw new RangeError('/private/path exploded')
    }

    await expect(projection.refresh()).resolves.toBeUndefined()

    expect(projection.snapshot().errors).toEqual([
      { code: 'install/unexpected', message: 'install · unexpected failure', detail: 'RangeError' }
    ])
    expect(JSON.stringify(projection.snapshot())).not.toContain('private')
    // The cause reaches the developer's terminal, and only there.
    expect(diagnostics).toEqual(['install/unexpected · /private/path exploded'])
  })
})

describe('preflight', () => {
  const missing = (kind: 'claude-missing' | 'claude-unauthenticated'): ToolCheck => ({
    ok: false,
    kind,
    diagnostic: 'claude auth status · stderr said /Users/x/.claude/settings.json'
  })
  const uvMissing: ToolCheck = { ok: false, kind: 'uv-missing', diagnostic: 'uv python find · spawn ENOENT' }

  it('is empty when every prerequisite passes', async () => {
    const { state, tools, projection } = build(true)
    state.roster = { ok: true, agents: [mary] }

    await projection.refresh()

    expect(projection.snapshot().preflight).toEqual([])
    expect(tools.claudeCalls).toBe(1)
    expect(tools.uvCalls).toBe(1)
  })

  it.each([
    ['claude-missing', 'claude · not on path · install the claude cli'],
    ['claude-unauthenticated', 'claude · not signed in · run claude once to sign in']
  ] as const)('names %s and still resolves the roster', async (kind, message) => {
    const { state, tools, projection } = build(true)
    state.roster = { ok: true, agents: [mary] }
    tools.claude = missing(kind)

    await projection.refresh()

    expect(state.rosterCalls).toBe(1)
    expect(projection.snapshot().agents).toEqual([mary])
    expect(projection.snapshot().preflight).toEqual([{ code: `preflight/${kind}`, message }])
  })

  it.each([
    ['uv-missing', 'uv · not found · install uv', undefined],
    [
      'uv-python-old',
      'uv · resolves no python 3.11 or newer · install a 3.11+ toolchain for uv',
      'python 3.9.6'
    ]
  ] as const)('names %s, runs no resolver, and adds no no-agents line', async (kind, message, detail) => {
    const { state, tools, projection } = build(true)
    state.roster = { ok: true, agents: [mary] }
    tools.uv = { ok: false, kind, ...(detail !== undefined ? { detail } : {}), diagnostic: 'd' }

    await projection.refresh()

    expect(state.rosterCalls).toBe(0)
    const snapshot = projection.snapshot()
    expect(snapshot.agents).toEqual([])
    expect(snapshot.errors).toEqual([])
    expect(snapshot.preflight).toEqual([
      { code: `preflight/${kind}`, message, ...(detail !== undefined ? { detail } : {}) }
    ])
  })

  it('names which tool could not conclude, with a detail', async () => {
    const { tools, projection } = build(true)
    tools.claude = { ok: false, kind: 'check-failed', detail: 'exceeded 15000ms', diagnostic: 'd' }
    tools.uv = { ok: false, kind: 'check-failed', detail: 'output was not json', diagnostic: 'd' }

    await projection.refresh()

    expect(projection.snapshot().preflight).toEqual([
      { code: 'preflight/check-failed', message: 'claude · check did not complete', detail: 'exceeded 15000ms' },
      { code: 'preflight/check-failed', message: 'uv · check did not complete', detail: 'output was not json' }
    ])
  })

  it('lists both tools, claude first', async () => {
    const { tools, projection } = build(true)
    tools.claude = missing('claude-missing')
    tools.uv = uvMissing

    await projection.refresh()

    expect(projection.snapshot().preflight.map((e) => e.code)).toEqual([
      'preflight/claude-missing',
      'preflight/uv-missing'
    ])
  })

  it('orders claude, then no-agents when uv passes and the roster is empty', async () => {
    const { tools, projection } = build(true)
    tools.claude = missing('claude-unauthenticated')

    await projection.refresh()

    expect(projection.snapshot().preflight.map((e) => e.code)).toEqual([
      'preflight/claude-unauthenticated',
      'preflight/no-agents'
    ])
  })

  it('gives no-agents exactly the four-part message, never "found" as a result', async () => {
    const { projection } = build(true)

    await projection.refresh()

    const [line] = projection.snapshot().preflight
    expect(line).toEqual(NO_AGENTS)
    expect(line.detail).toBeUndefined()
    for (const part of ['agents', 'this project', '--setting-sources project,local', 'user', 'install bmad into this project']) {
      expect(line.message).toContain(part)
    }
    expect(line.message).not.toContain('no agents found')
  })

  it('does not call a resolver failure with no last good roster no-agents', async () => {
    const { state, projection } = build(true)
    state.roster = failure('invocation-failed')

    await projection.refresh()

    const snapshot = projection.snapshot()
    expect(snapshot.errors.map((e) => e.code)).toEqual(['resolver/invocation-failed'])
    expect(snapshot.preflight).toEqual([])
  })

  it('keeps a tool line beside a resolver error when the roster resolver fails with no last good', async () => {
    const { state, tools, projection } = build(true)
    tools.claude = missing('claude-missing')
    state.roster = failure('invocation-failed')

    await projection.refresh()

    const snapshot = projection.snapshot()
    expect(snapshot.preflight.map((e) => e.code)).toEqual(['preflight/claude-missing'])
    expect(snapshot.errors.map((e) => e.code)).toEqual(['resolver/invocation-failed'])
  })

  it('clears no-agents when a later refresh has the roster resolver fail', async () => {
    const { state, projection } = build(true)
    await projection.refresh()
    expect(projection.snapshot().preflight).toEqual([NO_AGENTS])

    state.roster = failure('invocation-failed')
    await projection.refresh()

    expect(projection.snapshot().preflight).toEqual([])
    expect(projection.snapshot().errors.map((e) => e.code)).toEqual(['resolver/invocation-failed'])
  })

  it('clears no-agents and bumps the revision when the roster gains an agent', async () => {
    const { state, projection, emitted } = build(true)
    await projection.refresh()
    expect(projection.snapshot().preflight).toEqual([NO_AGENTS])

    state.roster = { ok: true, agents: [mary] }
    await projection.refresh()

    expect(projection.snapshot().preflight).toEqual([])
    expect(emitted.map((s) => s.revision)).toEqual([1, 2])
  })

  it('emits nothing for an identical refresh', async () => {
    const { tools, projection, emitted } = build(true)
    tools.uv = uvMissing

    await projection.refresh()
    await projection.refresh()

    expect(emitted).toHaveLength(1)
  })

  it('asks each tool once across many refreshes, and once when they run together', async () => {
    const { state, tools, projection } = build(true)
    state.roster = { ok: true, agents: [mary] }

    await Promise.all([projection.refresh(), projection.refresh()])
    await projection.refresh()
    await projection.refresh()

    expect(tools.claudeCalls).toBe(1)
    expect(tools.uvCalls).toBe(1)
  })

  it('turns a check that throws into check-failed without leaking its message', async () => {
    const { state, source } = scripted()
    state.roster = { ok: true, agents: [mary] }
    const diagnostics: string[] = []
    const projection = createInstallProjection({
      source,
      checks: {
        checkClaude: async () => {
          throw new Error('/private/claude exploded')
        },
        checkUv: async () => ({ ok: true })
      },
      onChange: () => {},
      onDiagnostic: (line) => diagnostics.push(line)
    })

    await projection.refresh()

    expect(projection.snapshot().preflight).toHaveLength(1)
    expect(projection.snapshot().preflight[0].code).toBe('preflight/check-failed')
    expect(JSON.stringify(projection.snapshot())).not.toContain('private')
    expect(diagnostics).toEqual(['preflight/check-failed · /private/claude exploded'])
  })

  it('sends the diagnostic to the terminal once per ask and never puts it in a snapshot', async () => {
    const { tools, projection, diagnostics } = build(true)
    tools.claude = missing('claude-unauthenticated')
    tools.uv = { ok: false, kind: 'uv-python-old', detail: 'python 3.9.6', diagnostic: 'uv python find · python 3.9.6' }

    await projection.refresh()

    expect(diagnostics).toEqual([
      'preflight/claude-unauthenticated · claude auth status · stderr said /Users/x/.claude/settings.json',
      'preflight/uv-python-old · uv python find · python 3.9.6'
    ])
    const text = JSON.stringify(projection.snapshot())
    expect(text).not.toContain('stderr')
    expect(text).not.toContain('.toml')
    // Codes carry a slash by design; what a person reads never does.
    for (const line of projection.snapshot().preflight) {
      expect(`${line.message} ${line.detail ?? ''}`).not.toContain('/')
    }
  })
})

describe('preflight recovery', () => {
  const uvMissing: ToolCheck = { ok: false, kind: 'uv-missing', diagnostic: 'uv python find · spawn ENOENT' }

  it('clears the preflight and runs the resolvers once uv has been installed, without a new projection', async () => {
    const { state, tools, projection, emitted } = build(true)
    state.roster = { ok: true, agents: [mary] }
    tools.uv = uvMissing
    await projection.refresh()
    expect(projection.snapshot().preflight.map((line) => line.code)).toEqual(['preflight/uv-missing'])
    expect(state.rosterCalls).toBe(0)

    tools.uv = { ok: true }
    await projection.refresh()

    expect(projection.snapshot().preflight).toEqual([])
    expect(projection.snapshot().agents.map((a) => a.id)).toEqual([mary.id])
    expect(state.rosterCalls).toBe(1)
    expect(emitted).toHaveLength(2)
  })

  it('asks both tools again on the next refresh after any failure, not only the one that failed', async () => {
    const { tools, projection } = build(true)
    tools.uv = uvMissing

    await projection.refresh()
    await projection.refresh()

    expect(tools.claudeCalls).toBe(2)
    expect(tools.uvCalls).toBe(2)
  })

  it('does not keep a check that could not conclude: a timeout once is asked again, and a pass then sticks', async () => {
    const { state, source } = scripted()
    state.roster = { ok: true, agents: [mary] }
    let uvAsks = 0
    const projection = createInstallProjection({
      source,
      checks: {
        checkClaude: async () => ({ ok: true }),
        checkUv: async () => {
          uvAsks += 1
          return uvAsks === 1
            ? { ok: false, kind: 'check-failed', detail: 'timed out', diagnostic: 'uv python find · timed out' }
            : { ok: true }
        }
      },
      onChange: () => {}
    })

    await projection.refresh()
    expect(projection.snapshot().preflight.map((line) => line.code)).toEqual(['preflight/check-failed'])

    await projection.refresh()
    await projection.refresh()

    expect(projection.snapshot().preflight).toEqual([])
    expect(uvAsks).toBe(2)
  })

  it('does not keep a check that threw: the next refresh asks again', async () => {
    const { state, source } = scripted()
    state.roster = { ok: true, agents: [mary] }
    let claudeAsks = 0
    const projection = createInstallProjection({
      source,
      checks: {
        checkClaude: async () => {
          claudeAsks += 1
          if (claudeAsks === 1) {
            throw new Error('exploded')
          }
          return { ok: true }
        },
        checkUv: async () => ({ ok: true })
      },
      onChange: () => {}
    })

    await projection.refresh()
    expect(projection.snapshot().preflight[0].code).toBe('preflight/check-failed')

    await projection.refresh()

    expect(projection.snapshot().preflight).toEqual([])
    expect(claudeAsks).toBe(2)
  })

  it('asks a clean verdict once across many refreshes, however many pass', async () => {
    const { state, tools, projection } = build(true)
    state.roster = { ok: true, agents: [mary] }

    for (let i = 0; i < 5; i += 1) {
      await projection.refresh()
    }

    expect(tools.claudeCalls).toBe(1)
    expect(tools.uvCalls).toBe(1)
  })
})

describe('the skills the install declares', () => {
  const MANIFEST = [
    ['canonicalId', 'name', 'description'],
    ['a', 'bmad-a', 'First'],
    ['', '', 'no name'],
    ['b', 'bmad-b', 'Second']
  ]
  const ABC = [
    { name: 'bmad-a', description: 'First' },
    { name: 'bmad-b', description: 'Second' }
  ]

  it('carries them in the snapshot in the manifest’s order, with no error and the install’s other fields as they were', async () => {
    const { state, projection, emitted } = build()
    state.roster = { ok: true, agents: [mary] }
    state.skills = MANIFEST

    await projection.refresh()

    expect(projection.snapshot()).toEqual({
      revision: 1,
      agents: [mary],
      menus: { [mary.id]: [] },
      errors: [],
      preflight: [],
      skills: ABC
    })
    expect(emitted).toHaveLength(1)
  })

  it('reads them once for a refresh, and again for the next', async () => {
    const { state, projection } = build()
    await projection.refresh()
    await projection.refresh()

    expect(state.skillCalls).toBe(2)
  })

  it('has none, and no error, when the manifest is absent or cannot be read', async () => {
    const { state, projection } = build()
    state.roster = { ok: true, agents: [mary] }
    state.skills = []
    await projection.refresh()
    expect(projection.snapshot().skills).toEqual([])
    expect(projection.snapshot().errors).toEqual([])
    expect(projection.snapshot().preflight).toEqual([])

    state.skills = MANIFEST
    await projection.refresh()
    expect(projection.snapshot().skills).toEqual(ABC)

    state.skills = async () => {
      throw new Error('EIO')
    }
    await projection.refresh()
    expect(projection.snapshot().skills).toEqual([])
    expect(projection.snapshot().errors).toEqual([])
  })

  it('reads them when uv is missing, before the resolvers that need it', async () => {
    const { state, tools, projection } = build(true)
    tools.uv = { ok: false, kind: 'uv-missing', diagnostic: 'ENOENT' }
    state.skills = MANIFEST

    await projection.refresh()

    expect(state.rosterCalls).toBe(0)
    expect(projection.snapshot().skills).toEqual(ABC)
    expect(projection.snapshot().preflight.map((error) => error.code)).toEqual(['preflight/uv-missing'])
  })

  it('emits a new revision for a skills-only change, and not for an identical manifest', async () => {
    const { state, projection, emitted } = build()
    state.roster = { ok: true, agents: [mary] }
    state.skills = MANIFEST
    await projection.refresh()
    await projection.refresh()
    expect(emitted.map((snapshot) => snapshot.revision)).toEqual([1])

    state.skills = [...MANIFEST, ['c', 'bmad-c', 'Third']]
    await projection.refresh()

    expect(emitted.map((snapshot) => snapshot.revision)).toEqual([1, 2])
    expect(emitted[1].skills.map((skill) => skill.name)).toEqual(['bmad-a', 'bmad-b', 'bmad-c'])
    expect(emitted[1].agents).toEqual(emitted[0].agents)
    expect(emitted[1].menus).toEqual(emitted[0].menus)
  })
})

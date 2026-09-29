import { describe, expect, it } from 'vitest'
import type { InstallSnapshot } from '../../shared/install'
import type {
  InstallSource,
  MenuResult,
  ResolverFailure,
  RosterResult
} from '../sources/install/resolvers'
import type { ResolvedMenuEntry } from '../sources/install/schema'
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
  } = { roster: { ok: true, agents: [] }, menus: {}, rosterCalls: 0 }
  const source: InstallSource = {
    async resolveRoster() {
      state.rosterCalls += 1
      const answer = state.roster
      return typeof answer === 'function' ? answer() : answer
    },
    async resolveMenu(id) {
      const answer = state.menus[id] ?? menuOk([])
      return typeof answer === 'function' ? answer() : answer
    }
  }
  return { state, source }
}

function build() {
  const { state, source } = scripted()
  const emitted: InstallSnapshot[] = []
  const diagnostics: string[] = []
  const projection = createInstallProjection({
    source,
    onChange: (snapshot) => emitted.push(snapshot),
    onDiagnostic: (line) => diagnostics.push(line)
  })
  return { state, projection, emitted, diagnostics }
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
      errors: []
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

  it('reads a valid empty roster as no agents and no error', async () => {
    const { projection, emitted } = build()

    await projection.refresh()

    expect(projection.snapshot()).toEqual({ revision: 0, agents: [], menus: {}, errors: [] })
    expect(emitted).toHaveLength(0)
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

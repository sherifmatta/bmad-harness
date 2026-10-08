import { describe, expect, it } from 'vitest'
import { isSafeAgentId, parseMenu, parseOutputFolder, parseRoster } from './schema'

const agent = (over: Record<string, unknown> = {}) => ({
  module: 'bmm',
  team: 'software-development',
  name: 'Mary',
  title: 'Business Analyst',
  icon: '📊',
  description: 'Digs.',
  ...over
})

describe('parseRoster', () => {
  it('keeps the resolver order and carries exactly six fields plus the id', () => {
    const parsed = parseRoster({
      agents: { 'bmad-agent-b': agent({ name: 'B' }), 'bmad-agent-a': agent({ name: 'A' }) }
    })

    expect(parsed).toEqual({
      ok: true,
      agents: [
        { id: 'bmad-agent-b', ...agent({ name: 'B' }) },
        { id: 'bmad-agent-a', ...agent({ name: 'A' }) }
      ]
    })
    if (parsed.ok) {
      expect(Object.keys(parsed.agents[0]).sort()).toEqual(
        ['description', 'icon', 'id', 'module', 'name', 'team', 'title'].sort()
      )
    }
  })

  it('treats team as optional', () => {
    const withoutTeam = agent({ team: undefined })
    const parsed = parseRoster({ agents: { 'bmad-agent-a': withoutTeam } })

    expect(parsed.ok && 'team' in parsed.agents[0]).toBe(false)
    expect(parsed.ok).toBe(true)
  })

  it('drops unknown fields rather than forwarding them', () => {
    const parsed = parseRoster({
      agents: { 'bmad-agent-a': agent({ identity: 'secret', communication_style: 'x' }) }
    })

    expect(JSON.stringify(parsed)).not.toContain('secret')
    expect(JSON.stringify(parsed)).not.toContain('communication_style')
  })

  it.each([
    [{ agents: { 'a-1': agent({ name: undefined }) } }, 'agents.a-1.name · expected a non-empty string'],
    [{ agents: { 'a-1': agent({ module: '' }) } }, 'agents.a-1.module · expected a non-empty string'],
    [{ agents: { 'a-1': agent({ title: '  ' }) } }, 'agents.a-1.title · expected a non-empty string'],
    [{ agents: { 'a-1': agent({ icon: 3 }) } }, 'agents.a-1.icon · expected a string'],
    [{ agents: { 'a-1': agent({ description: undefined }) } }, 'agents.a-1.description · expected a string'],
    [{ agents: { 'a-1': agent({ team: 7 }) } }, 'agents.a-1.team · expected a string'],
    [{ agents: { 'a-1': 'nope' } }, 'agents.a-1 · expected an object'],
    [{ agents: [agent()] }, 'agents · expected an object'],
    [{ agents: null }, 'agents · expected an object'],
    [[], 'output · expected an object'],
    ['text', 'output · expected an object'],
    [null, 'output · expected an object']
  ])('rejects the whole answer for a wrong shape: %#', (value, detail) => {
    expect(parseRoster(value)).toEqual({ ok: false, detail })
  })

  it('rejects the whole roster when one entry among valid ones is wrong', () => {
    expect(
      parseRoster({ agents: { 'a-1': agent(), 'a-2': agent({ name: 5 }) } }).ok
    ).toBe(false)
  })

  it.each(['../../x', 'a/b', '-lead', '', 'a..b', '.hidden', 'a b'])(
    'refuses the unsafe id %j without echoing it',
    (id) => {
      const parsed = parseRoster({ agents: { 'safe-one': agent({ name: undefined }), [id]: agent() } })

      // The unsafe-id rule outranks every per-field rule, even on an earlier entry.
      expect(parsed).toEqual({ ok: false, detail: 'agents · unsafe agent id' })
    }
  )

  it.each([{}, { agents: {} }])('reads %j as the valid empty roster', (value) => {
    expect(parseRoster(value)).toEqual({ ok: true, agents: [] })
  })
})

describe('isSafeAgentId', () => {
  it('admits ordinary ids and refuses path shapes', () => {
    expect(isSafeAgentId('bmad-agent-analyst')).toBe(true)
    expect(isSafeAgentId('a.b_c-d')).toBe(true)
    expect(isSafeAgentId('..')).toBe(false)
    expect(isSafeAgentId('a/b')).toBe(false)
    expect(isSafeAgentId('')).toBe(false)
  })
})

describe('parseMenu', () => {
  it('holds the skill-versus-prompt decision beside each entry, in order', () => {
    const parsed = parseMenu(
      {
        'agent.menu': [
          { code: 'BP', description: 'Brainstorm', skill: 'bmad-brainstorming' },
          { code: 'MR', description: 'Market', prompt: 'Invoke it.' }
        ]
      },
      'Mary'
    )

    expect(parsed).toEqual({
      ok: true,
      problems: [],
      entries: [
        {
          code: 'BP',
          description: 'Brainstorm',
          action: { kind: 'skill', skill: 'bmad-brainstorming' }
        },
        { code: 'MR', description: 'Market', action: { kind: 'prompt', prompt: 'Invoke it.' } }
      ]
    })
  })

  it.each([
    [{ code: 'X1', description: 'd' }, 'menu · Mary · entry X1 has neither skill nor prompt'],
    [{ code: 'X1', description: 'd', skill: '', prompt: '' }, 'menu · Mary · entry X1 has neither skill nor prompt'],
    [{ code: 'X1', description: 'd', skill: 's', prompt: 'p' }, 'menu · Mary · entry X1 has both skill and prompt'],
    [{ code: 'X1', skill: 's' }, 'menu · Mary · entry X1 has no description'],
    [{ description: 'd', skill: 's' }, 'menu · Mary · entry 2 has no code'],
    ['nonsense', 'menu · Mary · entry 2 has no code']
  ])('drops a malformed entry and names it: %#', (bad, message) => {
    const parsed = parseMenu(
      { 'agent.menu': [{ code: 'OK', description: 'fine', skill: 's' }, bad] },
      'Mary'
    )

    expect(parsed).toEqual({
      ok: true,
      entries: [{ code: 'OK', description: 'fine', action: { kind: 'skill', skill: 's' } }],
      problems: [{ message }]
    })
  })

  it('keeps the first of two entries sharing a code and names the later one', () => {
    const parsed = parseMenu(
      {
        'agent.menu': [
          { code: 'BP', description: 'first', skill: 'a' },
          { code: 'BP', description: 'second', prompt: 'b' }
        ]
      },
      'Mary'
    )

    expect(parsed).toEqual({
      ok: true,
      entries: [{ code: 'BP', description: 'first', action: { kind: 'skill', skill: 'a' } }],
      problems: [{ message: 'menu · Mary · entry BP has a duplicate code' }]
    })
  })

  it('reads an absent agent.menu as a valid empty menu', () => {
    expect(parseMenu({}, 'Mary')).toEqual({ ok: true, entries: [], problems: [] })
  })

  it('rejects a non-array menu and a non-object answer', () => {
    expect(parseMenu({ 'agent.menu': {} }, 'Mary')).toEqual({
      ok: false,
      detail: 'agent.menu · expected an array'
    })
    expect(parseMenu([], 'Mary')).toEqual({ ok: false, detail: 'output · expected an object' })
  })
})

describe('parseOutputFolder', () => {
  it('reads the literal dotted key the resolver prints', () => {
    expect(parseOutputFolder({ 'core.output_folder': '{project-root}/_bmad' })).toEqual({
      ok: true,
      folder: '{project-root}/_bmad'
    })
  })

  it('reads an absent key as none, not as a failure', () => {
    expect(parseOutputFolder({})).toEqual({ ok: true, folder: null })
    expect(parseOutputFolder({ other: 'x' })).toEqual({ ok: true, folder: null })
  })

  it('does not read a nested core.output_folder: the key is one literal', () => {
    expect(parseOutputFolder({ core: { output_folder: 'x' } })).toEqual({ ok: true, folder: null })
  })

  it('rejects a non-object answer and a value that is not a non-empty string', () => {
    expect(parseOutputFolder([])).toEqual({ ok: false, detail: 'output · expected an object' })
    expect(parseOutputFolder('x')).toEqual({ ok: false, detail: 'output · expected an object' })
    for (const bad of [1, null, true, {}, [], '', '   ']) {
      expect(parseOutputFolder({ 'core.output_folder': bad }), JSON.stringify(bad)).toEqual({
        ok: false,
        detail: 'core.output_folder · expected a non-empty string'
      })
    }
  })
})

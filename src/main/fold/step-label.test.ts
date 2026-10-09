import { describe, expect, it } from 'vitest'
import { FIELD_BUFFER_MAX, LABEL_MAX, labelFieldOf, stepLabel } from './step-label'

const ROOT = '/work/project'

describe('the closed table', () => {
  it.each([
    ['Read', `${ROOT}/design/tokens.css`, 'read design/tokens.css'],
    ['Write', `${ROOT}/_bmad/prd.md`, 'write _bmad/prd.md'],
    ['Edit', 'src/a.ts', 'edit src/a.ts'],
    ['MultiEdit', 'src/a.ts', 'edit src/a.ts'],
    ['NotebookEdit', `${ROOT}/n.ipynb`, 'edit n.ipynb'],
    ['Skill', 'bmad-create-prd', 'skill bmad-create-prd'],
    ['Agent', 'general-purpose', 'agent general-purpose'],
    ['Task', 'Explore', 'agent Explore'],
    ['WebFetch', 'https://user:pw@docs.example.com:8443/a/b?q=secret#x', 'fetch docs.example.com']
  ])('labels %s as verb and its one target', (tool, field, label) => {
    expect(stepLabel(tool, field, ROOT)).toBe(label)
  })

  it('names the one field each tool reads, and none for the tools that carry the verb alone', () => {
    expect(labelFieldOf('Read')).toBe('file_path')
    expect(labelFieldOf('NotebookEdit')).toBe('notebook_path')
    expect(labelFieldOf('Bash')).toBe('command')
    expect(labelFieldOf('Skill')).toBe('skill')
    expect(labelFieldOf('Task')).toBe('subagent_type')
    expect(labelFieldOf('WebFetch')).toBe('url')
    for (const tool of ['Grep', 'Glob', 'WebSearch', 'mcp__x__y', 'constructor', '__proto__']) {
      expect(labelFieldOf(tool), tool).toBeUndefined()
    }
  })

  it.each([
    ['Grep', 'grep'],
    ['Glob', 'glob'],
    ['WebSearch', 'web search']
  ])('gives %s its verb and never its query', (tool, label) => {
    expect(stepLabel(tool, 'a secret search query', ROOT)).toBe(label)
    expect(stepLabel(tool, undefined, ROOT)).toBe(label)
  })

  it('gives a tool the table does not list its own name and nothing of its input', () => {
    expect(stepLabel('mcp__srv__lookup', 'secret', ROOT)).toBe('mcp__srv__lookup')
    expect(stepLabel('constructor', undefined, ROOT)).toBe('constructor')
    expect(stepLabel('a\u0007b\nc', undefined, ROOT)).toBe('abc')
    expect(stepLabel('', undefined, ROOT)).toBe('tool')
    expect(Array.from(stepLabel('t'.repeat(100), undefined, ROOT) ?? '')).toHaveLength(LABEL_MAX)
  })
})

describe('paths', () => {
  it('reduces a path outside the project to its basename', () => {
    expect(stepLabel('Read', '/etc/passwd', ROOT)).toBe('read passwd')
    expect(stepLabel('Read', `${ROOT}/../other/x.md`, ROOT)).toBe('read x.md')
    expect(stepLabel('Read', '/work/project-two/a.md', ROOT)).toBe('read a.md')
    expect(stepLabel('Read', '/Users/me/.ssh/id_rsa', ROOT)).toBe('read id_rsa')
    expect(JSON.stringify(stepLabel('Read', '/Users/me/.ssh/id_rsa', ROOT))).not.toContain('Users')
  })

  it('has no step for a memlog, inside the project or out', () => {
    for (const tool of ['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      expect(stepLabel(tool, `${ROOT}/_bmad/x/.memlog.md`, ROOT), tool).toBeUndefined()
      expect(stepLabel(tool, '/elsewhere/.memlog.md', ROOT), tool).toBeUndefined()
    }
    expect(stepLabel('Read', `${ROOT}/.memlog.md.bak`, ROOT)).toBe('read .memlog.md.bak')
  })

  it('cuts a long path from the left, so the label is 48 characters at most and ends as the path does', () => {
    const label = stepLabel('Read', `${ROOT}/${'dir/'.repeat(30)}file.md`, ROOT) ?? ''
    expect(Array.from(label)).toHaveLength(LABEL_MAX)
    expect(label.startsWith('read …')).toBe(true)
    expect(label.endsWith('dir/file.md')).toBe(true)
  })

  it('is the verb alone for an empty path or a field that never arrived', () => {
    expect(stepLabel('Read', '', ROOT)).toBe('read')
    expect(stepLabel('Read', '   ', ROOT)).toBe('read')
    expect(stepLabel('Read', undefined, ROOT)).toBe('read')
    expect(stepLabel('Read', '/', ROOT)).toBe('read')
  })
})

describe('Bash', () => {
  it.each([
    ['ls -la', 'run ls'],
    ['curl -H "Authorization: Bearer sk-x" https://h/x', 'run curl'],
    ['  npm   test', 'run npm'],
    ['FOO=1 BAR=baz node script.js --token abc', 'run node'],
    ['/usr/local/bin/python3 -c "print(1)"', 'run python3'],
    ['./scripts/build.sh arg', 'run build.sh'],
    ['g++ a.cc', 'run g++'],
    ['git\tstatus', 'run git'],
    ['cd /secret && cat key', 'run cd']
  ])('shows the program of %j and nothing after it', (command, label) => {
    expect(stepLabel('Bash', command, ROOT)).toBe(label)
  })

  it('is the verb alone when no first word is a program name', () => {
    for (const command of ['', '   ', 'FOO=1', '$(whoami) now', '"quoted prog" x', '`id`', 'a;b']) {
      expect(stepLabel('Bash', command, ROOT), command).toBe('run')
    }
    expect(stepLabel('Bash', undefined, ROOT)).toBe('run')
  })

  it('is the verb alone when a leading assignment opens a quote, since its value may hold the words after it', () => {
    expect(stepLabel('Bash', 'TOKEN="my secret value" curl https://h', ROOT)).toBe('run')
    expect(stepLabel('Bash', "TOKEN='my secret value' curl https://h", ROOT)).toBe('run')
    expect(stepLabel('Bash', 'A=1 TOKEN="x y" curl', ROOT)).toBe('run')
    expect(stepLabel('Bash', 'A=1 B=2 curl', ROOT)).toBe('run curl')
  })

  it('carries none of a 300-character command line', () => {
    const command = `deploy ${'--flag=value-that-is-long '.repeat(12)}`
    expect(command.length).toBeGreaterThan(300)
    expect(stepLabel('Bash', command, ROOT)).toBe('run deploy')
  })

  it('cuts a program name too long for the label from the right', () => {
    const label = stepLabel('Bash', 'p'.repeat(100), ROOT) ?? ''
    expect(Array.from(label)).toHaveLength(LABEL_MAX)
    expect(label.endsWith('…')).toBe(true)
  })
})

describe('WebFetch', () => {
  it('shows the host only, and the verb alone for a URL that does not parse', () => {
    expect(stepLabel('WebFetch', 'https://h/x?token=1', ROOT)).toBe('fetch h')
    expect(stepLabel('WebFetch', 'http://[::1]:3000/a', ROOT)).toBe('fetch [::1]')
    expect(stepLabel('WebFetch', 'not a url', ROOT)).toBe('fetch')
    expect(stepLabel('WebFetch', '', ROOT)).toBe('fetch')
  })
})

describe('control characters and the cap', () => {
  it('strips the characters that hide or reorder text, not only the controls', () => {
    expect(stepLabel('Skill', 'a\u200bb\u200fc\u202ed\u2066e\u2060f\ufeffg\u206fh', ROOT)).toBe('skill abcdefgh')
    expect(stepLabel('Read', 'dir/\u202egnp.md', ROOT)).toBe('read dir/gnp.md')
    expect(stepLabel('unlisted\u202etool', undefined, ROOT)).toBe('unlistedtool')
  })

  it('strips control characters from every target', () => {
    expect(stepLabel('Skill', 'bmad\u001b[31m-x\u0000\n', ROOT)).toBe('skill bmad[31m-x')
    expect(stepLabel('Read', 'a\u0007/b .md', ROOT)).toBe('read a/b.md')
    expect(stepLabel('Bash', 'l\u0000s -la', ROOT)).toBe('run ls')
  })

  it('cuts any other target from the right with an ellipsis, by whole characters', () => {
    const label = stepLabel('Skill', `${'é'.repeat(30)}${'\u{1f600}'.repeat(30)}`, ROOT) ?? ''
    expect(Array.from(label)).toHaveLength(LABEL_MAX)
    expect(label.endsWith('…')).toBe(true)
    expect(label).not.toMatch(/\p{Surrogate}/u)
  })

  it('never holds more than the label allows, whatever the input', () => {
    for (const tool of ['Read', 'Write', 'Bash', 'Skill', 'Agent', 'WebFetch', 'x'.repeat(200)]) {
      for (const field of ['y'.repeat(2_000), `${ROOT}/${'a/'.repeat(500)}`, 'https://' + 'h'.repeat(500) + '.com/']) {
        expect(Array.from(stepLabel(tool, field, ROOT) ?? '').length, tool).toBeLessThanOrEqual(LABEL_MAX)
      }
    }
  })

  it('declares its buffer as 1024 characters', () => {
    expect(FIELD_BUFFER_MAX).toBe(1024)
    expect(LABEL_MAX).toBe(48)
  })
})

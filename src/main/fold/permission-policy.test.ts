import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decidePermission } from './permission-policy'
import type { PermissionPolicy } from './permission-policy'

const ROOT = '/work/project'
const USER_DATA = '/Users/me/Library/Application Support/bmad-harness'
const HOME = '/Users/me'

/**
 * A file system with three links, resolved segment by segment so that a `..`
 * after a link steps out of where the link points, as the kernel does.
 */
const LINKS: Record<string, string> = {
  '/tmp': '/private/tmp',
  '/work/project/out': '/elsewhere',
  '/work/alias': '/work/project'
}

function canonicalize(path: string): string {
  let current = '/'
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      current = posix.dirname(current)
      continue
    }
    current = posix.join(current, part)
    current = LINKS[current] ?? current
  }
  return current
}

const POLICY: PermissionPolicy = {
  projectRoot: ROOT,
  userDataDir: USER_DATA,
  homeDir: HOME,
  canonicalize
}

const decide = (toolName: unknown, input: unknown, policy: PermissionPolicy = POLICY) =>
  decidePermission({ toolName, input }, policy)

const bash = (command: string, policy?: PermissionPolicy) => decide('Bash', { command }, policy)

function expectAllowed(decision: ReturnType<typeof decide>, input: unknown): void {
  expect(decision).toEqual({ behavior: 'allow', updatedInput: input })
}

function expectDenied(decision: ReturnType<typeof decide>, ...parts: string[]): void {
  expect(decision.behavior).toBe('deny')
  if (decision.behavior !== 'deny') return
  for (const part of parts) expect(decision.message).toContain(part)
}

describe('file tools', () => {
  it.each(['Write', 'Edit', 'MultiEdit', 'Read'])('allows %s inside the project, the input unchanged', (tool) => {
    const input = { file_path: `${ROOT}/notes/a.md`, content: 'a' }
    expectAllowed(decide(tool, input), input)
  })

  it('allows a relative path, read against the project root', () => {
    const input = { file_path: 'notes/a.md', content: 'a' }
    expectAllowed(decide('Write', input), input)
  })

  it('allows the app’s own data directory', () => {
    const input = { file_path: `${USER_DATA}/logs/x.log`, content: 'x' }
    expectAllowed(decide('Write', input), input)
  })

  it('denies a write outside, naming the path and the boundary', () => {
    expectDenied(decide('Write', { file_path: '/etc/hosts', content: '' }), '/etc/hosts', 'outside the project')
  })

  it('denies a read outside', () => {
    expectDenied(decide('Read', { file_path: `${HOME}/.ssh/id_ed25519` }), '.ssh/id_ed25519', 'outside the project')
  })

  it('reads a NotebookEdit by its notebook path', () => {
    expectAllowed(decide('NotebookEdit', { notebook_path: `${ROOT}/n.ipynb` }), { notebook_path: `${ROOT}/n.ipynb` })
    expectDenied(decide('NotebookEdit', { notebook_path: '/n.ipynb' }), 'outside the project')
  })

  it.each(['Glob', 'Grep', 'LS'])('bounds %s by its path, and takes no path as the working directory', (tool) => {
    expectAllowed(decide(tool, { pattern: '*.md' }), { pattern: '*.md' })
    expectAllowed(decide(tool, { path: `${ROOT}/src`, pattern: 'x' }), { path: `${ROOT}/src`, pattern: 'x' })
    expectDenied(decide(tool, { path: '/etc', pattern: 'x' }), '/etc', 'outside the project')
  })

  it('bounds an absolute Glob pattern by the directory it starts from', () => {
    expectAllowed(decide('Glob', { pattern: `${ROOT}/**/*.md` }), { pattern: `${ROOT}/**/*.md` })
    expectDenied(decide('Glob', { pattern: `${HOME}/**/*.pem` }), 'outside the project')
  })

  it('denies an escape by `..`, comparing the resolved path', () => {
    expectDenied(decide('Write', { file_path: `${ROOT}/../x`, content: '' }), `${ROOT}/../x`, 'outside the project')
    expectDenied(decide('Write', { file_path: '../x', content: '' }), 'outside the project')
    expectAllowed(decide('Write', { file_path: `${ROOT}/a/../b`, content: '' }), { file_path: `${ROOT}/a/../b`, content: '' })
  })

  it('denies an escape by a link that resolves outside, and by `..` taken after a link', () => {
    expectDenied(decide('Write', { file_path: `${ROOT}/out/x`, content: '' }), 'outside the project')
    expectDenied(decide('Write', { file_path: `${ROOT}/out/../project/x`, content: '' }), 'outside the project')
  })

  it('compares canonical paths, so a root reached through a link still matches', () => {
    const viaTmp: PermissionPolicy = { ...POLICY, projectRoot: '/tmp/subject' }
    const input = { file_path: '/private/tmp/subject/notes/a.md', content: 'a' }
    expectAllowed(decide('Write', input, viaTmp), input)
    expectAllowed(decide('Write', { file_path: '/work/alias/a.md' }), { file_path: '/work/alias/a.md' })
  })

  it('does not take a sibling whose name begins with the root’s for the root', () => {
    expectDenied(decide('Write', { file_path: '/work/project-other/a.md' }), 'outside the project')
  })

  it('expands a leading ~ to the home directory', () => {
    expectDenied(decide('Write', { file_path: '~/notes.md' }), '~/notes.md', 'outside the project')
    const inHome: PermissionPolicy = { ...POLICY, projectRoot: `${HOME}/code/p` }
    expectAllowed(decide('Write', { file_path: '~/code/p/a.md' }, inHome), { file_path: '~/code/p/a.md' })
  })
})

describe('non-file tools', () => {
  it.each(['Skill', 'Task', 'Agent', 'TodoWrite', 'ToolSearch', 'WebFetch', 'WebSearch'])('allows %s', (tool) => {
    const input = { anything: 1 }
    expectAllowed(decide(tool, input), input)
  })

  it.each(['mcp__github__create_issue', 'AskUserQuestion', 'KillShell', 'SomethingNew'])(
    'denies %s as not available to sessions here',
    (tool) => {
      expectDenied(decide(tool, {}), tool, 'not available to sessions here')
    }
  )
})

describe('a malformed request', () => {
  it.each([
    ['no tool name', undefined, {}],
    ['a tool name that is not text', 7, {}],
    ['an empty tool name', '', {}],
    ['an input that is not an object', 'Write', 'x'],
    ['an input that is null', 'Write', null],
    ['an input that is an array', 'Write', []],
    ['a file tool with no path', 'Write', { content: 'x' }],
    ['a file tool whose path is not text', 'Read', { file_path: 3 }],
    ['a Bash call with no command', 'Bash', {}]
  ])('is denied as unrecognised: %s', (_what, toolName, input) => {
    expect(decide(toolName, input)).toEqual({ behavior: 'deny', message: 'unrecognised permission request' })
  })
})

describe('Bash', () => {
  it.each([
    'uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-agent-analyst --project-root . --key agent 2>&1',
    'cat > notes/b.md <<EOF\nb\nEOF',
    'mkdir -p notes && cat > notes/b.md << \'EOF\'\nsee /etc/passwd and ~/x and ../../y\nEOF\necho done',
    'ls -la notes/ && for f in notes/a.md notes/b.md; do printf \'%s: \' "$f"; od -c "$f" | head -2; done',
    `cat ${ROOT}/notes/a.md`,
    `cat > ${ROOT}/notes/a.md`,
    'cd notes && cat ../README.md',
    'echo "see /etc/hosts in the docs"',
    'git commit -m "touch ../ and ~ in prose"',
    "echo 'a' | tee notes/a.md notes/b.md",
    'echo x >> notes/log.md 2>> notes/err.md'
  ])('allows a command that stays inside: %s', (command) => {
    expectAllowed(bash(command), { command })
  })

  it.each([
    ['an absolute argument', 'cat /etc/passwd', '/etc/passwd'],
    ['a ~ argument', 'cat ~/.ssh/config', '~/.ssh/config'],
    ['a $HOME argument', 'ls $HOME/Documents', '$HOME/Documents'],
    ['a ${HOME} argument', 'ls "${HOME}/Documents"', '${HOME}/Documents'],
    ['a .. argument that escapes', 'cat ../other/secret', '../other/secret'],
    ['a > target outside', 'echo x > /tmp/x', '/tmp/x'],
    ['a >> target outside', 'echo x >> ~/log', '~/log'],
    ['a quoted target outside', "echo x > '/Users/me/my file'", '/Users/me/my file'],
    ['a 2> target outside', 'make 2> /var/log/build.log', '/var/log/build.log'],
    ['a &> target outside', 'make &>/var/log/build.log', '/var/log/build.log'],
    ['a tee target outside', 'echo x | tee -a notes/a.md /tmp/copy', '/tmp/copy'],
    ['a relative target after cd outside', 'cd /tmp && cat > x', '/tmp'],
    ['a relative target after cd ..', 'cd .. && echo x > leaked.md', '..'],
    ['a path inside $(…)', 'echo $(cat /etc/passwd)', '/etc/passwd'],
    ['a path inside backticks', 'echo `cat ~/.netrc`', '~/.netrc'],
    ['a link that resolves outside', `cat > ${ROOT}/out/x`, `${ROOT}/out/x`],
    ['a command outside', '/Users/me/bin/tool', '/Users/me/bin/tool'],
    ['a path after a separator with no space', 'true;cat /etc/hosts', '/etc/hosts']
  ])('denies %s, naming the first offending path', (_what, command, path) => {
    expectDenied(bash(command), path, 'outside the project')
  })

  it('names the first offending path when there are several', () => {
    const decision = bash('cat /etc/a /etc/b > /tmp/c')
    expectDenied(decision, '/etc/a')
    expect(decision.behavior === 'deny' && decision.message).not.toContain('/etc/b')
  })

  it('tracks cd through the command, so a later relative target is read from where it went', () => {
    expectAllowed(bash('cd notes && cd .. && cat > a.md'), { command: 'cd notes && cd .. && cat > a.md' })
    expectDenied(bash('cd notes && cat > ../../x'), '../../x', 'outside the project')
  })

  it.each([
    'cat x > /dev/null',
    'cmd 2>/dev/null',
    'echo x > /dev/stderr',
    'echo x >/dev/stdout',
    'read x < /dev/tty',
    '/usr/bin/env python3 _bmad/scripts/x.py',
    '/bin/ls notes',
    '/opt/homebrew/bin/uv run x.py',
    '/Library/Developer/CommandLineTools/usr/bin/git status',
    'cmd 2>&1 | head',
    'cmd >&2'
  ])('allows a system path, which is not a data boundary: %s', (command) => {
    expectAllowed(bash(command), { command })
  })

  it('does not take a system directory for a write target', () => {
    expectDenied(bash('echo x > /usr/local/bin/tool'), '/usr/local/bin/tool', 'outside the project')
  })

  it('does not let `..` climb out of a system directory', () => {
    expectDenied(bash('cat /usr/../etc/passwd'), '/usr/../etc/passwd', 'outside the project')
  })

  it.each([
    'cat > "$OUT"',
    'cat $DIR/x',
    'cat "$(pwd)/notes/a.md"',
    'cat $(pwd)/notes/a.md',
    'cat `pwd`/notes/a.md',
    'echo $HOMEWORK/x',
    'python3 _bmad/scripts/anything.py'
  ])('allows an expansion with no literal outside path visible, the stated limit: %s', (command) => {
    expectAllowed(bash(command), { command })
  })

  it('reads a here-string as data, not a path', () => {
    expectAllowed(bash('cat <<< /etc/passwd'), { command: 'cat <<< /etc/passwd' })
  })

  it('skips a comment', () => {
    expectAllowed(bash('ls # not /etc'), { command: 'ls # not /etc' })
  })

  it('reads a here-document opened with <<- and a quoted delimiter, and scans what follows it', () => {
    const command = 'cat <<-"END" > notes/a.md\n\t/etc/passwd\n\tEND\ncat /etc/hosts'
    expectDenied(bash(command), '/etc/hosts')
  })

  it('allows writes to the app’s data directory from Bash too', () => {
    const command = `echo x >> "${USER_DATA}/logs/a.log"`
    expectAllowed(bash(command), { command })
  })
})

describe('Bash, the bypasses a review found', () => {
  describe('a `<<` that opens no here-document', () => {
    it.each([
      ['inside double quotes', 'echo "a <<EOF"\ncat /etc/passwd'],
      ['inside single quotes', "echo 'a <<EOF'\ncat /etc/passwd"],
      ['inside arithmetic', 'echo $((1<<2))\ncat /etc/passwd'],
      ['inside a comment', 'ls # <<EOF\ncat /etc/passwd']
    ])('drops no later line: %s', (_what, command) => {
      expectDenied(bash(command), '/etc/passwd', 'outside the project')
    })
  })

  describe('a here-document body', () => {
    it.each([
      ['$(…)', 'cat <<EOF > notes/a.md\n$(cat /etc/passwd)\nEOF'],
      ['backticks', 'cat <<EOF > notes/a.md\n`cat /etc/passwd`\nEOF'],
      ['$(…) after <<-', 'cat <<-EOF > notes/a.md\n\tx $(cat /etc/passwd) y\n\tEOF']
    ])('with an unquoted delimiter runs its %s, so they are scanned', (_what, command) => {
      expectDenied(bash(command), '/etc/passwd', 'outside the project')
    })

    it.each(["cat <<'EOF' > notes/a.md\n$(cat /etc/passwd)\nEOF", 'cat <<"EOF" > notes/a.md\n`cat /etc/passwd`\nEOF', 'cat <<\\EOF > notes/a.md\n$(cat /etc/passwd)\nEOF'])(
      'with a quoted delimiter is data and stays dropped: %s',
      (command) => {
        expectAllowed(bash(command), { command })
      }
    )

    it('with an unquoted delimiter still drops plain prose', () => {
      const command = 'cat <<EOF > notes/a.md\nsee /etc/passwd\nEOF'
      expectAllowed(bash(command), { command })
    })
  })

  describe('Glob with no path', () => {
    it.each(['../../**/*.pem', '~/**/*.pem', '../*'])('bounds a relative or ~ pattern by its literal prefix: %s', (pattern) => {
      expectDenied(decide('Glob', { pattern }), pattern, 'outside the project')
    })

    it('reads a relative pattern from its path when it has one', () => {
      expectDenied(decide('Glob', { path: `${ROOT}/src`, pattern: '../../*' }), 'outside the project')
      expectAllowed(decide('Glob', { path: `${ROOT}/src`, pattern: '../*.md' }), { path: `${ROOT}/src`, pattern: '../*.md' })
    })
  })

  describe('a path glued to an option', () => {
    it.each([
      ['after =', 'dd if=notes/a of=/etc/x', '/etc/x'],
      ['after a long option =', 'curl --output=/etc/x https://example.com', '/etc/x'],
      ['after a one-letter short flag', 'curl -o/etc/x https://example.com', '/etc/x'],
      ['after a short flag, ~', 'tar -f~/backup.tar -c notes', '~/backup.tar']
    ])('is seen %s', (_what, command, path) => {
      expectDenied(bash(command), path, 'outside the project')
    })

    it.each(['dd if=notes/a of=notes/b', 'curl -o notes/page.html https://example.com', 'ls -la notes', 'git log --format=%H'])(
      'is allowed inside: %s',
      (command) => {
        expectAllowed(bash(command), { command })
      }
    )
  })

  describe('quoting that hid a literal path', () => {
    it.each([
      ['$(…) inside double quotes', 'cat "$(cat /etc/passwd)"', '/etc/passwd'],
      ['backticks inside double quotes', 'echo "x `cat ~/.netrc` y"', '~/.netrc'],
      ['ANSI-C quoting', "cat $'/etc/passwd'", '/etc/passwd'],
      ['locale quoting', 'cat $"/etc/passwd"', '/etc/passwd'],
      ['a literal prefix before an expansion', 'cat > /etc/$NAME', '/etc/']
    ])('is seen: %s', (_what, command, path) => {
      expectDenied(bash(command), path, 'outside the project')
    })
  })

  describe('system directories', () => {
    it.each([
      ['rm -rf /opt/homebrew', '/opt/homebrew'],
      ['cp x /usr/local/bin/y', '/usr/local/bin/y'],
      ['ls /System/Library', '/System/Library']
    ])('are not exempt as an argument: %s', (command, path) => {
      expectDenied(bash(command), path, 'outside the project')
    })

    it.each([
      'head -c 8 /dev/urandom > notes/r',
      'cat /dev/random | head -c 1',
      'cat /dev/zero | head -c 1 > notes/z',
      'cat /dev/stdin > notes/in.md',
      'echo x > /dev/fd/2',
      'diff notes/a /dev/fd/63'
    ])('allows the devices, argument or target: %s', (command) => {
      expectAllowed(bash(command), { command })
    })
  })

  describe('cd with no target the scan can follow', () => {
    it.each([
      ['bare cd', 'cd && echo x > leaked.md', '`cd`'],
      ['cd -', 'cd - && echo x > leaked.md', '`cd -`'],
      ['cd to an expansion', 'cd "$DIR" && echo x > a.md', '`cd $DIR`'],
      ['cd to a substitution', 'cd $(mktemp -d) && echo x > a.md', '`cd $(mktemp -d)`'],
      ['bare pushd', 'pushd && echo x > a.md', '`pushd`'],
      ['popd', 'pushd notes && popd && echo x > a.md', '`popd`']
    ])('is denied as leaving the project, naming the command: %s', (_what, command, shown) => {
      expectDenied(bash(command), shown, 'outside the project')
    })

    it('follows pushd to a literal directory', () => {
      expectAllowed(bash('pushd notes && cat > ../a.md'), { command: 'pushd notes && cat > ../a.md' })
      expectDenied(bash('pushd notes && cat > ../../a.md'), '../../a.md')
    })

    it('restores the directory at the end of a subshell', () => {
      expectDenied(bash('(cd notes) && cat > ../x'), '../x', 'outside the project')
      expectAllowed(bash('(cd notes && cat > ../x)'), { command: '(cd notes && cat > ../x)' })
      expectDenied(bash('(cd notes; cd sub) ; cat > ../x'), '../x')
    })
  })
})

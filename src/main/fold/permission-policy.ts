import { posix } from 'node:path'

/**
 * Whether a persona session may use a tool, asked by the CLI for each call that
 * would otherwise prompt (`--permission-prompt-tool stdio`). The answer is a
 * fixed policy: what stays inside the project root or the app's own data
 * directory is allowed, everything else is denied with a short reason the
 * persona can relay.
 *
 * - File tools are bounded by their path, compared after canonicalisation, so
 *   `/tmp` and `/private/tmp`, `..` and links cannot step out. A read is bounded
 *   like a write. A read tool with no path reads the working directory.
 * - Tools with no file system effect (`Skill`, `Task`/`Agent`, `TodoWrite`,
 *   `ToolSearch`, `WebFetch`, `WebSearch`) are allowed. Any other tool, MCP
 *   tools and `AskUserQuestion` included, is denied.
 * - `Bash` is checked for paths written in the command. It reads the tokens
 *   that begin `/`, `~`, `$HOME` or `${HOME}`, or hold a `..` segment (and the
 *   text after an option's `=` or a one-letter short flag), every redirect and
 *   `tee` target, and the commands inside `$(…)`, backticks and the bodies of
 *   here-documents with an unquoted delimiter. It follows `cd` and `pushd`
 *   through the command, restores the directory when a subshell ends, and
 *   denies a `cd` it cannot follow. System executable directories are allowed
 *   only as the command itself; devices are allowed anywhere.
 *
 * This is a boundary check, not a sandbox. Its stated limits:
 * - a path built by an expansion (`$DIR/x`, `$(pwd)/x`) or by a script's own
 *   logic is not seen, and a script it allows (`uv run`, `python3`) can touch
 *   anything;
 * - a relative symlink, or a dangling link, reached through a Bash argument is
 *   resolved only as far as the canonicaliser can see it;
 * - writes to protected files inside the project (`.claude/settings*`,
 *   `.git/hooks`) are allowed like any other file in the project;
 * - a word beginning `/` inside a regex or a search string counts as a path, so
 *   `sed -n '/x/p'` is denied.
 *
 * Pure: the file system (canonicalisation) and the home directory are handed
 * in, and nothing here reads either.
 */

/** What the CLI asked, as it arrived: nothing about it is trusted yet. */
export type PermissionRequest = { toolName: unknown; input: unknown }

export type PermissionAnswer =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string }

export type PermissionPolicy = {
  /** The session's working directory: relative paths are read against it. */
  projectRoot: string
  userDataDir: string
  homeDir: string
  /**
   * An absolute path as the file system resolves it: links followed and `..`
   * applied where they fall. A tail that does not exist yet is kept as written.
   */
  canonicalize: (absolutePath: string) => string
}

const UNRECOGNISED = 'unrecognised permission request'

/** The tools bounded by a path, and the field it is in. A required path that is missing is malformed. */
const FILE_TOOLS: Readonly<Record<string, { field: string; required: boolean }>> = {
  Read: { field: 'file_path', required: true },
  Write: { field: 'file_path', required: true },
  Edit: { field: 'file_path', required: true },
  MultiEdit: { field: 'file_path', required: true },
  NotebookEdit: { field: 'notebook_path', required: true },
  Glob: { field: 'path', required: false },
  Grep: { field: 'path', required: false },
  LS: { field: 'path', required: false }
}

/** No file system effect of their own. */
const OPEN_TOOLS = new Set(['Skill', 'Task', 'Agent', 'TodoWrite', 'ToolSearch', 'WebFetch', 'WebSearch'])

/** Executables, never data: allowed as the command Bash runs, and nowhere else. */
const SYSTEM_DIRS = ['/bin', '/usr', '/opt/homebrew', '/Library/Developer', '/System']
/** Devices: allowed anywhere, a redirect target included. */
const DEVICES = new Set([
  '/dev/null',
  '/dev/stdin',
  '/dev/stdout',
  '/dev/stderr',
  '/dev/tty',
  '/dev/zero',
  '/dev/random',
  '/dev/urandom'
])

const outsideMessage = (path: string): string => `blocked: ${path} is outside the project`

const allow = (input: Record<string, unknown>): PermissionAnswer => ({ behavior: 'allow', updatedInput: input })
const deny = (message: string): PermissionAnswer => ({ behavior: 'deny', message })

export function decidePermission(request: PermissionRequest, policy: PermissionPolicy): PermissionAnswer {
  const { toolName, input } = request
  if (typeof toolName !== 'string' || toolName === '' || !isObject(input)) {
    return deny(UNRECOGNISED)
  }
  if (OPEN_TOOLS.has(toolName)) {
    return allow(input)
  }
  const bounds = createBounds(policy)

  if (toolName === 'Bash') {
    if (typeof input.command !== 'string') return deny(UNRECOGNISED)
    const message = firstOutside(input.command, policy.projectRoot, bounds)
    return message === undefined ? allow(input) : deny(message)
  }

  const file = Object.hasOwn(FILE_TOOLS, toolName) ? FILE_TOOLS[toolName] : undefined
  if (file === undefined) {
    return deny(`blocked: the ${toolName} tool is not available to sessions here`)
  }
  const path = input[file.field]
  if (path === undefined && !file.required) {
    return toolName === 'Glob' ? globAnswer(input, bounds, policy.projectRoot) : allow(input)
  }
  if (typeof path !== 'string' || path === '') {
    return deny(UNRECOGNISED)
  }
  if (bounds.outside(path, policy.projectRoot)) {
    return deny(outsideMessage(path))
  }
  return toolName === 'Glob'
    ? globAnswer(input, bounds, bounds.absolute(path, policy.projectRoot) ?? policy.projectRoot)
    : allow(input)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A Glob pattern reaches as far as its literal prefix, the directories before
 * its first wildcard: `~` expanded, a relative one read from `from`.
 */
function globAnswer(input: Record<string, unknown>, bounds: Bounds, from: string): PermissionAnswer {
  const pattern = input.pattern
  if (typeof pattern !== 'string') return allow(input)
  const wild = pattern.search(/[*?[{]/)
  const prefix = wild === -1 ? pattern : pattern.slice(0, pattern.lastIndexOf('/', wild) + 1)
  return bounds.outside(prefix === '' ? '.' : prefix, from) ? deny(outsideMessage(pattern)) : allow(input)
}

type Bounds = {
  /** An absolute path, `~` and `$HOME` expanded, relative ones read against `cwd`; undefined when it cannot be known. */
  absolute(raw: string, cwd: string): string | undefined
  /** Whether `raw`, read from `cwd`, lies outside both the project root and the data directory. */
  outside(raw: string, cwd: string): boolean
}

function createBounds(policy: PermissionPolicy): Bounds {
  const roots = [policy.projectRoot, policy.userDataDir].map((root) => policy.canonicalize(root))
  const absolute = (raw: string, cwd: string): string | undefined => {
    const expanded = expandHome(raw, policy.homeDir)
    if (expanded === undefined) return undefined
    // Joined by hand, not resolved: a `..` must be applied by the canonicaliser
    // after the links before it, as the file system applies it.
    return posix.isAbsolute(expanded) ? expanded : `${cwd}/${expanded}`
  }
  return {
    absolute,
    outside(raw, cwd) {
      const path = absolute(raw, cwd)
      if (path === undefined) return true
      const real = policy.canonicalize(path)
      return !roots.some((root) => within(root, real))
    }
  }
}

const HOME_PREFIX = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/

/** `~`, `$HOME` and `${HOME}` as the home directory; `~user` cannot be known here. */
function expandHome(raw: string, homeDir: string): string | undefined {
  if (HOME_PREFIX.test(raw)) return raw.replace(HOME_PREFIX, homeDir)
  if (raw.startsWith('~')) return undefined
  return raw
}

function within(root: string, target: string): boolean {
  const between = posix.relative(root, target)
  return between === '' || (between !== '..' && !between.startsWith('../') && !posix.isAbsolute(between))
}

/** A token Bash would read as a path whatever command it is given to. */
function looksLikePath(word: string): boolean {
  return (
    word.startsWith('/') ||
    word.startsWith('~') ||
    HOME_PREFIX.test(word) ||
    word.split('/').includes('..')
  )
}

function isDevice(word: string): boolean {
  if (!posix.isAbsolute(word)) return false
  const path = posix.normalize(word)
  return DEVICES.has(path) || /^\/dev\/fd\/\d+$/.test(path)
}

function isSystemPath(word: string): boolean {
  if (!posix.isAbsolute(word)) return false
  const path = posix.normalize(word)
  return isDevice(path) || SYSTEM_DIRS.some((dir) => path === dir || path.startsWith(`${dir}/`))
}

// ---------------------------------------------------------------------------
// The Bash scan

type Token =
  | { kind: 'word'; text: string }
  | { kind: 'op'; text: string }
  | { kind: 'redirect'; text: string }
  /** A command the shell runs from inside a word or a here-document: `$(…)` or backticks. */
  | { kind: 'nested'; text: string }

/** Ends a command: the next word is a command name. */
const COMMAND_BREAKS = new Set([';', ';;', '\n', '&&', '||', '|', '|&', '&', '(', ')'])

/** The commands that change the working directory. */
const DIRECTORY_COMMANDS = new Set(['cd', 'pushd', 'popd'])

/**
 * The deny message for the first path in `command` that lies outside, or for a
 * `cd` the scan cannot follow; undefined when nothing visible leaves. A
 * subshell, and every `$(…)` or backtick command, has its own working
 * directory, restored when it ends.
 */
function firstOutside(command: string, projectRoot: string, bounds: Bounds): string | undefined {
  let cwd = projectRoot
  const subshells: string[] = []
  let atCommand = true
  let name = ''
  /** The words of the current command so far, for naming a `cd` that cannot be followed. */
  let words: string[] = []
  let pending: 'target' | 'skip' | 'dup' | undefined
  /** A directory command whose target is still to come; unfollowed if the command ends first. */
  let move: 'open' | 'taken' | undefined

  const unfollowed = (): string => `blocked: \`${words.join(' ')}\` may move outside the project`
  /** Check the visible literal part of `word`, naming the word as written. */
  const check = (word: string, isTarget: boolean): string | undefined => {
    const literal = literalPart(word)
    if (literal === '' || isDevice(literal)) return undefined
    if (!isTarget && !looksLikePath(literal)) return undefined
    return bounds.outside(literal, cwd) ? outsideMessage(word) : undefined
  }

  for (const token of tokenize(command)) {
    if (token.kind === 'nested') {
      const found = firstOutside(token.text, cwd, bounds)
      if (found !== undefined) return found
      continue
    }
    if (token.kind === 'op') {
      pending = undefined
      if (COMMAND_BREAKS.has(token.text)) {
        if (move === 'open') return unfollowed()
        move = undefined
        atCommand = true
        name = ''
        words = []
      }
      if (token.text === '(') subshells.push(cwd)
      if (token.text === ')') cwd = subshells.pop() ?? cwd
      continue
    }
    if (token.kind === 'redirect') {
      pending = token.text.startsWith('<<') ? 'skip' : token.text.endsWith('&') ? 'dup' : 'target'
      continue
    }

    const word = token.text
    if (pending !== undefined) {
      const kind = pending
      pending = undefined
      if (kind === 'skip') continue
      if (kind === 'dup' && /^(?:\d+-?|-)$/.test(word)) continue
      const found = check(word, true)
      if (found !== undefined) return found
      continue
    }
    words.push(word)

    if (atCommand) {
      // An assignment before the command leaves the command still to come.
      if (/^[A-Za-z_]\w*=/.test(word)) {
        const found = check(word.slice(word.indexOf('=') + 1), false)
        if (found !== undefined) return found
        continue
      }
      atCommand = false
      name = posix.basename(word)
      move = DIRECTORY_COMMANDS.has(name) ? 'open' : undefined
      if (name === 'popd') return unfollowed()
      if (isSystemPath(literalPart(word))) continue
      const found = check(word, false)
      if (found !== undefined) return found
      continue
    }

    if (name === 'tee' && !word.startsWith('-')) {
      const found = check(word, true)
      if (found !== undefined) return found
      continue
    }
    for (const candidate of pathCandidates(word)) {
      const found = check(candidate, false)
      if (found !== undefined) return found
    }
    if (move === 'open' && (word === '-' || !word.startsWith('-'))) {
      move = 'taken'
      const target = word === '-' || /^[+-]\d/.test(word) || literalPart(word) !== word ? undefined : word
      const next = target === undefined ? undefined : bounds.absolute(target, cwd)
      if (next === undefined) return unfollowed()
      cwd = next
    }
  }
  if (move === 'open') return unfollowed()
  return undefined
}

/** A word, and the path an option may carry glued to it: after the first `=`, or after a one-letter short flag. */
function pathCandidates(word: string): string[] {
  const candidates = [word]
  const equals = word.indexOf('=')
  if (equals !== -1) candidates.push(word.slice(equals + 1))
  if (/^-[A-Za-z]./.test(word)) candidates.push(word.slice(2))
  return candidates
}

/**
 * The part of a word the scan can read: up to the first expansion other than a
 * leading `~`, `$HOME` or `${HOME}`. `$NAME/x` reads as nothing; `/etc/$NAME`
 * reads as `/etc/`.
 */
function literalPart(word: string): string {
  const home = HOME_PREFIX.exec(word)?.[0] ?? ''
  const rest = word.slice(home.length)
  const cut = rest.search(/[$`]/)
  return home + (cut === -1 ? rest : rest.slice(0, cut))
}

/** Where the `(` at `open` closes, quotes and nesting respected: the index just after its `)`. */
function parenEnd(text: string, open: number): number {
  let depth = 0
  let at = open
  while (at < text.length) {
    const char = text[at]
    if (char === '\\') {
      at += 2
      continue
    }
    if (char === "'" || char === '"') {
      const close = text.indexOf(char, at + 1)
      at = close === -1 ? text.length : close + 1
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return at + 1
    }
    at += 1
  }
  return text.length
}

/** Where the backtick command opened at `start` closes: the index just after it. */
function backtickEnd(text: string, start: number): number {
  let at = start + 1
  while (at < text.length && text[at] !== '`') at += text[at] === '\\' ? 2 : 1
  return Math.min(at + 1, text.length)
}

/**
 * A `$((…))`, `$(…)` or backtick span starting at `at`, if one does: where it
 * ends, and the command it runs (none for arithmetic).
 */
function expansionAt(text: string, at: number): { end: number; command?: string } | undefined {
  if (text.startsWith('$((', at)) return { end: parenEnd(text, at + 1) }
  if (text.startsWith('$(', at)) {
    const end = parenEnd(text, at + 1)
    return { end, command: text.slice(at + 2, text[end - 1] === ')' ? end - 1 : end) }
  }
  if (text[at] === '`') {
    const end = backtickEnd(text, at)
    return { end, command: text.slice(at + 1, text[end - 1] === '`' ? end - 1 : end) }
  }
  return undefined
}

/** The commands a here-document body with an unquoted delimiter runs: its `$(…)` and backtick spans. */
function commandsIn(body: string): string[] {
  const commands: string[] = []
  let at = 0
  while (at < body.length) {
    if (body[at] === '\\') {
      at += 2
      continue
    }
    const span = expansionAt(body, at)
    if (span === undefined) {
      at += 1
      continue
    }
    if (span.command !== undefined) commands.push(span.command)
    at = span.end
  }
  return commands
}

/**
 * Words, operators, redirects and nested commands, with quotes removed and
 * escapes applied. An expansion stays in its word as written, so the word's
 * literal part ends where it begins, and the command it runs is a `nested`
 * token after the word. A `<<` read as an operator here, and only there, opens
 * a here-document: its body is dropped as data, except the commands a body
 * with an unquoted delimiter runs.
 */
function tokenize(command: string): Token[] {
  const tokens: Token[] = []
  let word = ''
  let inWord = false
  /** Whether a quote or escape appeared in the word: a quoted here-document delimiter. */
  let quoted = false
  let nested: string[] = []
  /** A here-document operator whose delimiter is the next word. */
  let opening: { tabs: boolean } | undefined
  const heredocs: { delimiter: string; tabs: boolean; quoted: boolean }[] = []
  let at = 0

  const endWord = (): void => {
    if (inWord) {
      tokens.push({ kind: 'word', text: word })
      if (opening !== undefined) {
        heredocs.push({ delimiter: word, tabs: opening.tabs, quoted })
        opening = undefined
      }
    }
    for (const text of nested) tokens.push({ kind: 'nested', text })
    nested = []
    word = ''
    inWord = false
    quoted = false
  }
  const op = (text: string): void => {
    endWord()
    tokens.push({ kind: 'op', text })
  }
  /** An expansion at `at` joins the word as written; the command it runs is scanned after it. */
  const takeExpansion = (): boolean => {
    const span = expansionAt(command, at)
    if (span === undefined) return false
    inWord = true
    word += command.slice(at, span.end)
    if (span.command !== undefined) nested.push(span.command)
    at = span.end
    return true
  }
  /** The bodies of the here-documents opened on the line just ended. */
  const readBodies = (): void => {
    for (const heredoc of heredocs.splice(0)) {
      const body: string[] = []
      while (at < command.length) {
        const close = command.indexOf('\n', at)
        const end = close === -1 ? command.length : close
        const line = command.slice(at, end)
        at = end + 1
        if ((heredoc.tabs ? line.replace(/^\t+/, '') : line) === heredoc.delimiter) break
        body.push(line)
      }
      if (!heredoc.quoted) {
        for (const text of commandsIn(body.join('\n'))) tokens.push({ kind: 'nested', text })
      }
    }
  }

  while (at < command.length) {
    const char = command[at]
    const next = command[at + 1] ?? ''

    if (char === ' ' || char === '\t') {
      endWord()
      at += 1
    } else if (char === '\n') {
      op('\n')
      at += 1
      readBodies()
    } else if (char === '#' && !inWord) {
      while (at < command.length && command[at] !== '\n') at += 1
    } else if (char === '$' && (next === "'" || next === '"')) {
      // ANSI-C and locale quoting: the quoted text is a plain word.
      at += 1
    } else if (char === "'") {
      inWord = true
      quoted = true
      const close = command.indexOf("'", at + 1)
      const end = close === -1 ? command.length : close
      word += command.slice(at + 1, end)
      at = end + 1
    } else if (char === '"') {
      inWord = true
      quoted = true
      at += 1
      while (at < command.length && command[at] !== '"') {
        if (takeExpansion()) continue
        if (command[at] === '\\' && /["\\$`]/.test(command[at + 1] ?? '')) at += 1
        word += command[at] ?? ''
        at += 1
      }
      at += 1
    } else if (char === '\\') {
      if (next !== '\n') {
        inWord = true
        quoted = true
        word += next
      }
      at += 2
    } else if (char === '$' || char === '`') {
      if (!takeExpansion()) {
        inWord = true
        word += char
        at += 1
      }
    } else if (char === '(' && next === '(' && !inWord) {
      // An arithmetic command: no words, no redirects.
      at = parenEnd(command, at)
    } else if (char === '(' || char === ')' || char === ';' || char === '|' || (char === '&' && next !== '>')) {
      const pair = char + next
      const text = ['&&', '||', '|&', ';;'].includes(pair) ? pair : char
      op(text)
      at += text.length
    } else if (char === '<' || char === '>' || char === '&') {
      // A file descriptor written against its redirect (`2>`) belongs to it.
      if (inWord && /^\d+$/.test(word) && nested.length === 0) {
        word = ''
        inWord = false
      }
      endWord()
      const text = /^(?:<<<|<<-|&>>|<<|>>|>\||>&|<&|<>|&>|<|>)/.exec(command.slice(at))?.[0] ?? char
      tokens.push({ kind: 'redirect', text })
      if (text === '<<' || text === '<<-') opening = { tabs: text === '<<-' }
      at += text.length
    } else {
      inWord = true
      word += char
      at += 1
    }
  }
  endWord()
  return tokens
}

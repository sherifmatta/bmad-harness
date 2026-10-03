// Runs real `claude` sessions with the product's own argv (read from source, no permission mode).
// Subjects are made under $SPIKE_SUBJECTS when set (keep them outside the repo), else beside this file.
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const REPO = '/Users/sherifmatta/Learnings/bmad-harness'
const OUT = new URL('.', import.meta.url).pathname
const BASE = process.env.SPIKE_SUBJECTS ?? join(OUT, 'subjects')
const src = readFileSync(`${REPO}/src/main/sources/session/session-process.ts`, 'utf8')
const block = src.match(/SESSION_ARGS: readonly string\[\] = \[([\s\S]*?)\]/)[1]
const ARGS = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
// Since item 32 the product argv carries `--permission-prompt-tool stdio`; a permission mode, a model or a prompt is still refused.
if (ARGS.some((a) => /permission-mode|model|system-prompt/.test(a))) throw new Error('argv not the product argv')

function subject(name) {
  const dir = join(BASE, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, '_bmad'), { recursive: true })
  cpSync(`${REPO}/.claude`, join(dir, '.claude'), { recursive: true })
  for (const p of ['_config', 'bmm', 'core', 'custom', 'scripts', 'config.toml', 'config.user.toml', 'brainstorming', 'party-mode'])
    if (existsSync(`${REPO}/_bmad/${p}`)) cpSync(`${REPO}/_bmad/${p}`, join(dir, '_bmad', p), { recursive: true })
  return dir
}

function session(label, cwd, turns, turnTimeoutMs = 300000, extra = [], allowAll = false) {
  return new Promise((resolve) => {
    const child = spawn('claude', [...ARGS, ...extra], { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const frames = []
    const texts = []
    const results = []
    const tools = []
    let cur = ''
    let sent = 0
    let stderr = ''
    const controlRequests = []
    child.stderr.on('data', (d) => (stderr += d))
    const send = (text) => {
      sent += 1
      child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n')
    }
    const guard = setTimeout(() => child.kill('SIGKILL'), turnTimeoutMs * turns.length)
    createInterface({ input: child.stdout }).on('line', (line) => {
      frames.push(line)
      let f
      try { f = JSON.parse(line) } catch { return }
      if (f.type === 'control_request') {
        controlRequests.push({ subtype: f.request?.subtype, tool: f.request?.tool_name, input: JSON.stringify(f.request?.input ?? {}).slice(0, 200) })
        if (allowAll && f.request?.subtype === 'can_use_tool') child.stdin.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: f.request_id, response: { behavior: 'allow', updatedInput: f.request.input } } }) + '\n')
      }
      if (f.type === 'stream_event' && !f.parent_tool_use_id) {
        const ev = f.event
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') cur += ev.delta.text
        if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') tools.push(ev.content_block.name)
      }
      if (f.type === 'result') {
        texts.push(cur); cur = ''
        results.push({ subtype: f.subtype, is_error: f.is_error, stop_reason: f.stop_reason, denials: f.permission_denials, result: (f.result ?? '').slice(0, 4000), cost: f.total_cost_usd })
        if (sent < turns.length) send(turns[sent])
        else child.stdin.end()
      }
    })
    child.on('close', (code, signal) => {
      clearTimeout(guard)
      writeFileSync(join(OUT, `${label}.jsonl`), frames.join('\n') + '\n')
      const out = { label, argv: ['claude', ...ARGS, ...extra], controlRequests, claude: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(), exit: { code, signal }, turns: turns.map((t, i) => ({ sent: t, reply: texts[i] ?? null, result: results[i] ?? null })), toolNames: tools, stderr: stderr.slice(0, 2000) }
      writeFileSync(join(OUT, `${label}.summary.json`), JSON.stringify(out, null, 2))
      resolve(out)
    })
    send(turns[0])
  })
}

const which = process.argv[2]
const MARY = '/bmad-agent-analyst'
const JOHN = '/bmad-agent-pm'
const SAME = 'In three sentences, introduce yourself and tell me what you would ask first about a product idea I am about to describe.'
if (which === 'voice') {
  const [a, b] = [subject('voice-mary'), subject('voice-john')]
  await Promise.all([session('voice-mary', a, [MARY, SAME]), session('voice-john', b, [JOHN, SAME])])
} else if (which === 'write') {
  const dir = subject('write')
  await session('write', dir, [MARY, 'Please create the file notes/hello.md in this project containing exactly one line: hello. Do it now and tell me whether it worked.'])
} else if (which === 'handoff') {
  const dir = subject('handoff')
  await session('handoff-mary', dir, [MARY, 'Quick decision, chat only: we decided the product is called Lantern, the first user is solo founders, and the first release has no accounts. Do not write anything to disk. Just confirm back.'])
  await session('handoff-john', dir, [JOHN, 'Mary and I just talked. What did we decide, and where do you pick up?'])
}

if (which === 'perm') {
  const label = process.argv[3]
  const extra = JSON.parse(process.argv[4])
  const allowAll = process.argv[5] === 'allow'
  const dir = subject(label)
  await session(label, dir, [MARY, 'Create notes/a.md with the Write tool containing exactly: a. Then create notes/b.md using a bash heredoc (cat with a heredoc) containing exactly: b. Report which of the two worked.'], 300000, extra, allowAll)
  const have = ['a', 'b'].map((x) => existsSync(join(dir, 'notes', x + '.md')))
  writeFileSync(join(OUT, label + '.files.json'), JSON.stringify({ 'notes/a.md': have[0], 'notes/b.md': have[1] }))
}

// Finding 5: the product's own `spawnSession` and policy, bundled from source, against a real `claude`.
if (which === 'policy') {
  const { build } = await import('esbuild')
  const bundle = join(BASE, 'policy-bundle.mjs')
  await build({
    stdin: {
      contents: [
        "export { spawnSession, SESSION_ARGS } from './src/main/sources/session/session-process'",
        "export { decidePermission } from './src/main/fold/permission-policy'",
        "export { canonicalPath } from './src/main/sources/session/canonical-path'"
      ].join('\n'),
      resolveDir: REPO,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'silent'
  })
  const { spawnSession, SESSION_ARGS, decidePermission, canonicalPath } = await import(bundle)

  const dir = subject('policy')
  const outside = join(BASE, 'policy-outside')
  rmSync(outside, { recursive: true, force: true })
  mkdirSync(outside, { recursive: true })
  const userData = join(BASE, 'policy-userdata')
  mkdirSync(userData, { recursive: true })
  // Paths in the summary are shown relative to where the run made them; no home path is kept.
  const redact = (text) =>
    [[outside, '<base>/policy-outside'], [dir, '<subject>'], [BASE, '<base>'], [homedir(), '~']]
      .flatMap(([path, name]) => [[canonicalPath(path), name], [path, name]])
      .reduce((shown, [path, name]) => shown.split(path).join(name), String(text))

  const turns = [
    'Create notes/a.md with the Write tool containing exactly: a. Then create notes/b.md using a bash heredoc (cat with a heredoc) containing exactly: b. ' +
      `Then create the file ${outside}/c.md with the Write tool containing exactly: c. ` +
      'Report which of the three worked and, for any that did not, the exact reason you were given.'
  ]
  const asked = []
  const results = []
  const texts = []
  const tools = []
  let cur = ''
  let sent = 0
  await new Promise((resolve) => {
    let live
    const guard = setTimeout(() => live?.kill(), 600000)
    spawnSession({
      agentId: 'bmad-agent-analyst',
      cwd: dir,
      decide: (ask) => {
        const answer = decidePermission(ask, { projectRoot: dir, userDataDir: userData, homeDir: homedir(), canonicalize: canonicalPath })
        asked.push({
          tool: ask.toolName,
          input: redact(JSON.stringify(ask.input ?? {}).slice(0, 300)),
          behavior: answer.behavior,
          ...(answer.behavior === 'deny' ? { message: redact(answer.message) } : {})
        })
        return answer
      },
      onFrame: (f) => {
        if (f.type === 'stream_event' && !f.parent_tool_use_id) {
          const ev = f.event
          if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') cur += ev.delta.text
          if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') tools.push(ev.content_block.name)
        }
        if (f.type === 'control_request' || f.type === 'control_cancel_request' || f.type === 'control_response') {
          results.push({ leaked: f.type })
        }
        if (f.type === 'result' && !f.parent_tool_use_id) {
          texts.push(redact(cur)); cur = ''
          results.push({ subtype: f.subtype, is_error: f.is_error, stop_reason: f.stop_reason, denials: JSON.parse(redact(JSON.stringify(f.permission_denials ?? null))), cost: f.total_cost_usd })
          if (sent < turns.length) void live.write(turns[sent++])
          else live.kill()
        }
      },
      onExit: () => {
        clearTimeout(guard)
        resolve()
      }
    }).then((outcome) => {
      if (!outcome.ok) throw new Error(`spawn failed: ${outcome.errno}`)
      live = outcome.session
    })
  })
  const files = {
    'notes/a.md': existsSync(join(dir, 'notes', 'a.md')),
    'notes/b.md': existsSync(join(dir, 'notes', 'b.md')),
    '<base>/policy-outside/c.md': existsSync(join(outside, 'c.md'))
  }
  const out = {
    label: 'policy',
    argv: ['claude', ...SESSION_ARGS],
    through: 'spawnSession + decidePermission + canonicalPath, bundled from src/',
    claude: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
    permissionRequests: asked,
    turns: ['/bmad-agent-analyst', ...turns].map((t, i) => ({ sent: redact(t), reply: texts[i] ?? null, result: results.filter((r) => !r.leaked)[i] ?? null })),
    controlFramesHandedToOnFrame: results.filter((r) => r.leaked).length,
    toolNames: tools,
    files
  }
  writeFileSync(join(OUT, 'policy.summary.json'), JSON.stringify(out, null, 2))
  writeFileSync(join(OUT, 'policy.files.json'), JSON.stringify(files))
  console.log(JSON.stringify({ files, requests: asked.length, results: out.turns.map((t) => t.result) }, null, 2))
}

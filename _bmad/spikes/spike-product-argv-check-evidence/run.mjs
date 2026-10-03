// Runs real `claude` sessions with the product's own argv (read from source, no permission mode).
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const REPO = '/Users/sherifmatta/Learnings/bmad-harness'
const OUT = new URL('.', import.meta.url).pathname
const src = readFileSync(`${REPO}/src/main/sources/session/session-process.ts`, 'utf8')
const block = src.match(/SESSION_ARGS: readonly string\[\] = \[([\s\S]*?)\]/)[1]
const ARGS = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
if (ARGS.some((a) => /permission|model|system-prompt/.test(a))) throw new Error('argv not the product argv')

function subject(name) {
  const dir = join(OUT, 'subjects', name)
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

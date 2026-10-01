#!/usr/bin/env node
// Records one real `claude` session as a replay-corpus fixture.
//
// The fixture is the CLI's stdout byte for byte, one frame per line. Nothing is
// parsed into domain events on the way to disk: the corpus has to outlive any
// later change to the contract. The only parsing here is what the recorder needs
// to drive the session (turn boundaries, the size of an in-flight write).
//
//   node scripts/record-run.mjs --scenario fast-path --subject <dir> \
//     --turns <turns.json> [--out fixtures/runs] [--interrupt sigint|inband] \
//     [--interrupt-after-bytes 20000] [--permission-mode bypassPermissions] \
//     [--end-after-scripted] [--claude-arg <extra flag or value>]...
//
// Turns after the scripted ones can be fed to a live recording by dropping
// `<n>.txt` files into `<out>/<scenario>.inbox/`; the recorder sends each as the
// next turn once the current one has produced its `result` row. An empty file
// named `end` closes the session.

import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

const FLAGS = [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--include-partial-messages',
  '--verbose',
  '--setting-sources', 'project,local',
]

const { values } = parseArgs({
  options: {
    scenario: { type: 'string' },
    subject: { type: 'string' },
    turns: { type: 'string' },
    out: { type: 'string', default: 'fixtures/runs' },
    interrupt: { type: 'string' },
    'interrupt-after-bytes': { type: 'string', default: '20000' },
    'interrupt-tool': { type: 'string', default: 'Write' },
    'permission-mode': { type: 'string', default: 'bypassPermissions' },
    model: { type: 'string' },
    'claude-arg': { type: 'string', multiple: true, default: [] },
    'end-after-scripted': { type: 'boolean', default: false },
    note: { type: 'string', multiple: true, default: [] },
  },
})

for (const required of ['scenario', 'subject', 'turns']) {
  if (!values[required]) {
    console.error(`record-run: --${required} is required`)
    process.exit(2)
  }
}

const outDir = resolve(values.out)
const subject = resolve(values.subject)
const scripted = JSON.parse(readFileSync(values.turns, 'utf8'))
const base = join(outDir, values.scenario)
const inbox = `${base}.inbox`
mkdirSync(outDir, { recursive: true })
rmSync(inbox, { recursive: true, force: true })
mkdirSync(inbox)

const args = [...FLAGS, '--permission-mode', values['permission-mode']]
if (values.model) args.push('--model', values.model)
args.push(...values['claude-arg'])

const frames = createWriteStream(`${base}.jsonl`)
const stderrLog = createWriteStream(`${base}.stderr.log`)
const child = spawn('claude', args, { cwd: subject, stdio: ['pipe', 'pipe', 'pipe'] })
child.stderr.pipe(stderrLog)

const meta = {
  scenario: values.scenario,
  recordedAt: new Date().toISOString(),
  claudeVersion: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
  argv: ['claude', ...args],
  // The contract is declared in a later story; until then the stamp is explicit
  // about being absent rather than inventing a version.
  contractVersion: null,
  cwd: subject,
  interrupt: values.interrupt ?? null,
  notes: values.note,
  turns: [],
}

let lineNo = 0
let resultCount = 0
let sentCount = 0
let inboxCount = 0
let ended = false
let interrupted = false
const toolAt = new Map()
const bytesAt = new Map()

function send(text) {
  const frame = { type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }
  meta.turns.push({ afterLine: lineNo, text })
  sentCount += 1
  child.stdin.write(`${JSON.stringify(frame)}\n`)
  console.error(`[record] turn ${sentCount} sent at line ${lineNo}: ${text.slice(0, 80).replace(/\s+/g, ' ')}`)
}

function interrupt() {
  if (interrupted) return
  interrupted = true
  meta.interruptedAtLine = lineNo
  if (values.interrupt === 'sigint') {
    console.error(`[record] SIGINT at line ${lineNo}`)
    child.kill('SIGINT')
  } else {
    console.error(`[record] in-band interrupt at line ${lineNo}`)
    const request = { type: 'control_request', request_id: `rec-${lineNo}`, request: { subtype: 'interrupt' } }
    meta.turns.push({ afterLine: lineNo, control: request })
    child.stdin.write(`${JSON.stringify(request)}\n`)
  }
}

function inspect(line) {
  let frame
  try {
    frame = JSON.parse(line)
  } catch {
    return
  }
  if (frame.type === 'system' && frame.subtype === 'init') {
    meta.model = frame.model
    meta.claudeSessionId = frame.session_id
  }
  if (frame.type === 'result') {
    // A session also takes turns nobody sent (a background subagent finishing
    // wakes the main thread), so result rows cannot be matched to sends 1:1.
    resultCount += 1
    if (sentCount < scripted.length && resultCount >= sentCount) send(scripted[sentCount])
    else if (values['end-after-scripted']) end()
    else pollInbox()
    return
  }
  if (frame.type !== 'stream_event' || frame.parent_tool_use_id) return
  const ev = frame.event
  if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
    toolAt.set(ev.index, ev.content_block.name)
    bytesAt.set(ev.index, 0)
  } else if (ev?.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta') {
    const total = (bytesAt.get(ev.index) ?? 0) + ev.delta.partial_json.length
    bytesAt.set(ev.index, total)
    const limit = Number(values['interrupt-after-bytes'])
    if (values.interrupt && !interrupted && toolAt.get(ev.index) === values['interrupt-tool'] && total >= limit) interrupt()
  }
}

let polling = false
let pollTimer = null
function pollInbox() {
  if (ended || polling) return
  polling = true
  const timer = setInterval(() => {
    if (existsSync(join(inbox, 'end'))) {
      clearInterval(timer)
      polling = false
      end()
      return
    }
    const next = readdirSync(inbox).filter((f) => /^\d+\.txt$/.test(f)).sort()[0]
    if (!next) return
    clearInterval(timer)
    polling = false
    const text = readFileSync(join(inbox, next), 'utf8')
    rmSync(join(inbox, next))
    inboxCount += 1
    send(text)
  }, 1000)
  pollTimer = timer
}

function end() {
  if (ended) return
  ended = true
  child.stdin.end()
}

createInterface({ input: child.stdout }).on('line', (line) => {
  frames.write(`${line}\n`)
  lineNo += 1
  inspect(line)
})

child.on('close', (code, signal) => {
  clearInterval(pollTimer)
  meta.exit = { code, signal }
  meta.lines = lineNo
  meta.resultRows = resultCount
  meta.inboxTurns = inboxCount
  meta.finishedAt = new Date().toISOString()
  frames.end()
  stderrLog.end()
  writeFileSync(`${base}.meta.json`, `${JSON.stringify(meta, null, 2)}\n`)
  rmSync(inbox, { recursive: true, force: true })
  console.error(`[record] done: ${lineNo} frames, ${resultCount} result rows, exit ${code ?? signal}`)
})

send(scripted[0])

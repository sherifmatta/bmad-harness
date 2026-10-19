// Probe: what does a persona seat do with a later message when it was never activated?
// usage: node probe.mjs <label> <turn1> <turn2> ; writes <label>.jsonl next to this file
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [label, turn1, turn2] = process.argv.slice(2)
const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--setting-sources', 'project,local', '--permission-prompt-tool', 'stdio', '--max-budget-usd', '1.5']
const child = spawn('claude', args, { cwd: '/Users/sherifmatta/Learnings/bmad-harness', stdio: ['pipe', 'pipe', 'ignore'] })
const frames = []
const texts = []
let results = 0
let held = ''
const turns = [turn1, turn2]
const send = (text) => child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n')
send(turns[0])
child.stdout.on('data', (chunk) => {
  held += chunk.toString()
  let at
  while ((at = held.indexOf('\n')) !== -1) {
    const line = held.slice(0, at)
    held = held.slice(at + 1)
    let frame
    try { frame = JSON.parse(line) } catch { continue }
    frames.push(frame)
    if (frame.type === 'control_request' && frame.request?.subtype === 'can_use_tool') {
      // read-only policy: allow Read/Glob/Grep/Skill, deny everything else
      const ok = ['Read', 'Glob', 'Grep', 'Skill'].includes(frame.request.tool_name)
      child.stdin.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: frame.request_id, response: ok ? { behavior: 'allow', updatedInput: frame.request.input } : { behavior: 'deny', message: 'probe: read-only' } } }) + '\n')
    }
    if (frame.type === 'assistant' && frame.message?.content) {
      for (const block of frame.message.content) if (block.type === 'text') texts.push({ turn: results, text: block.text })
    }
    if (frame.type === 'result') {
      results += 1
      if (results < turns.length) send(turns[results])
      else { child.kill('SIGKILL') }
    }
  }
})
child.on('close', () => {
  writeFileSync(new URL(`./${label}.jsonl`, import.meta.url), frames.map((f) => JSON.stringify(f)).join('\n'))
  console.log(JSON.stringify({ label, results, texts }, null, 2))
  process.exit(0)
})
setTimeout(() => { child.kill('SIGKILL') }, 240000)

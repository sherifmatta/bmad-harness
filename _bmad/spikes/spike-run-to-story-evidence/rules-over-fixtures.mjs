// Run from the repo root: node _bmad/spikes/spike-run-to-story-evidence/rules-over-fixtures.mjs
// Reads fixtures/runs/*.jsonl and *.meta.json (unparseable stream lines are skipped). Applies the three candidate run-to-story rules to the raw recordings in fixtures/runs/ and prints one JSON line each.
import fs from 'node:fs'
const SPEC = /(?:^|\/)spec-(\d{1,2})-(\d{1,2})-[a-z0-9-]+\.md$/
const SS = /sprint-status\.ya?ml/
const TURN = /\bstory\s+\d{1,2}\.\d{1,2}\b|\b\d{1,2}-\d{1,2}-[a-z][a-z0-9-]+\b/i
// Positive control: the rules must fire on a known story write, or a 0 below means nothing.
const control = '_bmad/implementation-artifacts/spec-6-1-what-a-run-knows-about-its-story.md'
if (!SPEC.test(control) || !SS.test('_bmad/implementation-artifacts/sprint-status.yaml') || !TURN.test('build story 6.1')) throw new Error('rule control failed')
for (const f of fs.readdirSync('fixtures/runs').filter((x) => x.endsWith('.jsonl'))) {
  const writes = []
  const bashMd = new Set()
  const turns = []
  let ssWrites = 0
  const meta = JSON.parse(fs.readFileSync('fixtures/runs/' + f.replace('.jsonl', '.meta.json'), 'utf8'))
  for (const t of meta.turns || []) turns.push(t.text) // the harness's own turns live in meta, not the stream
  let frames = 0
  for (const l of fs.readFileSync('fixtures/runs/' + f, 'utf8').split('\n').filter(Boolean)) {
    let o
    try { o = JSON.parse(l) } catch { continue }
    frames++
    const c = o.message?.content
    if (o.type === 'user' && !o.parent_tool_use_id) {
      if (typeof c === 'string') turns.push(c)
      else if (Array.isArray(c)) for (const p of c) if (p.type === 'text') turns.push(p.text)
    }
    if (o.type === 'assistant' && Array.isArray(c)) for (const p of c) if (p.type === 'tool_use') {
      const i = p.input || {}
      if ((p.name === 'Write' || p.name === 'Edit') && i.file_path) {
        writes.push(i.file_path)
        if (SS.test(i.file_path)) ssWrites++
      }
      if (p.name === 'Bash' && i.command) {
        if (SS.test(i.command)) ssWrites++
        for (const m of i.command.match(/[\w./-]+\.md/g) || []) bashMd.add(m)
      }
    }
  }
  const named = writes.filter((p) => SPEC.test(p)) // written paths only: a Bash-mentioned path may only have been read
  console.log(JSON.stringify({
    fixture: f, frames, distinctWrittenPaths: new Set(writes).size, bashMentionedMd: bashMd.size,
    ruleA_pathNamesStory: named.slice(-1), ruleB_sprintStatusWrites: ssWrites,
    ruleC_turnNamesStory: turns.filter((t) => TURN.test(t)).map((t) => t.slice(0, 60)), userTurns: turns.length
  }))
}

// The memlogs: story-key lines and sprint-status mentions, counted so the note's claim can be re-run.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d + '/' + e.name) : e.name === '.memlog.md' ? [d + '/' + e.name] : [])
for (const m of walk('_bmad')) {
  const t = fs.readFileSync(m, 'utf8')
  console.log(JSON.stringify({ memlog: m, storyKeyLines: (t.match(/(^|[^0-9])\d{1,2}-\d{1,2}-[a-z]/gm) || []).length, sprintStatusMentions: (t.match(/sprint-status/g) || []).length }))
}

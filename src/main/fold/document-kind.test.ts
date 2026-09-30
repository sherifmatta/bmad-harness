import { describe, expect, it } from 'vitest'
import { documentKindFor } from './document-kind'

describe('documentKindFor', () => {
  it.each([
    ['_bmad/planning-artifacts/prd.md', 'markdown'],
    ['_bmad/notes.markdown', 'markdown'],
    ['_bmad/README.MD', 'markdown'],
    ['_bmad/x/Notes.Markdown', 'markdown'],
    ['_bmad/planning-artifacts/.memlog.md', 'markdown'],
    ['_bmad/config.toml', 'text'],
    ['_bmad/scripts/memlog.py', 'text'],
    ['_bmad/LICENSE', 'text'],
    ['_bmad/md', 'text'],
    ['_bmad/.md', 'text'],
    ['_bmad/archive.md.bak', 'text'],
    ['_bmad/dir.md/file.txt', 'text']
  ])('reads %s as %s', (path, kind) => {
    expect(documentKindFor(path)).toBe(kind)
  })
})

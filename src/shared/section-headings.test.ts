import { describe, expect, it } from 'vitest'
import { scanHeadings, sectionHeadings } from './section-headings'

describe('scanHeadings', () => {
  it('names each level-2 heading with the offset of its line', () => {
    const text = ['# Title', '## Goals', 'words', '```', '## Fenced', '```', '   ## Scope  ', ''].join('\n')
    const found = scanHeadings(text)
    expect(found.map(({ name }) => name)).toEqual(['Goals', 'Scope'])
    expect(found.map(({ offset }) => text.slice(offset, offset + 4))).toEqual(['## G', '   #'])
    expect(sectionHeadings(text)).toEqual(['Goals', 'Scope'])
  })

  it('counts a CRLF line end as two characters', () => {
    const text = '# T\r\n## A\r\nx\r\n## B'
    expect(scanHeadings(text).map(({ offset }) => offset)).toEqual([5, text.indexOf('## B')])
  })

  it('reads the headings inside fences when asked, and only those', () => {
    const text = ['## Outside', '```markdown', '## 1. Inside', '```', '~~~', '## Tilde', '~~~', '## Also Outside'].join('\n')
    expect(scanHeadings(text, 'inside').map(({ name }) => name)).toEqual(['1. Inside', 'Tilde'])
    expect(scanHeadings(text, 'outside').map(({ name }) => name)).toEqual(['Outside', 'Also Outside'])
  })

  it('answers [] for empty text', () => {
    expect(scanHeadings('')).toEqual([])
    expect(scanHeadings('', 'inside')).toEqual([])
  })
})

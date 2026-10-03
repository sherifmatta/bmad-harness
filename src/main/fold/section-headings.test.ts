import { describe, expect, it } from 'vitest'
import { sectionHeadings } from './section-headings'

describe('sectionHeadings', () => {
  it('reads the level-2 headings in order, and no other level', () => {
    const text = ['# Title', '', '## Goals', 'text', '### Detail', '## Scope', '#### Deep', '##NoSpace'].join('\n')
    expect(sectionHeadings(text)).toEqual(['Goals', 'Scope'])
  })

  it('strips emphasis, closing hashes and surrounding space', () => {
    const text = ['## **Goals**', '##   _Scope_  ', '## `code` name ##', '## 1. *Vision* and __Bets__'].join('\n')
    expect(sectionHeadings(text)).toEqual(['Goals', 'Scope', 'code name', '1. Vision and Bets'])
  })

  it('reads no heading inside a fenced code block, of either fence', () => {
    const text = [
      '## Before',
      '```md',
      '## Not a section',
      '```',
      '~~~~',
      '## Nor this',
      '~~~',
      '## Still inside: the fence was four tildes',
      '~~~~',
      '## After'
    ].join('\n')
    expect(sectionHeadings(text)).toEqual(['Before', 'After'])
  })

  it('treats an unclosed fence as running to the end', () => {
    expect(sectionHeadings('## One\n```\n## Two')).toEqual(['One'])
  })

  it('allows up to three spaces of indent and no more, and CRLF line ends', () => {
    expect(sectionHeadings('   ## Three\r\n    ## Four\r\n## Five')).toEqual(['Three', 'Five'])
  })

  it('keeps nothing that is empty once stripped, and answers [] for empty text', () => {
    expect(sectionHeadings('##\n## **\n## ##')).toEqual([])
    expect(sectionHeadings('')).toEqual([])
  })

  it('keeps a repeated heading each time it appears', () => {
    expect(sectionHeadings('## A\n## A')).toEqual(['A', 'A'])
  })

  it('is not closed by a fence line carrying an info string: nested code stays code', () => {
    const text = ['## Before', '````md', '```js', '## Not a section', '```', '## Nor this', '````', '## After'].join('\n')
    expect(sectionHeadings(text)).toEqual(['Before', 'After'])
    expect(sectionHeadings('```\n```js\n## Inside\n```  \n## Outside')).toEqual(['Outside'])
  })

  it('keeps an underscore inside a word, and strips one that marks emphasis', () => {
    expect(sectionHeadings('## Non_Goals\n## _Scope_ and __Bets__\n## snake_case_name')).toEqual([
      'Non_Goals',
      'Scope and Bets',
      'snake_case_name'
    ])
  })
})

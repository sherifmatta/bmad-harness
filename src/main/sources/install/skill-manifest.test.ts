import { describe, expect, it } from 'vitest'
import { parseCsv, readSkillManifest } from './skill-manifest'

describe('parseCsv', () => {
  it('reads rows and fields', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('keeps commas inside a quoted field', () => {
    expect(parseCsv('"a, b",c')).toEqual([['a, b', 'c']])
  })

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('"say ""hi"", then go",x')).toEqual([['say "hi", then go', 'x']])
  })

  it('reads CRLF line breaks and ends cleanly after a trailing one', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
    expect(parseCsv('a\n')).toEqual([['a']])
    expect(parseCsv('a')).toEqual([['a']])
  })

  it('keeps a line break inside a quoted field', () => {
    expect(parseCsv('"one\ntwo",x\nnext,y')).toEqual([['one\ntwo', 'x'], ['next', 'y']])
    expect(parseCsv('"one\r\ntwo",x')).toEqual([['one\r\ntwo', 'x']])
  })

  it('keeps empty fields, quoted or not', () => {
    expect(parseCsv('a,,"",d\n')).toEqual([['a', '', '', 'd']])
  })

  it('has no rows for no text and drops a leading byte-order mark', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\uFEFFa,b')).toEqual([['a', 'b']])
  })

  it('leaves a blank line as a row with one empty field, for the fold to skip', () => {
    expect(parseCsv('a\n\nb\n')).toEqual([['a'], [''], ['b']])
  })
})

describe('readSkillManifest', () => {
  it('reads the manifest of the project it is given and parses it', async () => {
    const paths: string[] = []
    const rows = await readSkillManifest('/proj', async (path) => {
      paths.push(path)
      return 'name,description\n"x","a, b"\n'
    })

    expect(rows).toEqual([
      ['name', 'description'],
      ['x', 'a, b']
    ])
    expect(paths).toEqual(['/proj/_bmad/_config/skill-manifest.csv'])
  })

  it('answers no rows when the read fails, and does not reject', async () => {
    await expect(
      readSkillManifest('/proj', () => Promise.reject(new Error('ENOENT')))
    ).resolves.toEqual([])
    await expect(
      readSkillManifest('/proj', () => {
        throw new Error('sync')
      })
    ).resolves.toEqual([])
  })

  it('answers no rows for a manifest that does not exist', async () => {
    await expect(readSkillManifest('/definitely/not/a/project')).resolves.toEqual([])
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: { showItemInFolder: vi.fn() } }))

const { openInEditor, openInEditorCommand, revealInFinder } = await import('./macos-escapes')

const OPEN = { fullPath: '/work/falcon/_bmad/prd.md', refused: false }
const REFUSED = { fullPath: '/work/falcon/_bmad/link.md', refused: true }

describe('revealInFinder', () => {
  it('shows the very path it was given in Finder', () => {
    const showItemInFolder = vi.fn()

    expect(revealInFinder(OPEN, { showItemInFolder })).toBe(true)
    expect(showItemInFolder).toHaveBeenCalledExactlyOnceWith('/work/falcon/_bmad/prd.md')
  })

  it('does nothing for a refused document', () => {
    const showItemInFolder = vi.fn()

    expect(revealInFinder(REFUSED, { showItemInFolder })).toBe(false)
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('turns a failure into one diagnostic line and throws nothing', () => {
    const writeDiagnostic = vi.fn()

    expect(() =>
      revealInFinder(OPEN, {
        showItemInFolder: () => {
          throw new Error('no finder')
        },
        writeDiagnostic
      })
    ).not.toThrow()
    expect(writeDiagnostic).toHaveBeenCalledExactlyOnceWith('doc/reveal · no finder')
  })
})

describe('openInEditor', () => {
  it('runs open -t with the path as one argument, never through a shell string', () => {
    const run = vi.fn()

    expect(openInEditor(OPEN, { execFile: run })).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0].slice(0, 2)).toEqual(['open', ['-t', '/work/falcon/_bmad/prd.md']])
    expect(openInEditorCommand('/a b/c;rm -rf.md')).toEqual({
      file: 'open',
      args: ['-t', '/a b/c;rm -rf.md']
    })
  })

  it('does nothing for a refused document', () => {
    const run = vi.fn()

    expect(openInEditor(REFUSED, { execFile: run })).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('writes one diagnostic line when open fails, and nothing when it succeeds', () => {
    const writeDiagnostic = vi.fn()
    const failing = (_file: string, _args: string[], callback: (error: Error | null) => void) =>
      callback(new Error('exit 1'))
    const succeeding = (_file: string, _args: string[], callback: (error: Error | null) => void) =>
      callback(null)

    openInEditor(OPEN, { execFile: succeeding, writeDiagnostic })
    expect(writeDiagnostic).not.toHaveBeenCalled()

    openInEditor(OPEN, { execFile: failing, writeDiagnostic })
    expect(writeDiagnostic).toHaveBeenCalledExactlyOnceWith('doc/open-in-editor · exit 1')
  })

  it('does not throw when starting the process throws', () => {
    const writeDiagnostic = vi.fn()

    expect(() =>
      openInEditor(OPEN, {
        execFile: () => {
          throw new Error('spawn failed')
        },
        writeDiagnostic
      })
    ).not.toThrow()
    expect(writeDiagnostic).toHaveBeenCalledWith('doc/open-in-editor · spawn failed')
  })
})

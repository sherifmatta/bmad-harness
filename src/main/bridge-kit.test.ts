import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
  BrowserWindow: { fromWebContents: () => null }
}))

const { failure, noProject, senderOf, sendTo, unexpected } = await import('./bridge-kit')

describe('failure', () => {
  it('wraps an envelope as a refused reply', () => {
    const error = { code: 'x/y', message: 'x · y' }

    expect(failure(error)).toEqual({ ok: false, error })
  })
})

describe('noProject', () => {
  it.each(['install', 'rail', 'doc', 'session', 'conversation'])('is %s/no-project in the bridge’s own words', (prefix) => {
    expect(noProject(prefix)).toEqual({
      ok: false,
      error: { code: `${prefix}/no-project`, message: `${prefix} · no project is open for this window` }
    })
  })
})

describe('unexpected', () => {
  it('replies with the class name alone and writes the cause to the diagnostic line', () => {
    const lines: string[] = []

    expect(unexpected('rail', new RangeError('secret path /x'), (line) => lines.push(line))).toEqual({
      ok: false,
      error: { code: 'rail/unexpected', message: 'rail · unexpected failure', detail: 'RangeError' }
    })
    expect(lines).toEqual(['rail/unexpected · secret path /x'])
  })

  it('names a thrown non-error "unknown" and writes it as text', () => {
    const lines: string[] = []

    expect(unexpected('doc', 'boom', (line) => lines.push(line))).toMatchObject({
      error: { code: 'doc/unexpected', detail: 'unknown' }
    })
    expect(lines).toEqual(['doc/unexpected · boom'])
  })
})

describe('sendTo', () => {
  it('sends to a window that is there, and says nothing to a destroyed one', () => {
    const sent: unknown[][] = []
    let destroyed = false
    const sender = {
      send: (...args: unknown[]) => void sent.push(args),
      isDestroyed: () => destroyed
    }

    sendTo(sender, 'a:b', { n: 1 })
    destroyed = true
    sendTo(sender, 'a:b', { n: 2 })

    expect(sent).toEqual([['a:b', { n: 1 }]])
  })
})

describe('senderOf', () => {
  it('is the event’s own sender', () => {
    const sender = { id: 4 }

    expect(senderOf({ sender } as never)).toBe(sender)
  })
})

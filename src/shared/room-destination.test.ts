import { describe, expect, it } from 'vitest'

import { roomDestination, roomSlug, roomTopicOf } from './room-destination'

describe('roomTopicOf', () => {
  it('is the first non-blank line, whitespace collapsed and trimmed', () => {
    expect(roomTopicOf('  Payouts —\nextend billing-svc?  ')).toBe('Payouts —')
    expect(roomTopicOf('\n \n\t a   b \t c\nsecond')).toBe('a b c')
  })

  it('is cut to 80 characters, with no trailing space', () => {
    expect(roomTopicOf('x'.repeat(200))).toBe('x'.repeat(80))
    expect(roomTopicOf(`${'x'.repeat(79)} yyyy`)).toBe('x'.repeat(79))
  })

  it('has none for a message with no text', () => {
    expect(roomTopicOf('')).toBe('')
    expect(roomTopicOf(' \n\t\n ')).toBe('')
  })

  it('keeps a character whole', () => {
    expect(roomTopicOf('🎉'.repeat(100))).toBe('🎉'.repeat(80))
  })
})

describe('roomSlug', () => {
  it('lower-cases and joins runs of other characters with one hyphen', () => {
    expect(roomSlug('Payouts — extend billing-svc?')).toBe('payouts-extend-billing-svc')
  })

  it('is cut to 48 characters and a cut that lands on a hyphen drops it', () => {
    const slug = roomSlug('Payouts — extend billing-svc, or stand up the ledger now?')
    expect(slug).toBe('payouts-extend-billing-svc-or-stand-up-the-ledge')
    expect(roomSlug(`${'a'.repeat(47)} b`)).toBe('a'.repeat(47))
  })

  it('is empty when nothing of a-z0-9 is left', () => {
    expect(roomSlug('🎉🎉')).toBe('')
    expect(roomSlug('')).toBe('')
  })
})

describe('roomDestination', () => {
  it('is the golden path of the spec', () => {
    expect(
      roomDestination(
        Date.parse('2026-10-08T14:31:00'),
        'Payouts — extend billing-svc, or stand up the ledger now?',
        '_bmad/'
      )
    ).toBe('_bmad/party/2026-10-08-payouts-extend-billing-svc-or-stand-up-the-ledge.md')
  })

  it('dates by the local calendar day of the open', () => {
    expect(roomDestination(new Date(2026, 0, 2, 0, 5).getTime(), 'a', '_bmad/')).toBe('_bmad/party/2026-01-02-a.md')
    expect(roomDestination(new Date(2026, 11, 31, 23, 59).getTime(), 'a', '_bmad/')).toBe('_bmad/party/2026-12-31-a.md')
  })

  it('keeps the literal <topic> when there is no slug', () => {
    const at = Date.parse('2026-10-08T14:31:00')
    expect(roomDestination(at, undefined, '_bmad/')).toBe('_bmad/party/2026-10-08-<topic>.md')
    expect(roomDestination(at, '🎉🎉', '_bmad/')).toBe('_bmad/party/2026-10-08-<topic>.md')
  })

  it('leaves <date> for an open that is no instant', () => {
    expect(roomDestination(undefined, 'a', '_bmad/')).toBe('_bmad/party/<date>-a.md')
    expect(roomDestination(Number.NaN, 'a', '_bmad/')).toBe('_bmad/party/<date>-a.md')
  })

  it('puts the party directory under whatever folder it is given, and keeps the filename rules', () => {
    const at = Date.parse('2026-10-08T14:31:00')
    expect(roomDestination(at, 'Payouts', 'docs/out/')).toBe('docs/out/party/2026-10-08-payouts.md')
    expect(roomDestination(at, undefined, '_bmad-output/')).toBe('_bmad-output/party/2026-10-08-<topic>.md')
    expect(roomDestination(undefined, 'a', 'a/b/c/')).toBe('a/b/c/party/<date>-a.md')
  })
})

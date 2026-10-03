import { describe, expect, it } from 'vitest'
import { errnoName, errnoOf } from './errno'

describe('errnoName', () => {
  it.each(['ENOENT', 'EACCES', 'E_2BIG'])('passes %s', (code) => {
    expect(errnoName(code)).toBe(code)
  })

  it.each([undefined, null, 4, '', 'has space', '/etc/passwd', 'a'.repeat(33)])('falls back for %j', (code) => {
    expect(errnoName(code)).toBe('failed')
    expect(errnoName(code, 'UNKNOWN')).toBe('UNKNOWN')
  })
})

describe('errnoOf', () => {
  it('reads the code of a thrown error', () => {
    expect(errnoOf(Object.assign(new Error('x'), { code: 'EPIPE' }))).toBe('EPIPE')
  })

  it.each([undefined, null, 'ENOENT', new Error('no code'), { code: 5 }])('falls back for %j', (error) => {
    expect(errnoOf(error)).toBe('failed')
    expect(errnoOf(error, 'UNKNOWN')).toBe('UNKNOWN')
  })
})

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as channels from '../src/shared/channels'

/**
 * Item 23 of the Epic 2 retro: every IPC channel is spelled once, in
 * `src/shared/channels.ts`, and each bridge and preload reads it from there.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '')

const shipping = filesUnder(SRC).filter(
  (path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts')
)

describe('the channels', () => {
  const literals = Object.values(channels)

  it('are twenty, and distinct', () => {
    expect(literals).toHaveLength(20)
    expect(new Set(literals).size).toBe(20)
  })

  // `rail:changed` is also the name of the event the rail projection raises,
  // which the persona states fold; that is an event name and not a channel.
  const ALSO_AN_EVENT: Record<string, string[]> = {
    'rail:changed': ['src/main/fold/persona-state.ts', 'src/main/rail-bridge.ts', 'src/shared/events.ts']
  }

  it.each(literals)('spell %s once in src outside tests', (literal) => {
    const spellings = shipping
      .filter((path) => code(path).includes(`'${literal}'`))
      .map((path) => relative(ROOT, path))
      .filter((path) => !(ALSO_AN_EVENT[literal] ?? []).includes(path))

    expect(spellings).toEqual(['src/shared/channels.ts'])
  })

  it('hold nothing but string constants', () => {
    const body = code(join(SRC, 'shared/channels.ts'))

    expect(body).not.toMatch(/\bimport\b|\bfunction\b|=>/)
  })
})

describe('the bridge skeleton (item 23)', () => {
  const BRIDGES = ['install-bridge', 'rail-bridge', 'doc-bridge', 'session-bridge'].map(
    (name) => join(SRC, 'main', `${name}.ts`)
  )

  it('is defined once in bridge-kit: no bridge declares its own failure envelope, Sender or errno mapping', () => {
    for (const path of BRIDGES) {
      const text = code(path)
      expect(text, path).toMatch(/from '\.\/bridge-kit'/)
      expect(text, path).not.toMatch(/function failure\(|\btype Sender\b|\bas unknown as Sender\b/)
      expect(text, path).not.toMatch(/\.constructor\.name|process\.stderr/)
    }
    // One errno mapping, in sources/errno.ts: nothing else reads an error's code for a detail.
    const errnoReaders = shipping
      .filter((path) => /typeof code === 'string'|\.code\b[^\n]*\?\? 'failed'|ERRNO\s*=/.test(code(path)))
      .map((path) => relative(ROOT, path))
    expect(errnoReaders).toEqual(['src/main/sources/errno.ts'])
  })

  it('keeps each handler registered by a raw ipcMain.handle in its own bridge', () => {
    for (const path of [...BRIDGES, join(SRC, 'main/project-bridge.ts')]) {
      expect(code(path), path).toMatch(/ipcMain\.handle\(/)
    }
  })

  /** Lines from each function or handler's opening line to the line that closes it at the same indent. */
  function spans(path: string): { opening: string; lines: number }[] {
    const lines = code(path).split('\n')
    const found: { opening: string; lines: number }[] = []
    lines.forEach((line, at) => {
      if (!/^\s*(?:export )?(?:async )?function \w+|^\s*ipcMain\.handle\(/.test(line)) return
      const indent = /^\s*/.exec(line)?.[0] ?? ''
      let end = at + 1
      while (end < lines.length && !(lines[end].startsWith(`${indent}}`) || lines[end].startsWith(`${indent})`))) {
        end += 1
      }
      found.push({ opening: line.trim(), lines: end - at + 1 })
    })
    return found
  }

  it.each(['session-bridge', 'session-registry', 'session-handoff'])(
    'leaves no function or handler in %s over 150 lines',
    (name) => {
      const found = spans(join(SRC, 'main', `${name}.ts`))

      expect(found.length).toBeGreaterThan(0)
      for (const { opening, lines } of found) {
        expect(lines, opening).toBeLessThanOrEqual(150)
      }
    }
  )
})

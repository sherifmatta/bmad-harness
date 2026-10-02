import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Story 2.6's motion promises, read from the stylesheets themselves: under
 * reduced motion the `work` dot keeps its amber fill, the pulse stops through
 * the one global rule, and the elapsed counter (a timer, not an animation) is
 * untouched by the media query. The counter's own behaviour under fake time is
 * held by `status-dot.dom.test.tsx`.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

const dot = read('src/renderer/ui/status/status-dot.css')
const tokens = read('src/renderer/design/tokens.css')

describe('the work indicator under reduced motion', () => {
  it('still has the amber fill, which is a ground and not motion', () => {
    const rule = dot.match(/\.status-dot--work\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(rule).toContain('background: var(--amber)')
  })

  it('has its pulse switched off by the one global rule, which turns off animation and transition and nothing else', () => {
    const block = tokens.match(/@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n\}/)?.[1] ?? ''

    expect(block.replace(/\s+/g, '')).toBe(
      '*,*::before,*::after{animation:none!important;transition:none!important}'
    )
  })

  it('adds no keyframes, literal or animation of its own: the pulse is the token', () => {
    expect(dot).toContain('animation: var(--motion-pulse)')
    expect(dot).not.toMatch(/@keyframes|transition:|@media/)
    expect(dot.match(/animation:/g)).toHaveLength(1)
  })

  it('has a counter that does not read the motion preference', () => {
    expect(read('src/renderer/ui/status/status-dot.tsx')).not.toMatch(/matchMedia|prefers-reduced-motion/)
    expect(read('src/renderer/ui/outputs/use-now.ts')).not.toMatch(/matchMedia|prefers-reduced-motion/)
  })
})
